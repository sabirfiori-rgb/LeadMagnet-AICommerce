import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { messagingService } from '../services/messaging.service.js';

/**
 * Email and SMS API surface.
 *
 * Provider credentials never pass through this router.  It owns the HTTP
 * contract and tenant membership check; the delivery service owns recipient,
 * template, campaign and opt-out ownership checks before creating or sending
 * a durable outbound message.
 */
const router = Router();
const prisma = new PrismaClient();

const TRANSPARENT_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);
const MAX_PAGE_SIZE = 100;
const TEMPLATE_CATEGORIES = new Set(['marketing', 'transactional', 'automation']);
const MESSAGE_CHANNELS = new Set(['email', 'sms']);
const MESSAGE_STATUSES = new Set([
  'queued', 'scheduled', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'undelivered', 'cancelled',
]);
const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed']);

function value(value: unknown, maxLength = 10_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new AppError(400, `Value cannot exceed ${maxLength} characters`);
  return trimmed;
}

function required(valueToRead: unknown, name: string, maxLength = 10_000): string {
  const result = value(valueToRead, maxLength);
  if (!result) throw new AppError(400, `${name} is required`);
  return result;
}

function optionalBoolean(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined;
}

function jsonValue(raw: unknown): Record<string, unknown> | unknown[] | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== 'object') throw new AppError(400, 'Expected a JSON object or array');
  return raw as Record<string, unknown> | unknown[];
}

function channel(raw: unknown): 'email' | 'sms' {
  const result = value(raw, 16)?.toLowerCase();
  if (!result || !MESSAGE_CHANNELS.has(result)) throw new AppError(400, 'Channel must be email or sms');
  return result as 'email' | 'sms';
}

function category(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  const result = value(raw, 40)?.toLowerCase();
  if (!result || !TEMPLATE_CATEGORIES.has(result)) throw new AppError(400, 'Invalid template category');
  return result;
}

function pageParams(req: Request) {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
  return { page, limit, skip: (page - 1) * limit };
}

function scheduledDate(raw: unknown): Date | undefined {
  const rawValue = value(raw, 100);
  if (!rawValue) return undefined;
  const result = new Date(rawValue);
  if (Number.isNaN(result.getTime())) throw new AppError(400, 'scheduledFor must be a valid ISO date');
  if (result.getTime() <= Date.now()) throw new AppError(400, 'scheduledFor must be in the future');
  return result;
}

async function workspaceId(req: Request): Promise<string> {
  const id = value(req.params.workspaceId, 128);
  if (!id) throw new AppError(404, 'Workspace not found');
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.auth!.userId, workspaceId: id } },
    select: { id: true },
  });
  // A 404 rather than a 403 avoids turning this endpoint into a workspace-ID
  // oracle for authenticated users from another tenant.
  if (!membership) throw new AppError(404, 'Workspace not found');
  return id;
}

async function emailTemplateInWorkspace(workspaceId: string, templateId: string) {
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, workspaceId, deletedAt: null },
  });
  if (!template) throw new AppError(404, 'Email template not found');
  return template;
}

async function smsTemplateInWorkspace(workspaceId: string, templateId: string) {
  const template = await prisma.smsTemplate.findFirst({
    where: { id: templateId, workspaceId, deletedAt: null },
  });
  if (!template) throw new AppError(404, 'SMS template not found');
  return template;
}

async function campaignInWorkspace(workspaceId: string, campaignId: string) {
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, workspaceId, deletedAt: null },
    include: { template: true, _count: { select: { messages: true } } },
  });
  if (!campaign) throw new AppError(404, 'Email campaign not found');
  return campaign;
}

function trackingVisitorHash(req: Request): string {
  const trackingSecret = process.env.TRACKING_HASH_SECRET || process.env.JWT_SECRET || 'development-tracking-secret';
  const source = `${req.ip || ''}\n${req.get('user-agent') || ''}`;
  // Keep only a non-reversible hash. Raw IP addresses and user-agent strings
  // are intentionally never persisted by public tracking routes.
  return createHash('sha256').update(`${trackingSecret}\n${source}`).digest('hex');
}

function validTrackingToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(token);
}

function sendPixel(res: Response): void {
  res
    .status(200)
    .set('Content-Type', 'image/gif')
    .set('Content-Length', String(TRANSPARENT_PIXEL.length))
    .set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate')
    .set('Pragma', 'no-cache')
    .send(TRANSPARENT_PIXEL);
}

function safeRedirect(valueToValidate: string | undefined): string | undefined {
  if (!valueToValidate || valueToValidate.length > 8_192) return undefined;
  try {
    const url = new URL(valueToValidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function secretsMatch(received: string | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function twilioSignatureValid(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('x-twilio-signature');
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');
  if (!authToken || !signature || !baseUrl || !req.body || typeof req.body !== 'object') return false;
  // Twilio signs the exact public callback URL followed by sorted form
  // parameters. APP_BASE_URL removes host-header ambiguity behind proxies.
  const url = `${baseUrl}${req.originalUrl}`;
  const payload = Object.entries(req.body as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${key}${Array.isArray(entry) ? entry.join('') : String(entry ?? '')}`)
    .join('');
  const expected = createHmac('sha1', authToken).update(`${url}${payload}`).digest('base64');
  return secretsMatch(signature, expected);
}

function providerWebhookAuthorized(req: Request, provider: string): boolean {
  // Twilio callbacks get a vendor-native HMAC check when credentials are
  // configured. Other current/future adapters use a dedicated shared secret
  // until they add their own verifier.
  if (provider === 'twilio' && twilioSignatureValid(req)) return true;
  return secretsMatch(req.get('x-provider-webhook-secret') || undefined, process.env.PROVIDER_WEBHOOK_SECRET);
}

function unsubscribePage(token: string, completed = false): string {
  const escapedToken = token.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
  if (completed) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body><main><h1>You have been unsubscribed</h1><p>You will no longer receive marketing messages from this workspace.</p></main></body></html>';
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm unsubscribe</title></head><body><main><h1>Unsubscribe from messages?</h1><p>This will stop marketing messages sent to this address.</p><form method="post" action="/api/messaging/unsubscribe/${escapedToken}"><button type="submit">Confirm unsubscribe</button></form></main></body></html>`;
}

// Public endpoints deliberately come before authentication. Tokens are
// random, opaque and single-purpose; none of these endpoints accepts a
// workspace id, recipient, provider id, or any credential from the browser.
router.get('/track/open/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (validTrackingToken(token)) {
    try {
      await messagingService.trackOpen(token, trackingVisitorHash(req));
    } catch (error) {
      // Email clients retry image loads. Avoid exposing a delivery record's
      // existence or operational failure in an image response.
      console.warn('Unable to record email open', error);
    }
  }
  sendPixel(res);
}));

router.get('/track/click/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (!validTrackingToken(token)) {
    res.status(404).type('text/plain').send('Tracked link is unavailable.');
    return;
  }
  try {
    const result = await messagingService.trackClick(token, trackingVisitorHash(req));
    const destination = safeRedirect(result || undefined);
    if (!destination) {
      res.status(404).type('text/plain').send('Tracked link is unavailable.');
      return;
    }
    res.set('Cache-Control', 'no-store').redirect(302, destination);
  } catch (error) {
    console.warn('Unable to record email click', error);
    res.status(404).type('text/plain').send('Tracked link is unavailable.');
  }
}));

router.get('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (!validTrackingToken(token)) {
    res.status(404).type('text/plain').send('Unsubscribe link is unavailable.');
    return;
  }
  // Use a confirmation form rather than mutating on GET. This protects users
  // from security scanners and link preview bots that follow every URL.
  res.set('Cache-Control', 'no-store').type('html').send(unsubscribePage(token));
}));

router.post('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (!validTrackingToken(token)) {
    res.status(404).type('text/plain').send('Unsubscribe link is unavailable.');
    return;
  }
  try {
    await messagingService.unsubscribeToken(token);
  } catch (error) {
    // Preserve privacy: unknown and already-used tokens receive the same
    // harmless confirmation page. The service keeps the operation idempotent.
    console.warn('Unable to process unsubscribe token', error);
  }
  res.set('Cache-Control', 'no-store').type('html').send(unsubscribePage(token, true));
}));

// Delivery callbacks stay outside user authentication, but are authenticated
// with the provider-specific verifier or an explicit server-only webhook
// secret. They never return an outbound message or recipient to the caller.
router.post('/webhooks/:provider/status', asyncHandler(async (req, res) => {
  const provider = value(req.params.provider, 64)?.toLowerCase();
  if (!provider || !/^[a-z0-9_-]+$/.test(provider)) {
    res.status(404).json({ success: false, error: 'Webhook endpoint not found' });
    return;
  }
  if (!providerWebhookAuthorized(req, provider)) {
    res.status(401).json({ success: false, error: 'Webhook authentication failed' });
    return;
  }
  const providerMessageId = required(req.body.providerMessageId ?? req.body.messageId ?? req.body.MessageSid, 'providerMessageId', 255);
  const status = required(req.body.status ?? req.body.messageStatus ?? req.body.MessageStatus, 'status', 32);
  const recorded = await messagingService.recordProviderStatus(provider, providerMessageId, status, {
    errorCode: value(req.body.errorCode ?? req.body.ErrorCode, 120),
    errorMessage: value(req.body.errorMessage ?? req.body.ErrorMessage, 2_000),
    metadata: { providerStatus: status },
  });
  // Accept unknown IDs so callback providers do not retry indefinitely and
  // cannot use this endpoint as a delivery-record oracle.
  res.status(202).json({ success: true, data: { recorded } });
}));

router.use(authMiddleware);

// Provider configuration status contains only names and configured booleans;
// API keys, SMTP credentials and Twilio tokens are never serialized.
router.get('/workspaces/:workspaceId/provider-status', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const overview = await messagingService.getOverview(id);
  res.json({ success: true, data: { providers: overview.providers } });
}));

router.get('/workspaces/:workspaceId/overview', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const [emailTemplates, smsTemplates, draftCampaigns, scheduledCampaigns, queuedMessages, failedMessages, activeOptOuts, messagingOverview] = await Promise.all([
    prisma.emailTemplate.count({ where: { workspaceId: id, deletedAt: null } }),
    prisma.smsTemplate.count({ where: { workspaceId: id, deletedAt: null } }),
    prisma.emailCampaign.count({ where: { workspaceId: id, deletedAt: null, status: 'draft' } }),
    prisma.emailCampaign.count({ where: { workspaceId: id, deletedAt: null, status: 'scheduled' } }),
    prisma.outboundMessage.count({ where: { workspaceId: id, status: { in: ['queued', 'scheduled', 'sending'] } } }),
    prisma.outboundMessage.count({ where: { workspaceId: id, status: { in: ['failed', 'bounced', 'undelivered'] } } }),
    prisma.communicationOptOut.count({ where: { workspaceId: id, resubscribedAt: null } }),
    messagingService.getOverview(id),
  ]);
  res.json({
    success: true,
    data: { emailTemplates, smsTemplates, draftCampaigns, scheduledCampaigns, queuedMessages, failedMessages, activeOptOuts, providers: messagingOverview.providers },
  });
}));

// Template management ------------------------------------------------------
router.get('/workspaces/:workspaceId/templates/:channel', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateChannel = channel(req.params.channel);
  const active = req.query.active === undefined ? undefined : req.query.active === 'true';
  const search = value(req.query.search, 200);
  const where: any = { workspaceId: id, deletedAt: null };
  if (active !== undefined) where.isActive = active;
  if (search) where.name = { contains: search, mode: 'insensitive' };
  const templates = templateChannel === 'email'
    ? await prisma.emailTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } })
    : await prisma.smsTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
  res.json({ success: true, data: { templates } });
}));

router.post('/workspaces/:workspaceId/templates/:channel', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateChannel = channel(req.params.channel);
  const name = required(req.body.name, 'Template name', 160);
  const description = value(req.body.description, 2_000) || null;
  const variables = jsonValue(req.body.variables);
  const selectedCategory = category(req.body.category) || 'marketing';
  const isActive = optionalBoolean(req.body.isActive) ?? true;

  if (templateChannel === 'email') {
    const subject = required(req.body.subject, 'Email subject', 998);
    const htmlBody = required(req.body.htmlBody ?? req.body.body, 'Email HTML body', 100_000);
    const textBody = value(req.body.textBody, 100_000) || null;
    const existing = await prisma.emailTemplate.findFirst({ where: { workspaceId: id, name } });
    if (existing && !existing.deletedAt) throw new AppError(409, 'An email template with this name already exists');
    const data: any = { name, description, subject, htmlBody, textBody, variables, category: selectedCategory, isActive, deletedAt: null };
    const template = existing
      ? await prisma.emailTemplate.update({ where: { id: existing.id }, data })
      : await prisma.emailTemplate.create({ data: { workspaceId: id, createdByUserId: req.auth!.userId, ...data } });
    res.status(201).json({ success: true, data: { template } });
    return;
  }

  const body = required(req.body.body, 'SMS body', 1_600);
  const existing = await prisma.smsTemplate.findFirst({ where: { workspaceId: id, name } });
  if (existing && !existing.deletedAt) throw new AppError(409, 'An SMS template with this name already exists');
  const data: any = { name, description, body, variables, category: selectedCategory, isActive, deletedAt: null };
  const template = existing
    ? await prisma.smsTemplate.update({ where: { id: existing.id }, data })
    : await prisma.smsTemplate.create({ data: { workspaceId: id, createdByUserId: req.auth!.userId, ...data } });
  res.status(201).json({ success: true, data: { template } });
}));

router.get('/workspaces/:workspaceId/templates/:channel/:templateId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateChannel = channel(req.params.channel);
  const template = templateChannel === 'email'
    ? await emailTemplateInWorkspace(id, req.params.templateId)
    : await smsTemplateInWorkspace(id, req.params.templateId);
  res.json({ success: true, data: { template } });
}));

router.put('/workspaces/:workspaceId/templates/:channel/:templateId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateChannel = channel(req.params.channel);
  const fields: any = {};
  if (req.body.name !== undefined) fields.name = required(req.body.name, 'Template name', 160);
  if (req.body.description !== undefined) fields.description = value(req.body.description, 2_000) || null;
  if (req.body.variables !== undefined) fields.variables = jsonValue(req.body.variables);
  if (req.body.category !== undefined) fields.category = category(req.body.category);
  if (req.body.isActive !== undefined) {
    const isActive = optionalBoolean(req.body.isActive);
    if (isActive === undefined) throw new AppError(400, 'isActive must be a boolean');
    fields.isActive = isActive;
  }

  try {
    if (templateChannel === 'email') {
      const template = await emailTemplateInWorkspace(id, req.params.templateId);
      if (req.body.subject !== undefined) fields.subject = required(req.body.subject, 'Email subject', 998);
      if (req.body.htmlBody !== undefined || req.body.body !== undefined) fields.htmlBody = required(req.body.htmlBody ?? req.body.body, 'Email HTML body', 100_000);
      if (req.body.textBody !== undefined) fields.textBody = value(req.body.textBody, 100_000) || null;
      const updated = await prisma.emailTemplate.update({ where: { id: template.id }, data: fields });
      res.json({ success: true, data: { template: updated } });
      return;
    }
    const template = await smsTemplateInWorkspace(id, req.params.templateId);
    if (req.body.body !== undefined) fields.body = required(req.body.body, 'SMS body', 1_600);
    const updated = await prisma.smsTemplate.update({ where: { id: template.id }, data: fields });
    res.json({ success: true, data: { template: updated } });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AppError(409, 'A template with this name already exists');
    throw error;
  }
}));

router.delete('/workspaces/:workspaceId/templates/:channel/:templateId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateChannel = channel(req.params.channel);
  const result = templateChannel === 'email'
    ? await prisma.emailTemplate.updateMany({ where: { id: req.params.templateId, workspaceId: id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } })
    : await prisma.smsTemplate.updateMany({ where: { id: req.params.templateId, workspaceId: id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
  if (!result.count) throw new AppError(404, 'Template not found');
  res.json({ success: true });
}));

// Email campaigns ----------------------------------------------------------
function campaignInput(raw: any, template?: { id: string; subject: string; htmlBody: string; textBody: string | null }) {
  const selectedChannel = raw.channel === undefined ? 'email' : channel(raw.channel);
  if (selectedChannel !== 'email') throw new AppError(400, 'Campaigns are currently available for email only. Schedule SMS from the compose form.');
  const data: any = {};
  if (raw.name !== undefined) data.name = required(raw.name, 'Campaign name', 160);
  if (raw.description !== undefined) data.description = value(raw.description, 2_000) || null;
  if (raw.senderName !== undefined) data.senderName = value(raw.senderName, 160) || null;
  if (raw.fromEmail !== undefined) data.fromEmail = value(raw.fromEmail, 320) || null;
  if (raw.replyTo !== undefined) data.replyTo = value(raw.replyTo, 320) || null;
  if (raw.audienceFilter !== undefined) data.audienceFilter = jsonValue(raw.audienceFilter);
  if (Array.isArray(raw.recipientIds)) data.audienceFilter = { ...(data.audienceFilter || {}), contactIds: raw.recipientIds.filter((entry: unknown) => typeof entry === 'string').slice(0, 10_000) };
  if (raw.scheduledFor !== undefined) data.scheduledFor = scheduledDate(raw.scheduledFor) || null;
  const subject = raw.subject === undefined ? template?.subject : value(raw.subject, 998);
  const htmlBody = raw.htmlBody === undefined && raw.body === undefined ? template?.htmlBody : value(raw.htmlBody ?? raw.body, 100_000);
  const textBody = raw.textBody === undefined ? template?.textBody : value(raw.textBody, 100_000) || null;
  if (subject !== undefined) data.subject = subject;
  if (htmlBody !== undefined) data.htmlBody = htmlBody;
  if (textBody !== undefined) data.textBody = textBody;
  return data;
}

router.get('/workspaces/:workspaceId/campaigns', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const { page, limit, skip } = pageParams(req);
  const where: any = { workspaceId: id, deletedAt: null };
  const status = value(req.query.status, 32)?.toLowerCase();
  if (status) {
    if (!CAMPAIGN_STATUSES.has(status)) throw new AppError(400, 'Invalid campaign status');
    where.status = status;
  }
  const search = value(req.query.search, 200);
  if (search) where.name = { contains: search, mode: 'insensitive' };
  const [campaigns, total] = await Promise.all([
    prisma.emailCampaign.findMany({ where, skip, take: limit, orderBy: { updatedAt: 'desc' }, include: { template: { select: { id: true, name: true } }, _count: { select: { messages: true } } } }),
    prisma.emailCampaign.count({ where }),
  ]);
  res.json({ success: true, data: { campaigns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.post('/workspaces/:workspaceId/campaigns', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const templateId = value(req.body.templateId, 128);
  const template = templateId ? await emailTemplateInWorkspace(id, templateId) : undefined;
  const data = campaignInput(req.body, template);
  if (!data.name) throw new AppError(400, 'Campaign name is required');
  if (!data.subject) throw new AppError(400, 'Campaign subject is required');
  if (!data.htmlBody) throw new AppError(400, 'Campaign HTML body is required');
  const campaign = await prisma.emailCampaign.create({
    data: {
      workspaceId: id, createdByUserId: req.auth!.userId, templateId: template?.id || null, ...data,
      status: data.scheduledFor ? 'scheduled' : 'draft',
    },
  });
  if (data.scheduledFor) await messagingService.queueCampaign(id, campaign.id, data.scheduledFor);
  res.status(201).json({ success: true, data: { campaign } });
}));

router.get('/workspaces/:workspaceId/campaigns/:campaignId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  res.json({ success: true, data: { campaign } });
}));

router.put('/workspaces/:workspaceId/campaigns/:campaignId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  if (!['draft', 'scheduled'].includes(campaign.status)) throw new AppError(400, 'Only draft or scheduled campaigns can be edited');
  const changingTemplate = req.body.templateId !== undefined;
  const templateId = changingTemplate ? value(req.body.templateId, 128) : campaign.templateId;
  const selectedTemplate = templateId ? await emailTemplateInWorkspace(id, templateId) : undefined;
  // Campaigns are send-ready snapshots. Editing its name or audience must not
  // quietly replace the saved content with a newer template revision.
  const defaults = changingTemplate
    ? selectedTemplate
    : { id: campaign.id, subject: campaign.subject, htmlBody: campaign.htmlBody, textBody: campaign.textBody };
  const data = campaignInput(req.body, defaults);
  if (data.name === undefined && data.subject === undefined && data.htmlBody === undefined && Object.keys(data).length === 0 && req.body.templateId === undefined) {
    throw new AppError(400, 'Provide at least one campaign field to update');
  }
  if (data.subject === '') throw new AppError(400, 'Campaign subject is required');
  if (data.htmlBody === '') throw new AppError(400, 'Campaign HTML body is required');
  const updated = await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { ...data, templateId: templateId || null, ...(data.scheduledFor !== undefined ? { status: data.scheduledFor ? 'scheduled' : 'draft' } : {}) } });
  if (data.scheduledFor === null) {
    // Removing a schedule turns the campaign back into a draft. Do not leave
    // its previously scheduled recipient rows eligible for delivery.
    await prisma.outboundMessage.updateMany({
      where: { workspaceId: id, emailCampaignId: updated.id, status: { in: ['queued', 'scheduled'] } },
      data: { status: 'cancelled', nextAttemptAt: null, lockedAt: null, errorCode: 'CAMPAIGN_UNSCHEDULED', errorMessage: 'Campaign schedule was removed' },
    });
  } else if (updated.status === 'scheduled' && updated.scheduledFor) {
    // This also refreshes queued recipients after an editable campaign's
    // content or audience changes.
    await messagingService.queueCampaign(id, updated.id, updated.scheduledFor);
  }
  res.json({ success: true, data: { campaign: updated } });
}));

router.delete('/workspaces/:workspaceId/campaigns/:campaignId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  if (['scheduled', 'sending'].includes(campaign.status)) {
    await prisma.outboundMessage.updateMany({
      where: { workspaceId: id, emailCampaignId: campaign.id, status: { in: ['queued', 'scheduled', 'sending'] } },
      data: { status: 'cancelled', nextAttemptAt: null, lockedAt: null },
    });
  }
  await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date(), status: 'cancelled', cancelledAt: new Date() } });
  res.json({ success: true });
}));

router.post('/workspaces/:workspaceId/campaigns/:campaignId/send', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  // An explicit send always overrides a future campaign schedule.
  const result = await messagingService.queueCampaign(id, campaign.id, new Date());
  res.status(202).json({ success: true, data: { campaign: result } });
}));

router.post('/workspaces/:workspaceId/campaigns/:campaignId/schedule', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  const scheduledFor = scheduledDate(req.body.scheduledFor);
  if (!scheduledFor) throw new AppError(400, 'scheduledFor is required');
  const result = await messagingService.queueCampaign(id, campaign.id, scheduledFor);
  res.json({ success: true, data: { campaign: result } });
}));

router.post('/workspaces/:workspaceId/campaigns/:campaignId/cancel', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const campaign = await campaignInWorkspace(id, req.params.campaignId);
  await prisma.$transaction([
    prisma.outboundMessage.updateMany({
      where: { workspaceId: id, emailCampaignId: campaign.id, status: { in: ['queued', 'scheduled', 'sending'] } },
      data: { status: 'cancelled', nextAttemptAt: null, lockedAt: null },
    }),
    prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'cancelled', cancelledAt: new Date() } }),
  ]);
  const updated = await campaignInWorkspace(id, campaign.id);
  res.json({ success: true, data: { campaign: updated } });
}));

// Direct email/SMS send and durable delivery log ---------------------------
router.post('/workspaces/:workspaceId/send/:channel', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const messageChannel = channel(req.params.channel);
  const scheduledFor = scheduledDate(req.body.scheduledFor);
  const recipient = value(req.body.recipient ?? req.body.to, 320);
  const contactId = value(req.body.contactId, 128);
  const templateId = value(req.body.templateId, 128);
  const body = value(req.body.body, messageChannel === 'sms' ? 1_600 : 100_000);
  const htmlBody = value(req.body.htmlBody, 100_000);
  const subject = value(req.body.subject, 998);
  if (!recipient && !contactId) throw new AppError(400, 'recipient or contactId is required');
  if (messageChannel === 'email' && !subject && !templateId) throw new AppError(400, 'Email subject or templateId is required');
  if (!body && !htmlBody && !templateId) throw new AppError(400, 'Message body, htmlBody, or templateId is required');
  if (messageChannel === 'sms' && htmlBody) throw new AppError(400, 'SMS messages cannot have an HTML body');
  const conversationId = value(req.body.conversationId, 128);
  if (conversationId && !await prisma.conversation.findFirst({ where: { id: conversationId, workspaceId: id }, select: { id: true } })) {
    throw new AppError(400, 'Conversation does not belong to this workspace');
  }

  const message = await messagingService.send({
    workspaceId: id,
    channel: messageChannel,
    recipient,
    contactId,
    conversationId,
    templateId,
    createdByUserId: req.auth!.userId,
    subject,
    body,
    htmlBody,
    variables: req.body.variables === undefined ? undefined : jsonValue(req.body.variables) as Record<string, unknown>,
    scheduledFor,
    idempotencyKey: value(req.body.idempotencyKey, 200),
    metadata: req.body.metadata === undefined ? undefined : jsonValue(req.body.metadata) as Record<string, unknown>,
  });
  res.status(scheduledFor ? 202 : 201).json({ success: true, data: { message } });
}));

router.get('/workspaces/:workspaceId/messages', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const { page, limit, skip } = pageParams(req);
  const where: any = { workspaceId: id };
  if (req.query.channel !== undefined) where.channel = channel(req.query.channel);
  const status = value(req.query.status, 32)?.toLowerCase();
  if (status) {
    if (!MESSAGE_STATUSES.has(status)) throw new AppError(400, 'Invalid message status');
    where.status = status;
  }
  const contactId = value(req.query.contactId, 128);
  if (contactId) where.contactId = contactId;
  const campaignId = value(req.query.campaignId, 128);
  if (campaignId) where.emailCampaignId = campaignId;
  const [messages, total] = await Promise.all([
    prisma.outboundMessage.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        emailTemplate: { select: { id: true, name: true } },
        smsTemplate: { select: { id: true, name: true } },
        emailCampaign: { select: { id: true, name: true } },
        _count: { select: { logs: true, trackingEvents: true } },
      },
    }),
    prisma.outboundMessage.count({ where }),
  ]);
  res.json({ success: true, data: { messages, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.get('/workspaces/:workspaceId/messages/:messageId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const message = await prisma.outboundMessage.findFirst({
    where: { id: req.params.messageId, workspaceId: id },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      emailTemplate: { select: { id: true, name: true } }, smsTemplate: { select: { id: true, name: true } },
      emailCampaign: { select: { id: true, name: true } }, logs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!message) throw new AppError(404, 'Message not found');
  res.json({ success: true, data: { message } });
}));

router.get('/workspaces/:workspaceId/messages/:messageId/logs', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const exists = await prisma.outboundMessage.findFirst({ where: { id: req.params.messageId, workspaceId: id }, select: { id: true } });
  if (!exists) throw new AppError(404, 'Message not found');
  const logs = await prisma.outboundMessageLog.findMany({ where: { workspaceId: id, outboundMessageId: exists.id }, orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: { logs } });
}));

router.get('/workspaces/:workspaceId/logs', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const { page, limit, skip } = pageParams(req);
  const where: any = { workspaceId: id };
  if (req.query.messageId) where.outboundMessageId = value(req.query.messageId, 128);
  const [logs, total] = await Promise.all([
    prisma.outboundMessageLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { outboundMessage: { select: { id: true, channel: true, recipient: true, status: true } } } }),
    prisma.outboundMessageLog.count({ where }),
  ]);
  res.json({ success: true, data: { logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.post('/workspaces/:workspaceId/messages/:messageId/retry', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  await messagingService.retry(id, req.params.messageId);
  res.status(202).json({ success: true });
}));

// Opt-out management --------------------------------------------------------
router.get('/workspaces/:workspaceId/opt-outs', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const { page, limit, skip } = pageParams(req);
  const where: any = { workspaceId: id };
  if (req.query.channel !== undefined) where.channel = channel(req.query.channel);
  if (req.query.active !== 'false') where.resubscribedAt = null;
  const [optOuts, total] = await Promise.all([
    prisma.communicationOptOut.findMany({ where, skip, take: limit, orderBy: { unsubscribedAt: 'desc' }, include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } }),
    prisma.communicationOptOut.count({ where }),
  ]);
  res.json({ success: true, data: { optOuts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.post('/workspaces/:workspaceId/opt-outs', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const optOutChannel = channel(req.body.channel);
  const contactId = value(req.body.contactId, 128);
  let address = value(req.body.address, 320);
  if (!address && contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: id, deletedAt: null }, select: { email: true, phone: true } });
    if (!contact) throw new AppError(404, 'Contact not found');
    address = optOutChannel === 'email' ? contact.email || undefined : contact.phone || undefined;
  }
  if (!address) throw new AppError(400, 'address or a contact with this channel is required');
  const optOut = await messagingService.optOut(id, optOutChannel, address, { contactId, reason: value(req.body.reason, 1_000), source: 'manual' });
  res.status(201).json({ success: true, data: { optOut } });
}));

router.delete('/workspaces/:workspaceId/opt-outs/:optOutId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  await messagingService.resubscribe(id, req.params.optOutId);
  // Preserve the regulatory audit row; deletion means "resubscribe" here.
  res.json({ success: true });
}));

router.post('/workspaces/:workspaceId/opt-outs/:optOutId/resubscribe', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  await messagingService.resubscribe(id, req.params.optOutId);
  res.json({ success: true });
}));

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

export default router;
