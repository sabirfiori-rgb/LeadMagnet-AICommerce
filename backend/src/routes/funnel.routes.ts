import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { funnelService } from '../services/funnel.service.js';
import type { FunnelType, FunnelPageType, BlockType } from '../services/funnel.service.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

async function getWorkspaceId(req: Request): Promise<string> {
  const workspaceId = req.params.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.auth!.userId, workspaceId } },
  });
  if (!member) throw new AppError(404, 'Workspace not found');
  return workspaceId;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// ============= FUNNEL CRUD =============

router.get('/workspaces/:workspaceId/funnels', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const { status, search, page, limit } = req.query;
  const result = await funnelService.list(workspaceId, {
    status: stringValue(status),
    search: stringValue(search),
    page: Number(page) || 1,
    limit: Number(limit) || 25,
  });
  res.json({ success: true, data: result });
}));

router.post('/workspaces/:workspaceId/funnels', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.create(workspaceId, req.auth!.userId, {
    name: req.body.name,
    description: req.body.description,
    funnelType: req.body.funnelType as FunnelType,
    tags: req.body.tags,
    settings: req.body.settings,
    seoMeta: req.body.seoMeta,
  });
  res.status(201).json({ success: true, data: { funnel } });
}));

router.get('/workspaces/:workspaceId/funnels/:funnelId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.get(workspaceId, req.params.funnelId);
  res.json({ success: true, data: { funnel } });
}));

router.put('/workspaces/:workspaceId/funnels/:funnelId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.update(workspaceId, req.params.funnelId, {
    name: req.body.name,
    description: req.body.description,
    slug: req.body.slug,
    funnelType: req.body.funnelType as FunnelType,
    tags: req.body.tags,
    settings: req.body.settings,
    seoMeta: req.body.seoMeta,
    customDomain: req.body.customDomain,
  });
  res.json({ success: true, data: { funnel } });
}));

router.delete('/workspaces/:workspaceId/funnels/:funnelId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.delete(workspaceId, req.params.funnelId);
  res.json({ success: true });
}));

// ============= FUNNEL ACTIONS =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/duplicate', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.duplicate(workspaceId, req.params.funnelId, req.auth!.userId);
  res.status(201).json({ success: true, data: { funnel } });
}));

router.post('/workspaces/:workspaceId/funnels/:funnelId/publish', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.publish(workspaceId, req.params.funnelId, req.auth!.userId);
  res.json({ success: true, data: { funnel } });
}));

router.post('/workspaces/:workspaceId/funnels/:funnelId/unpublish', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.unpublish(workspaceId, req.params.funnelId);
  res.json({ success: true });
}));

router.post('/workspaces/:workspaceId/funnels/:funnelId/archive', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.archive(workspaceId, req.params.funnelId);
  res.json({ success: true });
}));

// ============= VERSION HISTORY =============

router.get('/workspaces/:workspaceId/funnels/:funnelId/versions', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const versions = await funnelService.listVersions(workspaceId, req.params.funnelId);
  res.json({ success: true, data: { versions } });
}));

router.post('/workspaces/:workspaceId/funnels/:funnelId/versions/:versionId/restore', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.restoreVersion(workspaceId, req.params.funnelId, req.params.versionId, req.auth!.userId);
  res.json({ success: true, data: { funnel } });
}));

// ============= EXPORT / IMPORT =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/export', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const exportData = await funnelService.exportFunnel(workspaceId, req.params.funnelId);
  res.json({ success: true, data: exportData });
}));

router.post('/workspaces/:workspaceId/funnels/import', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await funnelService.importFunnel(workspaceId, req.auth!.userId, req.body);
  res.status(201).json({ success: true, data: { funnel } });
}));

// ============= PAGE MANAGEMENT =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/pages', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const page = await funnelService.createPage(workspaceId, req.params.funnelId, {
    pageType: req.body.pageType as FunnelPageType,
    name: req.body.name,
    slug: req.body.slug,
    sortOrder: req.body.sortOrder,
    isHomePage: req.body.isHomePage,
    settings: req.body.settings,
    seoMeta: req.body.seoMeta,
  });
  res.status(201).json({ success: true, data: { page } });
}));

router.put('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const page = await funnelService.updatePage(workspaceId, req.params.funnelId, req.params.pageId, {
    pageType: req.body.pageType as FunnelPageType,
    name: req.body.name,
    slug: req.body.slug,
    sortOrder: req.body.sortOrder,
    isHomePage: req.body.isHomePage,
    settings: req.body.settings,
    seoMeta: req.body.seoMeta,
  });
  res.json({ success: true, data: { page } });
}));

router.delete('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.deletePage(workspaceId, req.params.funnelId, req.params.pageId);
  res.json({ success: true });
}));

// ============= BLOCK MANAGEMENT =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId/blocks', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const block = await funnelService.createBlock(workspaceId, req.params.funnelId, req.params.pageId, {
    blockType: req.body.blockType as BlockType,
    blockName: req.body.blockName,
    parentId: req.body.parentId,
    content: req.body.content,
    styles: req.body.styles,
    responsiveStyles: req.body.responsiveStyles,
    animation: req.body.animation,
    visibility: req.body.visibility,
    sortOrder: req.body.sortOrder,
  });
  res.status(201).json({ success: true, data: { block } });
}));

router.put('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId/blocks/:blockId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const block = await funnelService.updateBlock(workspaceId, req.params.funnelId, req.params.pageId, req.params.blockId, {
    blockName: req.body.blockName,
    content: req.body.content,
    styles: req.body.styles,
    responsiveStyles: req.body.responsiveStyles,
    animation: req.body.animation,
    visibility: req.body.visibility,
    sortOrder: req.body.sortOrder,
    isHidden: req.body.isHidden,
  });
  res.json({ success: true, data: { block } });
}));

router.delete('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId/blocks/:blockId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.deleteBlock(workspaceId, req.params.funnelId, req.params.pageId, req.params.blockId);
  res.json({ success: true });
}));

router.put('/workspaces/:workspaceId/funnels/:funnelId/pages/:pageId/blocks/reorder', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.reorderBlocks(workspaceId, req.params.funnelId, req.params.pageId, req.body.blockOrder);
  res.json({ success: true });
}));

// ============= FORM MANAGEMENT =============

router.get('/workspaces/:workspaceId/funnels/:funnelId/forms', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const forms = await funnelService.listForms(workspaceId, req.params.funnelId);
  res.json({ success: true, data: { forms } });
}));

router.post('/workspaces/:workspaceId/funnels/:funnelId/forms', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const form = await funnelService.createForm(workspaceId, req.params.funnelId, {
    name: req.body.name,
    fields: req.body.fields,
    settings: req.body.settings,
    afterSubmission: req.body.afterSubmission,
  });
  res.status(201).json({ success: true, data: { form } });
}));

router.put('/workspaces/:workspaceId/funnels/:funnelId/forms/:formId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const form = await funnelService.updateForm(workspaceId, req.params.funnelId, req.params.formId, req.body);
  res.json({ success: true, data: { form } });
}));

router.delete('/workspaces/:workspaceId/funnels/:funnelId/forms/:formId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  await funnelService.deleteForm(workspaceId, req.params.funnelId, req.params.formId);
  res.json({ success: true });
}));

// ============= FORM SUBMISSIONS =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/forms/:formId/submit', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const submission = await funnelService.submitForm(workspaceId, req.params.funnelId, req.params.formId, req.body.data, req.body.metadata, req.body.contactId);
  res.status(201).json({ success: true, data: { submission } });
}));

router.get('/workspaces/:workspaceId/funnels/:funnelId/forms/:formId/submissions', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const { page, limit } = req.query;
  const result = await funnelService.listSubmissions(workspaceId, req.params.funnelId, req.params.formId, {
    page: Number(page) || 1,
    limit: Number(limit) || 25,
  });
  res.json({ success: true, data: result });
}));

// ============= ANALYTICS =============

router.post('/workspaces/:workspaceId/funnels/:funnelId/analytics/track', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const analytics = await prisma.funnelAnalytics.create({
    data: {
      funnelId: req.params.funnelId,
      pageId: req.body.pageId || null,
      eventType: req.body.eventType || 'page_view',
      visitorId: req.body.visitorId,
      sessionId: req.body.sessionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      url: req.body.url,
      referrer: req.body.referrer,
      utmSource: req.body.utmSource,
      utmMedium: req.body.utmMedium,
      utmCampaign: req.body.utmCampaign,
      utmTerm: req.body.utmTerm,
      utmContent: req.body.utmContent,
      device: req.body.device,
      browser: req.body.browser,
      country: req.body.country,
      metadata: req.body.metadata || undefined,
    },
  });
  res.status(201).json({ success: true, data: { analytics } });
}));

router.get('/workspaces/:workspaceId/funnels/:funnelId/analytics', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await prisma.funnel.findFirst({ where: { id: req.params.funnelId, workspaceId, deletedAt: null } });
  if (!funnel) throw new AppError(404, 'Funnel not found');

  const { startDate, endDate, eventType } = req.query;
  const where: any = { funnelId: funnel.id };
  if (eventType) where.eventType = eventType;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate as string);
    if (endDate) where.createdAt.lte = new Date(endDate as string);
  }

  const [totalVisitors, totalPageViews, totalConversions, byEventType, recentAnalytics] = await Promise.all([
    prisma.funnelAnalytics.groupBy({ by: ['visitorId'], where, _count: true }),
    prisma.funnelAnalytics.count({ where: { ...where, eventType: 'page_view' } }),
    prisma.funnelAnalytics.count({ where: { ...where, eventType: 'conversion' } }),
    prisma.funnelAnalytics.groupBy({ by: ['eventType'], where, _count: true }),
    prisma.funnelAnalytics.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  res.json({
    success: true,
    data: {
      summary: {
        uniqueVisitors: totalVisitors.length,
        totalPageViews,
        totalConversions,
        conversionRate: totalPageViews > 0 ? ((totalConversions / totalPageViews) * 100).toFixed(2) : '0.00',
      },
      byEventType: byEventType.map((e) => ({ eventType: e.eventType, count: e._count })),
      recent: recentAnalytics,
    },
  });
}));

router.get('/workspaces/:workspaceId/funnels/:funnelId/analytics/traffic-sources', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const funnel = await prisma.funnel.findFirst({ where: { id: req.params.funnelId, workspaceId, deletedAt: null } });
  if (!funnel) throw new AppError(404, 'Funnel not found');

  const sources = await prisma.funnelAnalytics.groupBy({
    by: ['utmSource', 'utmMedium'],
    where: { funnelId: funnel.id },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  res.json({
    success: true,
    data: {
      sources: sources.map((s) => ({
        source: s.utmSource || 'direct',
        medium: s.utmMedium || 'none',
        count: s._count.id,
      })),
    },
  });
}));

export default router;
