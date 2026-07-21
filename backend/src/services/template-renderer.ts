/**
 * Safe mustache-style rendering for communication templates. The renderer is
 * deliberately tiny: it resolves only plain data paths and never evaluates
 * JavaScript, functions, prototypes, or arbitrary expressions.
 */
export type TemplateVariables = Record<string, unknown>;

export interface RenderTemplateOptions {
  /** Escape values for HTML output. Plain text/SMS callers set this false. */
  escapeHtml?: boolean;
  /** Keep unresolved placeholders visible while an author previews a draft. */
  preserveMissing?: boolean;
}

export interface RenderedCommunicationTemplate {
  subject?: string;
  body: string;
  htmlBody?: string;
}

const TOKEN = /{{{\s*([A-Za-z_][\w.-]*)\s*}}}|{{\s*([A-Za-z_][\w.-]*)\s*}}/g;
const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function renderTemplate(
  template: string | null | undefined,
  variables: TemplateVariables = {},
  options: RenderTemplateOptions = {},
): string {
  if (!template) return '';
  const escapeHtml = options.escapeHtml ?? false;
  return template.replace(TOKEN, (match, rawPath: string | undefined, escapedPath: string | undefined) => {
    const path = rawPath || escapedPath;
    if (!path) return options.preserveMissing ? match : '';
    const value = getTemplateValue(variables, path);
    if (value === undefined || value === null) return options.preserveMissing ? match : '';
    const rendered = templateScalar(value);
    // Triple braces deliberately opt out of HTML escaping; regular braces
    // stay safe by default for HTML templates.
    return escapeHtml && !rawPath ? escapeHtmlValue(rendered) : rendered;
  });
}

export function renderCommunicationTemplate(
  template: { subject?: string | null; body?: string | null; htmlBody?: string | null },
  variables: TemplateVariables = {},
): RenderedCommunicationTemplate {
  return {
    subject: template.subject === undefined || template.subject === null
      ? undefined
      : renderTemplate(template.subject, variables),
    body: renderTemplate(template.body, variables),
    htmlBody: template.htmlBody === undefined || template.htmlBody === null
      ? undefined
      : renderTemplate(template.htmlBody, variables, { escapeHtml: true }),
  };
}

/** Standard variables shared by direct sends, campaigns, and workflow runs. */
export function messagingTemplateVariables(input: {
  contact?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: { id?: string; name?: string | null } | null;
  } | null;
  workspace?: { id?: string; name?: string | null } | null;
  sender?: { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  extra?: TemplateVariables;
}): TemplateVariables {
  const contact = input.contact || {};
  const sender = input.sender || {};
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim();
  return {
    contact: {
      id: contact.id || '',
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      fullName,
      email: contact.email || '',
      phone: contact.phone || '',
      company: { id: contact.company?.id || '', name: contact.company?.name || '' },
    },
    workspace: { id: input.workspace?.id || '', name: input.workspace?.name || '' },
    sender: {
      id: sender.id || '', firstName: sender.firstName || '', lastName: sender.lastName || '', fullName: senderName, email: sender.email || '',
    },
    // Friendly aliases keep initial templates easy to author.
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    fullName,
    email: contact.email || '',
    phone: contact.phone || '',
    company: contact.company?.name || '',
    ...(input.extra || {}),
  };
}

function getTemplateValue(root: TemplateVariables, path: string): unknown {
  const segments = path.split('.');
  if (!segments.length || segments.some((segment) => BLOCKED_PATH_SEGMENTS.has(segment))) return undefined;
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function templateScalar(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function escapeHtmlValue(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] || character));
}
