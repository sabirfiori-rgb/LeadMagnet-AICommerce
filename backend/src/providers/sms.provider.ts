import axios, { AxiosInstance } from 'axios';
import { MessagingProviderError, ProviderDeliveryReceipt } from './email.provider.js';

export interface SmsProviderRequest {
  to: string;
  body: string;
  from?: string;
  /** Stable key supplied by the durable messaging queue. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SmsProvider {
  readonly type: 'sms';
  readonly name: string;
  isConfigured(): boolean;
  validateConfig(): Promise<void>;
  send(message: SmsProviderRequest): Promise<ProviderDeliveryReceipt>;
}

export interface TwilioSmsProviderOptions {
  accountSid?: string;
  authToken?: string;
  from?: string;
  messagingServiceSid?: string;
  /** Useful for Twilio-compatible gateways and isolated tests. */
  apiBaseUrl?: string;
  httpClient?: AxiosInstance;
}

/**
 * Twilio-compatible adapter. It speaks Twilio's documented Messages API and
 * can point at a compatible gateway by setting SMS_API_BASE_URL. API keys are
 * read only from process.env and are never returned as metadata.
 *
 * Supported environment variables:
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
 * TWILIO_MESSAGING_SERVICE_SID, SMS_API_BASE_URL.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly type = 'sms' as const;
  readonly name = 'twilio';
  private readonly options: TwilioSmsProviderOptions;
  private readonly client: AxiosInstance;

  constructor(options: TwilioSmsProviderOptions = {}) {
    this.options = options;
    this.client = options.httpClient || axios.create({
      timeout: 15_000,
      maxContentLength: 1024 * 1024,
      maxBodyLength: 1024 * 1024,
      validateStatus: () => true,
    });
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): TwilioSmsProvider {
    return new TwilioSmsProvider({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_FROM_NUMBER ?? env.SMS_FROM_NUMBER,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      apiBaseUrl: env.SMS_API_BASE_URL ?? env.TWILIO_API_BASE_URL,
    });
  }

  isConfigured(): boolean {
    return Boolean(
      this.options.accountSid
      && this.options.authToken
      && (this.options.from || this.options.messagingServiceSid),
    );
  }

  async validateConfig(): Promise<void> {
    if (!this.options.accountSid || !this.options.authToken) {
      throw new MessagingProviderError(
        'SMS delivery is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
        { code: 'SMS_PROVIDER_NOT_CONFIGURED' },
      );
    }
    if (!this.options.from && !this.options.messagingServiceSid) {
      throw new MessagingProviderError(
        'Set TWILIO_FROM_NUMBER (or SMS_FROM_NUMBER) or TWILIO_MESSAGING_SERVICE_SID for SMS delivery.',
        { code: 'SMS_SENDER_NOT_CONFIGURED' },
      );
    }
    const endpoint = this.endpoint();
    if (endpoint.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new MessagingProviderError('SMS_API_BASE_URL must use HTTPS in production.', { code: 'SMS_PROVIDER_INVALID_CONFIG' });
    }
  }

  async send(message: SmsProviderRequest): Promise<ProviderDeliveryReceipt> {
    await this.validateConfig();
    if (!isE164PhoneNumber(message.to)) {
      throw new MessagingProviderError('SMS recipients must use E.164 format, for example +14155552671.', { code: 'INVALID_SMS_RECIPIENT' });
    }
    if (!message.body.trim()) {
      throw new MessagingProviderError('An SMS body is required.', { code: 'SMS_BODY_REQUIRED' });
    }
    if (message.body.length > 1_600) {
      throw new MessagingProviderError('SMS body cannot exceed 1600 characters.', { code: 'SMS_BODY_TOO_LONG' });
    }

    const payload = new URLSearchParams({ To: message.to, Body: message.body });
    if (this.options.messagingServiceSid) payload.set('MessagingServiceSid', this.options.messagingServiceSid);
    else payload.set('From', message.from || this.options.from || '');

    try {
      const response = await this.client.post<TwilioMessageResponse>(this.endpoint().toString(), payload, {
        auth: { username: this.options.accountSid!, password: this.options.authToken! },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
        },
      });
      if (response.status < 200 || response.status >= 300) throw twilioHttpError(response.status, response.data);
      const data = response.data || {};
      return {
        status: mapTwilioStatus(data.status),
        providerMessageId: data.sid,
        metadata: {
          status: data.status,
          numSegments: data.num_segments,
          price: data.price,
          priceUnit: data.price_unit,
        },
      };
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as TwilioMessageResponse | undefined;
        if (status) throw twilioHttpError(status, data);
        throw new MessagingProviderError('SMS provider could not be reached.', {
          code: error.code || 'SMS_NETWORK_ERROR', retryable: true, cause: error,
        });
      }
      throw new MessagingProviderError('SMS delivery failed.', { code: 'SMS_DELIVERY_FAILED', retryable: true, cause: error });
    }
  }

  private endpoint(): URL {
    const base = this.options.apiBaseUrl || 'https://api.twilio.com';
    let baseUrl: URL;
    try {
      baseUrl = new URL(base);
    } catch {
      throw new MessagingProviderError('SMS_API_BASE_URL is not a valid URL.', { code: 'SMS_PROVIDER_INVALID_CONFIG' });
    }
    // Construct with URL rather than interpolation so a base path such as
    // https://gateway.example/twilio/ remains well-defined.
    const prefix = baseUrl.pathname.replace(/\/$/, '');
    baseUrl.pathname = `${prefix}/2010-04-01/Accounts/${encodeURIComponent(this.options.accountSid || '')}/Messages.json`;
    baseUrl.search = '';
    return baseUrl;
  }
}

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  num_segments?: string;
  price?: string;
  price_unit?: string;
  code?: number | string;
  message?: string;
}

function twilioHttpError(status: number, data?: TwilioMessageResponse): MessagingProviderError {
  const retryable = status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  return new MessagingProviderError(data?.message || `SMS provider responded with HTTP ${status}.`, {
    code: data?.code ? `TWILIO_${data.code}` : `TWILIO_HTTP_${status}`,
    retryable,
    providerStatus: status,
  });
}

function mapTwilioStatus(status: string | undefined): ProviderDeliveryReceipt['status'] {
  switch ((status || '').toLowerCase()) {
    case 'delivered': return 'delivered';
    case 'failed':
    case 'undelivered': return 'failed';
    case 'queued':
    case 'accepted':
    case 'scheduled': return 'queued';
    default: return 'sent';
  }
}

export function isE164PhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}
