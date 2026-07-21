import { PrismaClient } from '@prisma/client';
import { messagingProviders } from '../providers/messaging.provider.js';
import { messagingService } from './messaging.service.js';

const prisma = new PrismaClient();

/**
 * HTTP-facing compatibility facade around the durable messaging service.
 * It keeps REST route payloads explicit while workflow and conversation code
 * can use the smaller `messagingService` API directly.
 */
export const messagingDeliveryService = {
  async status() { return messagingProviders.status(); },
  async recordOpen(token: string, context: { visitorHash?: string }) { const recorded = await messagingService.trackOpen(token, context.visitorHash); return { recorded }; },
  async recordClick(token: string, context: { visitorHash?: string }) { const destinationUrl = await messagingService.trackClick(token, context.visitorHash); return destinationUrl ? { destinationUrl } : null; },
  async unsubscribe(token: string) { return messagingService.unsubscribeToken(token); },
  async launchCampaign(input: { workspaceId: string; campaignId: string; createdByUserId?: string }) { await messagingService.queueCampaign(input.workspaceId, input.campaignId); return prisma.emailCampaign.findFirstOrThrow({ where: { id: input.campaignId, workspaceId: input.workspaceId } }); },
  async scheduleCampaign(input: { workspaceId: string; campaignId: string; scheduledFor: Date }) { await messagingService.queueCampaign(input.workspaceId, input.campaignId, input.scheduledFor); return prisma.emailCampaign.findFirstOrThrow({ where: { id: input.campaignId, workspaceId: input.workspaceId } }); },
  async cancelCampaign(workspaceId: string, campaignId: string) {
    const campaign = await prisma.emailCampaign.findFirst({ where: { id: campaignId, workspaceId, deletedAt: null } }); if (!campaign) throw new Error('Campaign not found');
    await prisma.$transaction([prisma.outboundMessage.updateMany({ where: { workspaceId, emailCampaignId: campaign.id, status: { in: ['queued', 'scheduled'] } }, data: { status: 'cancelled', nextAttemptAt: null } }), prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'cancelled', cancelledAt: new Date() } })]);
    return prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  },
  async queueMessage(input: any) {
    return messagingService.send({ workspaceId: input.workspaceId, channel: input.channel, recipient: input.recipient, contactId: input.contactId, conversationId: input.conversationId, createdByUserId: input.createdByUserId, templateId: input.emailTemplateId || input.smsTemplateId, subject: input.subject, body: input.body, htmlBody: input.htmlBody, scheduledFor: input.scheduledFor, idempotencyKey: input.idempotencyKey, metadata: { ...(input.metadata || {}), replyTo: input.replyTo, sender: input.sender }, variables: input.variables });
  },
  async retryMessage(workspaceId: string, messageId: string) { await messagingService.retry(workspaceId, messageId); return prisma.outboundMessage.findFirstOrThrow({ where: { id: messageId, workspaceId } }); },
  async createOptOut(input: { workspaceId: string; channel: 'email' | 'sms'; contactId?: string; address?: string; reason?: string; source?: string; metadata?: unknown }) {
    let address = input.address;
    if (!address && input.contactId) { const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId } }); address = input.channel === 'email' ? contact?.email || undefined : contact?.phone || undefined; }
    if (!address) throw new Error('An address or contact with a channel address is required');
    return messagingService.optOut(input.workspaceId, input.channel, address, { contactId: input.contactId, reason: input.reason, source: input.source });
  },
  async resubscribe(workspaceId: string, optOutId: string) { await messagingService.resubscribe(workspaceId, optOutId); return prisma.communicationOptOut.findFirstOrThrow({ where: { id: optOutId, workspaceId } }); },
};
