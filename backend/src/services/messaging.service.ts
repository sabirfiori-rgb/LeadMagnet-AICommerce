import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { messagingProviders, type MessagingChannel } from '../providers/messaging.provider.js';
import { MessagingProviderError } from '../providers/email.provider.js';
import { messagingTemplateVariables, renderCommunicationTemplate, type TemplateVariables } from './template-renderer.js';

const prisma = new PrismaClient();
const channels = new Set<MessagingChannel>(['email', 'sms']);

export type SendCommunicationInput = {
  workspaceId: string;
  channel: MessagingChannel;
  contactId?: string | null;
  conversationId?: string | null;
  workflowExecutionId?: string | null;
  createdByUserId?: string | null;
  recipient?: string;
  subject?: string;
  body?: string;
  htmlBody?: string;
  sender?: string;
  replyTo?: string;
  templateId?: string;
  campaignId?: string | null;
  scheduledFor?: Date | string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  variables?: TemplateVariables;
};

type TemplateInput = { name: string; description?: string; subject?: string; htmlBody?: string; textBody?: string; body?: string; variables?: unknown; category?: string; isActive?: boolean };
type CampaignInput = { name: string; description?: string; templateId?: string | null; senderName?: string; fromEmail?: string; replyTo?: string; subject: string; htmlBody: string; textBody?: string; audienceFilter?: unknown; scheduledFor?: Date | string | null };

/**
 * Durable provider-neutral outbound queue. API callers create records first;
 * the processor owns delivery, retries, delivery logs, tracking and timeline
 * records. This makes provider failures observable without leaking secrets.
 */
export class MessagingDeliveryService {
  private poller?: NodeJS.Timeout;

  start(): void {
    if (this.poller) return;
    const pollMs = Math.max(1_000, Number(process.env.MESSAGE_QUEUE_POLL_MS) || 5_000);
    this.poller = setInterval(() => void this.processDueMessages(), pollMs);
    this.poller.unref();
    void this.processDueMessages();
  }

  async createTemplate(workspaceId: string, userId: string, channel: MessagingChannel, input: TemplateInput) {
    this.assertChannel(channel); this.assertTemplate(input, channel);
    const common = { workspaceId, createdByUserId: userId, name: input.name.trim(), description: textOrNull(input.description), variables: asJson(input.variables), category: input.category || 'marketing', isActive: input.isActive ?? true };
    return channel === 'email'
      ? prisma.emailTemplate.create({ data: { ...common, subject: input.subject!.trim(), htmlBody: input.htmlBody!.trim(), textBody: textOrNull(input.textBody) } })
      : prisma.smsTemplate.create({ data: { ...common, body: input.body!.trim() } });
  }

  async updateTemplate(workspaceId: string, channel: MessagingChannel, templateId: string, input: Partial<TemplateInput>) {
    this.assertChannel(channel);
    const data: any = { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: textOrNull(input.description) } : {}), ...(input.variables !== undefined ? { variables: asJson(input.variables) } : {}), ...(input.category !== undefined ? { category: input.category } : {}), ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}) };
    if (channel === 'email') Object.assign(data, input.subject !== undefined ? { subject: input.subject } : {}, input.htmlBody !== undefined ? { htmlBody: input.htmlBody } : {}, input.textBody !== undefined ? { textBody: textOrNull(input.textBody) } : {});
    else if (input.body !== undefined) data.body = input.body;
    const result = channel === 'email'
      ? await prisma.emailTemplate.updateMany({ where: { id: templateId, workspaceId, deletedAt: null }, data })
      : await prisma.smsTemplate.updateMany({ where: { id: templateId, workspaceId, deletedAt: null }, data });
    if (!result.count) throw new Error('Template not found');
    return channel === 'email' ? prisma.emailTemplate.findUnique({ where: { id: templateId } }) : prisma.smsTemplate.findUnique({ where: { id: templateId } });
  }

  async listTemplates(workspaceId: string, channel: MessagingChannel) {
    this.assertChannel(channel);
    return channel === 'email'
      ? prisma.emailTemplate.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { updatedAt: 'desc' } })
      : prisma.smsTemplate.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { updatedAt: 'desc' } });
  }

  async deleteTemplate(workspaceId: string, channel: MessagingChannel, templateId: string): Promise<void> {
    const result = channel === 'email'
      ? await prisma.emailTemplate.updateMany({ where: { id: templateId, workspaceId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } })
      : await prisma.smsTemplate.updateMany({ where: { id: templateId, workspaceId, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (!result.count) throw new Error('Template not found');
  }

  async createCampaign(workspaceId: string, userId: string, input: CampaignInput) {
    if (!input.name?.trim() || !input.subject?.trim() || !input.htmlBody?.trim()) throw new Error('Campaign name, subject and HTML body are required');
    if (input.templateId && !await prisma.emailTemplate.findFirst({ where: { id: input.templateId, workspaceId, deletedAt: null } })) throw new Error('Email template not found');
    return prisma.emailCampaign.create({ data: { workspaceId, createdByUserId: userId, name: input.name.trim(), description: textOrNull(input.description), templateId: input.templateId || null, senderName: textOrNull(input.senderName), fromEmail: textOrNull(input.fromEmail), replyTo: textOrNull(input.replyTo), subject: input.subject, htmlBody: input.htmlBody, textBody: textOrNull(input.textBody), audienceFilter: asJson(input.audienceFilter), scheduledFor: dateOrNull(input.scheduledFor), status: input.scheduledFor ? 'scheduled' : 'draft' } });
  }

  async updateCampaign(workspaceId: string, campaignId: string, input: Partial<CampaignInput>) {
    if (input.templateId && !await prisma.emailTemplate.findFirst({ where: { id: input.templateId, workspaceId, deletedAt: null } })) throw new Error('Email template not found');
    const data: any = { ...pick(input, ['name', 'description', 'senderName', 'fromEmail', 'replyTo', 'subject', 'htmlBody', 'textBody']), ...(input.templateId !== undefined ? { templateId: input.templateId || null } : {}), ...(input.audienceFilter !== undefined ? { audienceFilter: asJson(input.audienceFilter) } : {}), ...(input.scheduledFor !== undefined ? { scheduledFor: dateOrNull(input.scheduledFor), status: input.scheduledFor ? 'scheduled' : 'draft' } : {}) };
    const result = await prisma.emailCampaign.updateMany({ where: { id: campaignId, workspaceId, deletedAt: null }, data }); if (!result.count) throw new Error('Campaign not found'); return prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  }

  async listCampaigns(workspaceId: string) { return prisma.emailCampaign.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } }); }

  async queueCampaign(workspaceId: string, campaignId: string, scheduledFor?: Date | string | null): Promise<{ queued: number }> {
    const campaign = await prisma.emailCampaign.findFirst({ where: { id: campaignId, workspaceId, deletedAt: null } });
    if (!campaign) throw new Error('Campaign not found');
    if (['cancelled', 'completed'].includes(campaign.status)) throw new Error('Cancelled or completed campaigns cannot be queued');

    const filter = asRecord(campaign.audienceFilter);
    const where: any = { workspaceId, deletedAt: null, email: { not: null } };
    if (typeof filter.source === 'string') where.source = filter.source;
    if (typeof filter.tagId === 'string') where.tags = { some: { tagId: filter.tagId } };
    // A campaign may use an explicit, tenant-scoped contact selection from
    // the UI in addition to reusable source/tag audience rules.
    if (Array.isArray(filter.contactIds)) {
      const contactIds = [...new Set(filter.contactIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10_000))];
      if (contactIds.length) where.id = { in: contactIds };
    }

    const contacts = await prisma.contact.findMany({ where, select: { id: true, email: true } });
    // `undefined` preserves an existing campaign schedule; `null` is an
    // explicit immediate queue request. This distinction prevents a manual
    // "send now" from silently retaining an older scheduled timestamp.
    const at = scheduledFor === undefined ? campaign.scheduledFor : dateOrNull(scheduledFor);
    const now = new Date();
    const isScheduled = Boolean(at && at > now);
    const targetContactIds = contacts.map((contact) => contact.id);
    const templateSnapshot = {
      sender: campaign.fromEmail || null,
      subject: campaign.subject,
      body: campaign.textBody || stripHtml(campaign.htmlBody),
      htmlBody: campaign.htmlBody,
      status: isScheduled ? 'scheduled' : 'queued',
      scheduledFor: at,
      nextAttemptAt: at || now,
      lockedAt: null,
      metadata: asJson({ replyTo: campaign.replyTo, senderName: campaign.senderName, category: 'marketing' }),
    };

    await prisma.$transaction(async (tx) => {
      await Promise.all(contacts.map((contact) => tx.outboundMessage.upsert({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: `campaign:${campaign.id}:${contact.id}` } },
        create: {
          workspaceId, contactId: contact.id, emailCampaignId: campaign.id, createdByUserId: campaign.createdByUserId,
          channel: 'email', recipient: contact.email!, idempotencyKey: `campaign:${campaign.id}:${contact.id}`,
          trackingToken: randomUUID(), unsubscribeToken: randomUUID(), ...templateSnapshot,
        },
        update: {},
      })));
      // Re-sync only messages that have not reached a provider. Sent and
      // failed rows remain immutable delivery history, while scheduled/queued
      // messages receive the current campaign snapshot and timing.
      if (targetContactIds.length) {
        await tx.outboundMessage.updateMany({
          where: { workspaceId, emailCampaignId: campaign.id, contactId: { in: targetContactIds }, status: { in: ['queued', 'scheduled', 'cancelled'] } },
          data: templateSnapshot,
        });
      }
      // Recipients removed from an editable campaign must never retain an old
      // scheduled message. Cancellation preserves a useful audit trail.
      await tx.outboundMessage.updateMany({
        where: { workspaceId, emailCampaignId: campaign.id, ...(targetContactIds.length ? { contactId: { notIn: targetContactIds } } : {}), status: { in: ['queued', 'scheduled'] } },
        data: { status: 'cancelled', nextAttemptAt: null, lockedAt: null, errorCode: 'CAMPAIGN_AUDIENCE_CHANGED', errorMessage: 'Recipient removed from campaign audience' },
      });
      await tx.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: isScheduled ? 'scheduled' : 'sending', startedAt: isScheduled ? null : now, scheduledFor: at },
      });
    });

    if (!isScheduled) void this.processDueMessages();
    return { queued: contacts.length };
  }

  async send(input: SendCommunicationInput) {
    this.assertChannel(input.channel); const contact = input.contactId ? await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId, deletedAt: null }, include: { company: true } }) : null;
    if (input.contactId && !contact) throw new Error('Contact not found');
    const recipient = input.recipient || (input.channel === 'email' ? contact?.email : contact?.phone); if (!recipient) throw new Error(`A ${input.channel} recipient is required`);
    const template = await this.resolveTemplate(input); const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { id: true, name: true } });
    const sender = input.createdByUserId ? await prisma.user.findUnique({ where: { id: input.createdByUserId }, select: { id: true, firstName: true, lastName: true, email: true } }) : null;
    const values = messagingTemplateVariables({ contact, workspace, sender, extra: input.variables });
    const rendered = renderCommunicationTemplate({ subject: input.subject ?? template.subject, body: input.body ?? template.body, htmlBody: input.htmlBody ?? template.htmlBody }, values);
    const scheduledFor = dateOrNull(input.scheduledFor); const key = input.idempotencyKey || `manual:${randomUUID()}`;
    try {
      const message = await prisma.outboundMessage.create({ data: { workspaceId: input.workspaceId, contactId: contact?.id || null, conversationId: input.conversationId || null, workflowExecutionId: input.workflowExecutionId || null, emailTemplateId: input.channel === 'email' ? template.id : null, smsTemplateId: input.channel === 'sms' ? template.id : null, emailCampaignId: input.campaignId || null, createdByUserId: input.createdByUserId || null, channel: input.channel, recipient, sender: textOrNull(input.sender), subject: input.channel === 'email' ? rendered.subject || '' : null, body: rendered.body, htmlBody: input.channel === 'email' ? rendered.htmlBody || null : null, status: scheduledFor && scheduledFor > new Date() ? 'scheduled' : 'queued', scheduledFor, nextAttemptAt: scheduledFor || new Date(), idempotencyKey: key, trackingToken: input.channel === 'email' ? randomUUID() : null, unsubscribeToken: randomUUID(), metadata: asJson({ ...(input.metadata || {}), replyTo: input.replyTo || (input.metadata as Record<string, unknown> | undefined)?.replyTo }) } });
      await this.log(message.workspaceId, message.id, 'queued', 'queued', 'Communication queued'); if (!scheduledFor || scheduledFor <= new Date()) void this.processMessage(message.id); return message;
    } catch (error) {
      if (isUnique(error)) return prisma.outboundMessage.findFirstOrThrow({ where: { workspaceId: input.workspaceId, idempotencyKey: key } }); throw error;
    }
  }

  async processDueMessages(): Promise<void> {
    const now = new Date(); const staleBefore = new Date(now.getTime() - Math.max(60_000, Number(process.env.MESSAGE_STALE_LOCK_MS) || 300_000));
    await prisma.outboundMessage.updateMany({ where: { status: 'sending', lockedAt: { lte: staleBefore } }, data: { status: 'queued', lockedAt: null, nextAttemptAt: now } });
    const due = await prisma.outboundMessage.findMany({ where: { status: { in: ['queued', 'scheduled'] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, select: { id: true }, take: 50, orderBy: { nextAttemptAt: 'asc' } }); await Promise.all(due.map((message) => this.processMessage(message.id)));
    await this.completeCampaigns();
  }

  async processMessage(messageId: string): Promise<void> {
    const claimed = await prisma.outboundMessage.updateMany({ where: { id: messageId, status: { in: ['queued', 'scheduled'] } }, data: { status: 'sending', lockedAt: new Date(), attempts: { increment: 1 } } }); if (!claimed.count) return;
    const message = await prisma.outboundMessage.findUnique({ where: { id: messageId }, include: { contact: { include: { company: true } }, emailCampaign: true, createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } } }); if (!message) return;
    try {
      if (await this.isOptedOut(message.workspaceId, message.channel as MessagingChannel, message.recipient)) { await prisma.outboundMessage.update({ where: { id: message.id }, data: { status: 'cancelled', lockedAt: null, errorCode: 'RECIPIENT_OPTED_OUT', errorMessage: 'Recipient has opted out' } }); await this.log(message.workspaceId, message.id, 'cancelled', 'cancelled', 'Recipient opted out'); return; }
      const provider = messagingProviders.get(message.channel as MessagingChannel); const recipient = message.recipient;
      // Campaign rows are deliberately stored as send-ready snapshots, then
      // rendered per contact at delivery time. This keeps edits isolated while
      // still resolving contact/workspace variables correctly for every
      // recipient.
      const workspace = await prisma.workspace.findUnique({ where: { id: message.workspaceId }, select: { id: true, name: true } });
      const rendered = renderCommunicationTemplate(
        { subject: message.subject, body: message.body, htmlBody: message.htmlBody },
        messagingTemplateVariables({ contact: message.contact, workspace, sender: message.createdBy, extra: metadataRecord(message.metadata).variables as TemplateVariables | undefined }),
      );
      const deliveryMessage = { ...message, subject: rendered.subject ?? message.subject, body: rendered.body, htmlBody: rendered.htmlBody ?? message.htmlBody };
      const content = message.channel === 'email' ? await this.addEmailTracking(deliveryMessage) : { body: deliveryMessage.body, htmlBody: deliveryMessage.htmlBody };
      const receipt = message.channel === 'email'
        ? await messagingProviders.getEmail().send({ to: recipient, subject: deliveryMessage.subject || '', text: content.body, html: content.htmlBody || undefined, from: message.sender || message.emailCampaign?.fromEmail || undefined, replyTo: metadataString(message.metadata, 'replyTo') || message.emailCampaign?.replyTo || undefined, idempotencyKey: message.id })
        : await messagingProviders.getSms().send({ to: recipient, body: content.body, idempotencyKey: message.id });
      const status = receipt.status === 'delivered' ? 'delivered' : receipt.status === 'queued' ? 'sent' : 'sent';
      await prisma.outboundMessage.update({ where: { id: message.id }, data: { subject: deliveryMessage.subject || null, body: content.body, htmlBody: content.htmlBody || null, status, provider: provider.name, providerMessageId: receipt.providerMessageId || null, sentAt: new Date(), deliveredAt: receipt.status === 'delivered' ? new Date() : null, lockedAt: null } }); await this.log(message.workspaceId, message.id, 'provider_accepted', status, 'Provider accepted message', receipt.metadata);
      if (message.contactId) await prisma.contactActivity.create({ data: { workspaceId: message.workspaceId, contactId: message.contactId, type: message.channel, title: `${message.channel.toUpperCase()} sent`, description: content.body, metadata: toJson({ outboundMessageId: message.id, providerMessageId: receipt.providerMessageId }) } });
    } catch (error) { await this.failMessage(message, error); }
  }

  async retry(workspaceId: string, messageId: string) { const message = await prisma.outboundMessage.findFirst({ where: { id: messageId, workspaceId } }); if (!message) throw new Error('Message not found'); if (!['failed', 'cancelled'].includes(message.status)) throw new Error('Only failed or cancelled messages can be retried'); await prisma.outboundMessage.update({ where: { id: message.id }, data: { status: 'queued', nextAttemptAt: new Date(), lockedAt: null, errorCode: null, errorMessage: null } }); void this.processMessage(message.id); }

  async listMessages(workspaceId: string, channel?: MessagingChannel, limit = 100) { return prisma.outboundMessage.findMany({ where: { workspaceId, ...(channel ? { channel } : {}) }, include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }, logs: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' }, take: Math.min(100, Math.max(1, limit)) }); }
  async getOverview(workspaceId: string) { const [email, sms, failed, scheduled, optOuts] = await Promise.all([prisma.outboundMessage.count({ where: { workspaceId, channel: 'email' } }), prisma.outboundMessage.count({ where: { workspaceId, channel: 'sms' } }), prisma.outboundMessage.count({ where: { workspaceId, status: 'failed' } }), prisma.outboundMessage.count({ where: { workspaceId, status: 'scheduled' } }), prisma.communicationOptOut.count({ where: { workspaceId, resubscribedAt: null } })]); return { email, sms, failed, scheduled, optOuts, providers: messagingProviders.status() }; }

  async listOptOuts(workspaceId: string) { return prisma.communicationOptOut.findMany({ where: { workspaceId }, include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } }, orderBy: { unsubscribedAt: 'desc' } }); }
  async optOut(workspaceId: string, channel: MessagingChannel, address: string, options: { contactId?: string | null; reason?: string; source?: string } = {}) { this.assertChannel(channel); const normalized = normalizeAddress(channel, address); const contact = options.contactId ? await prisma.contact.findFirst({ where: { id: options.contactId, workspaceId } }) : null; if (options.contactId && !contact) throw new Error('Contact not found'); return prisma.communicationOptOut.upsert({ where: { workspaceId_channel_normalizedAddress: { workspaceId, channel, normalizedAddress: normalized } }, create: { workspaceId, contactId: contact?.id || null, channel, address, normalizedAddress: normalized, reason: textOrNull(options.reason), source: options.source || 'manual' }, update: { contactId: contact?.id || undefined, address, reason: textOrNull(options.reason), source: options.source || 'manual', unsubscribedAt: new Date(), resubscribedAt: null } }); }
  async resubscribe(workspaceId: string, optOutId: string) { const result = await prisma.communicationOptOut.updateMany({ where: { id: optOutId, workspaceId }, data: { resubscribedAt: new Date() } }); if (!result.count) throw new Error('Opt-out record not found'); }
  async unsubscribeToken(token: string) { const message = await prisma.outboundMessage.findUnique({ where: { unsubscribeToken: token } }); if (!message) throw new Error('Unsubscribe link is invalid'); return this.optOut(message.workspaceId, message.channel as MessagingChannel, message.recipient, { contactId: message.contactId, source: 'unsubscribe_link' }); }
  async trackOpen(token: string, visitorHash?: string) { const message = await prisma.outboundMessage.findUnique({ where: { trackingToken: token } }); if (!message) return false; await prisma.$transaction([prisma.messageTrackingEvent.create({ data: { workspaceId: message.workspaceId, outboundMessageId: message.id, eventType: 'open', visitorHash: visitorHash || null } }), prisma.outboundMessageLog.create({ data: { workspaceId: message.workspaceId, outboundMessageId: message.id, event: 'opened', status: message.status, message: 'Tracking pixel opened' } })]); return true; }
  async trackClick(token: string, visitorHash?: string) { const link = await prisma.messageTrackingLink.findUnique({ where: { token }, include: { outboundMessage: true } }); if (!link) return null; const now = new Date(); await prisma.$transaction([prisma.messageTrackingLink.update({ where: { id: link.id }, data: { clickCount: { increment: 1 }, firstClickedAt: link.firstClickedAt || now, lastClickedAt: now } }), prisma.messageTrackingEvent.create({ data: { workspaceId: link.workspaceId, outboundMessageId: link.outboundMessageId, trackingLinkId: link.id, eventType: 'click', visitorHash: visitorHash || null } })]); return link.destinationUrl; }
  async recordProviderStatus(provider: string, providerMessageId: string, rawStatus: string, detail: { errorCode?: string; errorMessage?: string; metadata?: unknown } = {}): Promise<boolean> {
    const status = rawStatus.trim().toLowerCase();
    const allowed = new Set(['queued', 'scheduled', 'sent', 'delivered', 'failed', 'bounced', 'undelivered', 'cancelled']);
    if (!allowed.has(status)) throw new Error('Unsupported provider delivery status');
    const message = await prisma.outboundMessage.findFirst({ where: { provider, providerMessageId } });
    if (!message) return false;
    const now = new Date();
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status,
        deliveredAt: status === 'delivered' ? now : message.deliveredAt,
        failedAt: ['failed', 'bounced', 'undelivered'].includes(status) ? now : message.failedAt,
        errorCode: detail.errorCode || (['failed', 'bounced', 'undelivered'].includes(status) ? message.errorCode || 'PROVIDER_DELIVERY_FAILED' : null),
        errorMessage: detail.errorMessage || (['failed', 'bounced', 'undelivered'].includes(status) ? message.errorMessage : null),
      },
    });
    await this.log(message.workspaceId, message.id, 'provider_status', status, detail.errorMessage || `Provider reported ${status}`, detail.metadata);
    if (message.contactId && ['delivered', 'failed', 'bounced', 'undelivered'].includes(status)) {
      await prisma.contactActivity.create({ data: { workspaceId: message.workspaceId, contactId: message.contactId, type: message.channel, title: `${message.channel.toUpperCase()} ${status}`, metadata: toJson({ outboundMessageId: message.id, provider, providerMessageId }) } });
    }
    return true;
  }

  private async resolveTemplate(input: SendCommunicationInput): Promise<{ id?: string; subject?: string; body?: string; htmlBody?: string }> { if (!input.templateId) return {}; if (input.channel === 'email') { const template = await prisma.emailTemplate.findFirst({ where: { id: input.templateId, workspaceId: input.workspaceId, deletedAt: null, isActive: true } }); if (!template) throw new Error('Email template not found'); return { id: template.id, subject: template.subject, body: template.textBody || stripHtml(template.htmlBody), htmlBody: template.htmlBody }; } const template = await prisma.smsTemplate.findFirst({ where: { id: input.templateId, workspaceId: input.workspaceId, deletedAt: null, isActive: true } }); if (!template) throw new Error('SMS template not found'); return { id: template.id, body: template.body }; }
  private async addEmailTracking(message: any): Promise<{ body: string; htmlBody?: string | null }> { if (!message.htmlBody) return { body: message.body, htmlBody: message.htmlBody }; const base = (process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''); if (!base) return { body: message.body, htmlBody: message.htmlBody }; let html = message.htmlBody; const urls = [...html.matchAll(/href=["'](https?:\/\/[^"'\s]+)["']/gi)].map((match) => match[1]); for (const url of [...new Set(urls)].slice(0, 50)) { const token = randomUUID(); await prisma.messageTrackingLink.create({ data: { workspaceId: message.workspaceId, outboundMessageId: message.id, destinationUrl: url, token } }); html = html.split(url).join(`${base}/api/messaging/track/click/${token}`); } const unsubscribe = `${base}/api/messaging/unsubscribe/${message.unsubscribeToken}`; html += `<img src="${base}/api/messaging/track/open/${message.trackingToken}" width="1" height="1" alt="" style="display:none"/><p style="font-size:12px"><a href="${unsubscribe}">Unsubscribe</a></p>`; return { body: `${message.body}\n\nUnsubscribe: ${unsubscribe}`, htmlBody: html }; }
  private async isOptedOut(workspaceId: string, channel: MessagingChannel, address: string) { return Boolean(await prisma.communicationOptOut.findFirst({ where: { workspaceId, channel, normalizedAddress: normalizeAddress(channel, address), resubscribedAt: null } })); }
  private async failMessage(message: any, error: unknown) { const providerError = error instanceof MessagingProviderError ? error : new MessagingProviderError(error instanceof Error ? error.message : 'Delivery failed', { retryable: true }); const attempts = message.attempts; const retry = providerError.retryable && attempts < message.maxAttempts; const next = retry ? new Date(Date.now() + Math.min(60_000 * 30, 1_000 * 2 ** attempts)) : null; await prisma.outboundMessage.update({ where: { id: message.id }, data: { status: retry ? 'queued' : 'failed', nextAttemptAt: next, lockedAt: null, failedAt: retry ? null : new Date(), errorCode: providerError.code || 'DELIVERY_FAILED', errorMessage: providerError.message } }); await this.log(message.workspaceId, message.id, retry ? 'retry_scheduled' : 'failed', retry ? 'queued' : 'failed', providerError.message, { code: providerError.code, nextAttemptAt: next?.toISOString() }); }
  private async log(workspaceId: string, messageId: string, event: string, status?: string, message?: string, providerResponse?: unknown) { await prisma.outboundMessageLog.create({ data: { workspaceId, outboundMessageId: messageId, event, status, message, providerResponse: toJson(providerResponse) } }); }
  private async completeCampaigns() { const campaigns = await prisma.emailCampaign.findMany({ where: { status: 'sending' }, select: { id: true } }); for (const campaign of campaigns) { const remaining = await prisma.outboundMessage.count({ where: { emailCampaignId: campaign.id, status: { in: ['queued', 'scheduled', 'sending'] } } }); if (!remaining) await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'completed', completedAt: new Date() } }); } }
  private assertChannel(channel: string): asserts channel is MessagingChannel { if (!channels.has(channel as MessagingChannel)) throw new Error('Channel must be email or sms'); }
  private assertTemplate(input: TemplateInput, channel: MessagingChannel) { if (!input.name?.trim()) throw new Error('Template name is required'); if (channel === 'email' && (!input.subject?.trim() || !input.htmlBody?.trim())) throw new Error('Email template subject and HTML body are required'); if (channel === 'sms' && !input.body?.trim()) throw new Error('SMS template body is required'); }
}

export const messagingService = new MessagingDeliveryService();
function textOrNull(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function dateOrNull(value: unknown): Date | null { if (!value) return null; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date; }
function asRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function metadataRecord(value: unknown): Record<string, unknown> { return asRecord(value); }
function metadataString(value: unknown, key: string): string | undefined { const result = metadataRecord(value)[key]; return typeof result === 'string' && result.trim() ? result.trim() : undefined; }
function asJson(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function toJson(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined ? undefined : asJson(value); }
function pick(input: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])); }
function normalizeAddress(channel: MessagingChannel, address: string) { return channel === 'email' ? address.trim().toLowerCase() : address.replace(/[\s()-]/g, ''); }
function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function isUnique(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
