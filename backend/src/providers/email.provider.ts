import nodemailer, { Transporter } from 'nodemailer';

/**
 * The provider contract intentionally contains only delivery concerns.  Data
 * persistence, templates, scheduling, tenant scoping, and unsubscribe policy
 * live in MessagingDeliveryService so another email vendor can be added
 * without duplicating business rules.
 */
export type ProviderDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface OutboundAttachmentInput {
  fileName: string;
  mimeType?: string;
  /**
   * Message content supplied by trusted server-side code. Remote URLs are
   * deliberately not fetched here: doing so would turn user attachment URLs
   * into an SSRF vector. Upload integrations can resolve a stored object into
   * this field before sending.
   */
  content: string | Buffer;
  contentId?: string;
}

export interface EmailProviderRequest {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: OutboundAttachmentInput[];
  /** Stable key supplied by the durable messaging queue. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderDeliveryReceipt {
  status: ProviderDeliveryStatus;
  providerMessageId?: string;
  /** Safe, non-secret provider metadata suitable for an audit log. */
  metadata?: Record<string, unknown>;
}

export interface EmailProvider {
  readonly type: 'email';
  readonly name: string;
  isConfigured(): boolean;
  validateConfig(): Promise<void>;
  send(message: EmailProviderRequest): Promise<ProviderDeliveryReceipt>;
}

/** A typed provider error lets the durable queue decide whether a retry helps. */
export class MessagingProviderError extends Error {
  constructor(
    message: string,
    public readonly options: {
      code?: string;
      retryable?: boolean;
      providerStatus?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'MessagingProviderError';
  }

  get code(): string | undefined { return this.options.code; }
  get retryable(): boolean { return this.options.retryable ?? false; }
  get providerStatus(): number | undefined { return this.options.providerStatus; }
}

export interface SmtpEmailProviderOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  replyTo?: string;
  /** Injection hook used by tests; production uses Nodemailer transport. */
  transporter?: Transporter;
}

/**
 * SMTP / Nodemailer implementation. Credentials are read only from the
 * backend environment and never serialized into a client response or log.
 *
 * Supported environment variables (the SMTP_* names take precedence):
 * SMTP_HOST / EMAIL_HOST, SMTP_PORT / EMAIL_PORT, SMTP_SECURE,
 * SMTP_USER / EMAIL_USER, SMTP_PASS / EMAIL_PASS, SMTP_FROM / EMAIL_FROM,
 * SMTP_REPLY_TO / EMAIL_REPLY_TO.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly type = 'email' as const;
  readonly name = 'smtp';
  private readonly options: SmtpEmailProviderOptions;
  private transporter?: Transporter;

  constructor(options: SmtpEmailProviderOptions = {}) {
    this.options = options;
    this.transporter = options.transporter;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): SmtpEmailProvider {
    const rawPort = env.SMTP_PORT ?? env.EMAIL_PORT ?? '587';
    const parsedPort = Number(rawPort);
    const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535 ? parsedPort : 587;
    const explicitSecure = parseBoolean(env.SMTP_SECURE);
    return new SmtpEmailProvider({
      host: env.SMTP_HOST ?? env.EMAIL_HOST,
      port,
      secure: explicitSecure ?? port === 465,
      user: env.SMTP_USER ?? env.EMAIL_USER,
      pass: env.SMTP_PASS ?? env.EMAIL_PASS,
      from: env.SMTP_FROM ?? env.EMAIL_FROM,
      replyTo: env.SMTP_REPLY_TO ?? env.EMAIL_REPLY_TO,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.options.transporter || (this.options.host && this.options.from));
  }

  async validateConfig(): Promise<void> {
    if (!this.isConfigured()) {
      throw new MessagingProviderError(
        'Email delivery is not configured. Set SMTP_HOST (or EMAIL_HOST) and SMTP_FROM (or EMAIL_FROM).',
        { code: 'EMAIL_PROVIDER_NOT_CONFIGURED' },
      );
    }
    if ((this.options.user && !this.options.pass) || (!this.options.user && this.options.pass)) {
      throw new MessagingProviderError('SMTP_USER and SMTP_PASS must be configured together.', { code: 'EMAIL_PROVIDER_INVALID_CONFIG' });
    }
  }

  async send(message: EmailProviderRequest): Promise<ProviderDeliveryReceipt> {
    await this.validateConfig();
    if (!isEmailAddress(message.to)) {
      throw new MessagingProviderError('A valid email recipient is required.', { code: 'INVALID_EMAIL_RECIPIENT' });
    }
    if (!message.subject.trim()) {
      throw new MessagingProviderError('An email subject is required.', { code: 'EMAIL_SUBJECT_REQUIRED' });
    }
    if (!message.text?.trim() && !message.html?.trim()) {
      throw new MessagingProviderError('Email text or HTML content is required.', { code: 'EMAIL_BODY_REQUIRED' });
    }

    try {
      const transport = this.getTransporter();
      const result = await transport.sendMail({
        from: message.from || this.options.from,
        to: message.to,
        replyTo: message.replyTo || this.options.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map((attachment) => ({
          filename: attachment.fileName,
          content: attachment.content,
          contentType: attachment.mimeType,
          cid: attachment.contentId,
        })),
        // SMTP cannot guarantee idempotency, but this diagnostic header makes
        // retries traceable by downstream systems without exposing secrets.
        headers: message.idempotencyKey ? { 'X-LeadMagnet-Idempotency-Key': message.idempotencyKey } : undefined,
      });

      if (result.rejected?.length) {
        throw new MessagingProviderError(
          `SMTP rejected recipient${result.rejected.length > 1 ? 's' : ''}: ${result.rejected.join(', ')}`,
          { code: 'SMTP_RECIPIENT_REJECTED', retryable: false },
        );
      }
      return {
        status: 'sent',
        providerMessageId: result.messageId,
        metadata: {
          accepted: result.accepted?.length || 0,
          response: result.response || undefined,
        },
      };
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      throw smtpError(error);
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    // validateConfig has already checked host/from; keeping this guard makes
    // the method safe should it be called directly in a future adapter.
    if (!this.options.host) {
      throw new MessagingProviderError('SMTP host is not configured.', { code: 'EMAIL_PROVIDER_NOT_CONFIGURED' });
    }
    this.transporter = nodemailer.createTransport({
      host: this.options.host,
      port: this.options.port || 587,
      secure: this.options.secure ?? false,
      auth: this.options.user && this.options.pass ? { user: this.options.user, pass: this.options.pass } : undefined,
    });
    return this.transporter;
  }
}

function smtpError(error: unknown): MessagingProviderError {
  const candidate = error as { code?: string; responseCode?: number; message?: string } | undefined;
  const responseCode = candidate?.responseCode;
  const retryable = responseCode === undefined || responseCode === 408 || responseCode === 429 || responseCode >= 500;
  return new MessagingProviderError(
    candidate?.message || 'SMTP delivery failed.',
    { code: candidate?.code || 'SMTP_DELIVERY_FAILED', retryable, providerStatus: responseCode, cause: error },
  );
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function isEmailAddress(value: string): boolean {
  // This is deliberately conservative enough for outbound safety while not
  // pretending to be a full RFC parser. SMTP remains the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
