import axios from 'axios';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

/**
 * Provider boundary for workflow actions that leave the application.  The
 * workflow engine deliberately knows nothing about a particular email, SMS,
 * webhook, or future integration vendor.  Applications can register a real
 * provider during bootstrap without changing workflow execution code.
 */
export type WorkflowProviderType = 'email' | 'sms' | 'webhook';

export interface WorkflowProviderRequest {
  workspaceId: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  /** Stable key that vendors can use to make delivery idempotent. */
  idempotencyKey: string;
  contact?: {
    id: string;
    email?: string | null;
    phone?: string | null;
    firstName?: string;
    lastName?: string;
  } | null;
  config: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface WorkflowProviderResult {
  status: 'queued' | 'sent' | 'delivered';
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowActionProvider {
  readonly type: WorkflowProviderType;
  execute(request: WorkflowProviderRequest): Promise<WorkflowProviderResult>;
}

/** An error that is safe for the workflow queue to retry. */
export class RetryableWorkflowProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableWorkflowProviderError';
  }
}

/**
 * The default email/SMS adapter is intentionally a queue acknowledgement.
 * It makes workflows testable and records a delivery-ready action without
 * pretending a real message was delivered.  A SendGrid/Twilio/etc. adapter
 * can replace it through `workflowProviders.register(...)`.
 */
export class DeferredMessagingProvider implements WorkflowActionProvider {
  constructor(public readonly type: 'email' | 'sms') {}

  async execute(request: WorkflowProviderRequest): Promise<WorkflowProviderResult> {
    return {
      status: 'queued',
      providerMessageId: `workflow-${request.executionId}-${request.nodeId}`,
      metadata: { deferred: true, provider: this.type },
    };
  }
}

/** A small, provider-neutral webhook transport. */
export class HttpWebhookProvider implements WorkflowActionProvider {
  readonly type = 'webhook' as const;

  async execute(request: WorkflowProviderRequest): Promise<WorkflowProviderResult> {
    const urlValue = stringValue(request.config.url ?? request.config.endpoint ?? request.config.value);
    if (!urlValue) throw new Error('Webhook action requires a URL');
    const target = await validateWebhookTarget(urlValue);

    const method = stringValue(request.config.method)?.toUpperCase() || 'POST';
    const headers = safeWebhookHeaders(isRecord(request.config.headers) ? request.config.headers : {});
    const body = request.config.body ?? {
      event: 'workflow.action',
      workspaceId: request.workspaceId,
      workflowId: request.workflowId,
      executionId: request.executionId,
      contact: request.contact,
      payload: request.payload,
    };

    try {
      const response = await axios.request({
        url: target.url.toString(),
        method,
        headers: {
          ...headers,
          'Idempotency-Key': request.idempotencyKey,
        },
        data: body,
        timeout: 10_000,
        // Never follow a redirect to an unvalidated internal target.
        maxRedirects: 0,
        // Pin the validated DNS result for this one request. Without this a
        // hostname could resolve publicly during validation then rebind to an
        // internal address when the HTTP client performs its own lookup.
        httpAgent: target.url.protocol === 'http:' ? new http.Agent({ lookup: target.lookup as any }) : undefined,
        httpsAgent: target.url.protocol === 'https:' ? new https.Agent({ lookup: target.lookup as any }) : undefined,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new RetryableWorkflowProviderError(`Webhook responded with HTTP ${response.status}`);
      }
      return { status: 'sent', metadata: { statusCode: response.status } };
    } catch (error) {
      if (error instanceof RetryableWorkflowProviderError) throw error;
      throw new RetryableWorkflowProviderError('Webhook request failed', error);
    }
  }
}

export class WorkflowProviderRegistry {
  private readonly providers = new Map<WorkflowProviderType, WorkflowActionProvider>();

  register(provider: WorkflowActionProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: WorkflowProviderType): WorkflowActionProvider {
    const provider = this.providers.get(type);
    if (!provider) throw new Error(`No ${type} workflow provider is configured`);
    return provider;
  }
}

export const workflowProviders = new WorkflowProviderRegistry();
workflowProviders.register(new DeferredMessagingProvider('email'));
workflowProviders.register(new DeferredMessagingProvider('sms'));
workflowProviders.register(new HttpWebhookProvider());

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type PinnedTarget = {
  url: URL;
  lookup: (hostname: string, options: unknown, callback: (error: Error | null, address?: string, family?: number) => void) => void;
};

/**
 * Validates and pins webhook DNS resolution. Workspace-configured webhook
 * URLs are user input, so they must never be allowed to reach loopback,
 * private, link-local, multicast, or other non-public network ranges.
 */
async function validateWebhookTarget(value: string): Promise<PinnedTarget> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Webhook action requires a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Webhook URL must use HTTP or HTTPS');
  if (url.username || url.password) throw new Error('Webhook URLs cannot contain credentials');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Webhook URL port is not allowed');

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Webhook URL must use a public host');
  }

  let addresses: Array<{ address: string; family: number }>;
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new RetryableWorkflowProviderError('Webhook host could not be resolved');
    }
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Webhook URL must resolve only to public addresses');
  }
  const pinned = addresses[0];
  return {
    url,
    lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
  };
}

function safeWebhookHeaders(headers: Record<string, unknown>): Record<string, string | number | boolean> {
  const unsafe = new Set([
    'host', 'connection', 'content-length', 'transfer-encoding', 'upgrade',
    'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer',
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
  ]);
  const safe: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (unsafe.has(normalized) || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') safe[name] = value;
  }
  return safe;
}

function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(normalized);
  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // shared address space
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }
  if (family === 6) {
    const bytes = ipv6Bytes(normalized);
    if (!bytes) return false;
    const allZero = bytes.every((byte) => byte === 0);
    const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
    if (allZero || loopback) return false;
    // IPv4-compatible and IPv4-mapped forms must inherit the IPv4 policy,
    // including hexadecimal spellings such as ::ffff:0a00:0001.
    if (bytes.slice(0, 12).every((byte) => byte === 0) || (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff)) {
      return isPublicAddress(bytes.slice(12).join('.'));
    }
    const first = bytes[0];
    if ((first & 0xfe) === 0xfc) return false; // unique-local fc00::/7
    if (first === 0xfe && (bytes[1] & 0xc0) === 0x80) return false; // link local fe80::/10
    if (first === 0xff) return false; // multicast ff00::/8
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return false; // 6to4 can embed private IPv4
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false; // documentation range
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return false; // Teredo
    return true;
  }
  return false;
}

function ipv6Bytes(address: string): number[] | null {
  const sections = address.split('::');
  if (sections.length > 2) return null;
  const expand = (part: string): string[] => part ? part.split(':').filter(Boolean) : [];
  const left = expand(sections[0]);
  const right = sections.length === 2 ? expand(sections[1]) : [];
  const convertEmbeddedIpv4 = (parts: string[]): string[] | null => {
    const last = parts[parts.length - 1];
    if (!last?.includes('.')) return parts;
    if (!isIP(last) || isIP(last) !== 4) return null;
    const octets = last.split('.').map(Number);
    return [...parts.slice(0, -1), ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
  };
  const convertedLeft = convertEmbeddedIpv4(left);
  const convertedRight = convertEmbeddedIpv4(right);
  if (!convertedLeft || !convertedRight) return null;
  const present = convertedLeft.length + convertedRight.length;
  const words = sections.length === 2
    ? [...convertedLeft, ...Array(Math.max(0, 8 - present)).fill('0'), ...convertedRight]
    : convertedLeft;
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
  return words.flatMap((word) => {
    const value = Number.parseInt(word, 16);
    return [(value >> 8) & 0xff, value & 0xff];
  });
}
