export type ChannelType = 'email' | 'sms' | 'whatsapp' | 'internal';

export interface OutboundMessage {
  to: string;
  body: string;
  attachments?: Array<{ fileName: string; mimeType: string; url: string }>;
}

export interface DeliveryReceipt { providerMessageId?: string; status: 'queued' | 'sent' | 'delivered' | 'failed'; }

/** Implement this interface for SendGrid, Twilio, WhatsApp, or another provider. */
export interface ChannelProvider {
  readonly type: ChannelType;
  send(message: OutboundMessage): Promise<DeliveryReceipt>;
  validateConfig(config: unknown): Promise<void>;
}

/** Internal notes are persisted as messages and deliberately have no external transport. */
export class InternalNoteProvider implements ChannelProvider {
  readonly type: ChannelType = 'internal';
  async send(): Promise<DeliveryReceipt> { return { status: 'sent' }; }
  async validateConfig(): Promise<void> { /* no configuration required */ }
}
