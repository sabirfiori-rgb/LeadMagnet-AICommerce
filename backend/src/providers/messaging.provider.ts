import {
  EmailProvider,
  MessagingProviderError,
  SmtpEmailProvider,
} from './email.provider.js';
import { SmsProvider, TwilioSmsProvider } from './sms.provider.js';

export type MessagingChannel = 'email' | 'sms';
export type AnyMessagingProvider = EmailProvider | SmsProvider;

/**
 * Small dependency-injection boundary for messaging. Tests and future
 * SendGrid/SES/WhatsApp adapters can replace a provider without coupling the
 * routes, automation engine, or durable queue to a vendor.
 */
export class MessagingProviderRegistry {
  private readonly providers = new Map<MessagingChannel, AnyMessagingProvider>();

  register(provider: AnyMessagingProvider): void {
    this.providers.set(provider.type, provider);
  }

  getEmail(): EmailProvider {
    const provider = this.providers.get('email');
    if (!provider || provider.type !== 'email') {
      throw new MessagingProviderError('No email provider is registered.', { code: 'EMAIL_PROVIDER_NOT_REGISTERED' });
    }
    return provider;
  }

  getSms(): SmsProvider {
    const provider = this.providers.get('sms');
    if (!provider || provider.type !== 'sms') {
      throw new MessagingProviderError('No SMS provider is registered.', { code: 'SMS_PROVIDER_NOT_REGISTERED' });
    }
    return provider;
  }

  get(channel: MessagingChannel): AnyMessagingProvider {
    return channel === 'email' ? this.getEmail() : this.getSms();
  }

  status(): Record<MessagingChannel, { configured: boolean; provider: string }> {
    const email = this.providers.get('email');
    const sms = this.providers.get('sms');
    return {
      email: { configured: Boolean(email?.isConfigured()), provider: email?.name || 'none' },
      sms: { configured: Boolean(sms?.isConfigured()), provider: sms?.name || 'none' },
    };
  }
}

/** Default production registry; no API key is embedded in client code. */
export const messagingProviders = new MessagingProviderRegistry();
messagingProviders.register(SmtpEmailProvider.fromEnvironment());
messagingProviders.register(TwilioSmsProvider.fromEnvironment());
