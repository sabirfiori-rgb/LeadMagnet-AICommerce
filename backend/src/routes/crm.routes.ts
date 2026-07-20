import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();
const defaultStages = ['New Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];

router.use(authMiddleware);

async function workspaceId(req: Request): Promise<string> {
  const id = req.params.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.auth!.userId, workspaceId: id } },
  });
  if (!member) throw new AppError(404, 'Workspace not found');
  return id;
}

function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function safeSort(value: unknown, allowed: string[], fallback: string) {
  return allowed.includes(String(value)) ? String(value) : fallback;
}

async function validateContactRelations(id: string, input: any, tagIds: string[] = [], customFieldIds: string[] = []) {
  if (input.companyId && !await prisma.company.findFirst({ where: { id: input.companyId, workspaceId: id, deletedAt: null } })) throw new AppError(400, 'Company does not belong to this workspace');
  if (input.assignedUserId && !await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: input.assignedUserId, workspaceId: id } } })) throw new AppError(400, 'Assigned user is not a workspace member');
  const uniqueTags = [...new Set(tagIds)];
  if (uniqueTags.length && await prisma.tag.count({ where: { workspaceId: id, id: { in: uniqueTags } } }) !== uniqueTags.length) throw new AppError(400, 'One or more tags do not belong to this workspace');
  const uniqueFields = [...new Set(customFieldIds)];
  if (uniqueFields.length && await prisma.customField.count({ where: { workspaceId: id, id: { in: uniqueFields } } }) !== uniqueFields.length) throw new AppError(400, 'One or more custom fields do not belong to this workspace');
}

// CRM dashboard
router.get('/workspaces/:workspaceId/dashboard', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const [contacts, opportunities, openTasks, pipelines] = await Promise.all([
    prisma.contact.count({ where: { workspaceId: id, deletedAt: null } }),
    prisma.opportunity.count({ where: { workspaceId: id, deletedAt: null } }),
    prisma.task.count({ where: { workspaceId: id, completed: false } }),
    prisma.pipeline.count({ where: { workspaceId: id, deletedAt: null } }),
  ]);
  res.json({ success: true, data: { contacts, opportunities, openTasks, pipelines } });
}));

// Contacts, including search, filters, sorting, pagination, import and export.
router.get('/workspaces/:workspaceId/contacts/export', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const contacts = await prisma.contact.findMany({ where: { workspaceId: id, deletedAt: null }, include: { company: true, tags: { include: { tag: true } } }, orderBy: { createdAt: 'desc' } });
  if (req.query.format === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['firstName,lastName,email,phone,company,jobTitle,address,source,tags,notes'];
    contacts.forEach(c => lines.push([c.firstName, c.lastName, c.email, c.phone, c.company?.name, c.jobTitle, c.address, c.source, c.tags.map(t => t.tag.name).join(';'), c.notes].map(esc).join(',')));
    res.type('text/csv').attachment('contacts.csv').send(lines.join('\n'));
    return;
  }
  res.json({ success: true, data: { contacts } });
}));

router.post('/workspaces/:workspaceId/contacts/import', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  if (!Array.isArray(req.body.contacts)) throw new AppError(400, 'contacts must be an array');
  const rows = req.body.contacts.slice(0, 1000).filter((c: any) => c.firstName && c.lastName);
  const created = await prisma.$transaction(rows.map((c: any) => prisma.contact.create({ data: {
    workspaceId: id, firstName: c.firstName, lastName: c.lastName, email: c.email || null, phone: c.phone || null,
    jobTitle: c.jobTitle || null, address: c.address || null, source: c.source || 'import', notes: c.notes || null,
  } })));
  res.status(201).json({ success: true, data: { imported: created.length } });
}));

router.get('/workspaces/:workspaceId/contacts', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const { page, limit, skip } = pageParams(req);
  const search = String(req.query.search || '').trim();
  const where: any = { workspaceId: id, deletedAt: null };
  if (search) where.OR = ['firstName', 'lastName', 'email', 'phone', 'jobTitle'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } }));
  if (req.query.source) where.source = String(req.query.source);
  if (req.query.assignedUserId) where.assignedUserId = String(req.query.assignedUserId);
  if (req.query.tagId) where.tags = { some: { tagId: String(req.query.tagId) } };
  const sortBy = safeSort(req.query.sortBy, ['firstName', 'lastName', 'email', 'createdAt', 'updatedAt'], 'createdAt');
  const direction = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, skip, take: limit, orderBy: { [sortBy]: direction }, include: { company: true, assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } }, tags: { include: { tag: true } } } }),
    prisma.contact.count({ where }),
  ]);
  res.json({ success: true, data: { contacts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.post('/workspaces/:workspaceId/contacts', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const { tagIds = [], customFields = {}, ...input } = req.body;
  if (!input.firstName || !input.lastName) throw new AppError(400, 'First name and last name are required');
  await validateContactRelations(id, input, tagIds, Object.keys(customFields));
  const contact = await prisma.$transaction(async tx => {
    const created = await tx.contact.create({ data: { ...input, workspaceId: id, tags: { create: tagIds.map((tagId: string) => ({ tagId })) } }, include: { tags: { include: { tag: true } } } });
    for (const [customFieldId, value] of Object.entries(customFields)) await tx.customFieldValue.create({ data: { contactId: created.id, customFieldId, value: String(value) } });
    await tx.contactActivity.create({ data: { workspaceId: id, contactId: created.id, type: 'contact_created', title: 'Contact created' } });
    return created;
  });
  res.status(201).json({ success: true, data: { contact } });
}));

router.get('/workspaces/:workspaceId/contacts/:contactId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req);
  const contact = await prisma.contact.findFirst({ where: { id: req.params.contactId, workspaceId: id, deletedAt: null }, include: { company: true, assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } }, tags: { include: { tag: true } }, customFieldValues: { include: { customField: true } }, activities: { orderBy: { createdAt: 'desc' } }, opportunities: { include: { pipeline: true, stage: true } } } });
  if (!contact) throw new AppError(404, 'Contact not found'); res.json({ success: true, data: { contact } });
}));

router.put('/workspaces/:workspaceId/contacts/:contactId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const existing = await prisma.contact.findFirst({ where: { id: req.params.contactId, workspaceId: id, deletedAt: null } });
  if (!existing) throw new AppError(404, 'Contact not found'); const { tagIds, customFields, ...input } = req.body;
  await validateContactRelations(id, input, tagIds || [], customFields ? Object.keys(customFields) : []);
  const contact = await prisma.$transaction(async tx => {
    if (tagIds) { await tx.contactTag.deleteMany({ where: { contactId: existing.id } }); await tx.contactTag.createMany({ data: tagIds.map((tagId: string) => ({ contactId: existing.id, tagId })), skipDuplicates: true }); }
    if (customFields) for (const [customFieldId, value] of Object.entries(customFields)) await tx.customFieldValue.upsert({ where: { contactId_customFieldId: { contactId: existing.id, customFieldId } }, create: { contactId: existing.id, customFieldId, value: String(value) }, update: { value: String(value) } });
    const updated = await tx.contact.update({ where: { id: existing.id }, data: input, include: { tags: { include: { tag: true } } } });
    await tx.contactActivity.create({ data: { workspaceId: id, contactId: existing.id, type: 'contact_updated', title: 'Contact updated' } }); return updated;
  }); res.json({ success: true, data: { contact } });
}));

router.delete('/workspaces/:workspaceId/contacts/:contactId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const result = await prisma.contact.updateMany({ where: { id: req.params.contactId, workspaceId: id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!result.count) throw new AppError(404, 'Contact not found'); res.json({ success: true });
}));

router.post('/workspaces/:workspaceId/contacts/:contactId/activities', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const contact = await prisma.contact.findFirst({ where: { id: req.params.contactId, workspaceId: id, deletedAt: null } }); if (!contact) throw new AppError(404, 'Contact not found');
  const { type = 'note', title, description, metadata } = req.body; if (!title) throw new AppError(400, 'Activity title is required');
  const activity = await prisma.contactActivity.create({ data: { workspaceId: id, contactId: contact.id, type, title, description, metadata } }); res.status(201).json({ success: true, data: { activity } });
}));

router.get('/workspaces/:workspaceId/tasks', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const where: any = { workspaceId: id };
  if (req.query.completed !== undefined) where.completed = req.query.completed === 'true';
  if (req.query.contactId) { const contact = await prisma.contact.findFirst({ where: { id: String(req.query.contactId), workspaceId: id, deletedAt: null } }); if (!contact) throw new AppError(404, 'Contact not found'); where.contactId = contact.id; }
  const tasks = await prisma.task.findMany({ where, orderBy: { dueDate: 'asc' } }); res.json({ success: true, data: { tasks } });
}));
router.post('/workspaces/:workspaceId/tasks', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const { contactId, title, ...input } = req.body; if (!title) throw new AppError(400, 'Task title is required');
  if (contactId && !await prisma.contact.findFirst({ where: { id: contactId, workspaceId: id, deletedAt: null } })) throw new AppError(400, 'Contact does not belong to this workspace');
  const task = await prisma.task.create({ data: { workspaceId: id, contactId: contactId || null, title, ...input } });
  if (contactId) await prisma.contactActivity.create({ data: { workspaceId: id, contactId, type: 'task', title: `Task created: ${title}` } }); res.status(201).json({ success: true, data: { task } });
}));
router.put('/workspaces/:workspaceId/tasks/:taskId', asyncHandler(async (req, res) => {
  const id = await workspaceId(req); const task = await prisma.task.findFirst({ where: { id: req.params.taskId, workspaceId: id } }); if (!task) throw new AppError(404, 'Task not found');
  const completed = req.body.completed; const updated = await prisma.task.update({ where: { id: task.id }, data: { ...req.body, completedAt: completed === true ? new Date() : completed === false ? null : undefined } }); res.json({ success: true, data: { task: updated } });
}));

// Tags and custom fields.
router.get('/workspaces/:workspaceId/tags', asyncHandler(async (req, res) => { const id = await workspaceId(req); res.json({ success: true, data: { tags: await prisma.tag.findMany({ where: { workspaceId: id }, orderBy: { name: 'asc' } }) } }); }));
router.post('/workspaces/:workspaceId/tags', asyncHandler(async (req, res) => { const id = await workspaceId(req); if (!req.body.name) throw new AppError(400, 'Tag name is required'); const tag = await prisma.tag.create({ data: { workspaceId: id, name: req.body.name, color: req.body.color || '#3B82F6' } }); res.status(201).json({ success: true, data: { tag } }); }));
router.put('/workspaces/:workspaceId/tags/:tagId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const result = await prisma.tag.updateMany({ where: { id: req.params.tagId, workspaceId: id }, data: { name: req.body.name, color: req.body.color } }); if (!result.count) throw new AppError(404, 'Tag not found'); res.json({ success: true }); }));
router.delete('/workspaces/:workspaceId/tags/:tagId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const result = await prisma.tag.deleteMany({ where: { id: req.params.tagId, workspaceId: id } }); if (!result.count) throw new AppError(404, 'Tag not found'); res.json({ success: true }); }));
router.get('/workspaces/:workspaceId/custom-fields', asyncHandler(async (req, res) => { const id = await workspaceId(req); res.json({ success: true, data: { customFields: await prisma.customField.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'asc' } }) } }); }));
router.post('/workspaces/:workspaceId/custom-fields', asyncHandler(async (req, res) => { const id = await workspaceId(req); const types = ['text', 'number', 'date', 'dropdown', 'checkbox', 'phone', 'email']; if (!req.body.name || !types.includes(req.body.fieldType)) throw new AppError(400, 'Valid name and field type are required'); const customField = await prisma.customField.create({ data: { workspaceId: id, name: req.body.name, fieldType: req.body.fieldType, options: req.body.options || [], isRequired: !!req.body.isRequired } }); res.status(201).json({ success: true, data: { customField } }); }));
router.put('/workspaces/:workspaceId/custom-fields/:fieldId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const result = await prisma.customField.updateMany({ where: { id: req.params.fieldId, workspaceId: id }, data: { name: req.body.name, options: req.body.options, isRequired: req.body.isRequired } }); if (!result.count) throw new AppError(404, 'Custom field not found'); res.json({ success: true }); }));
router.delete('/workspaces/:workspaceId/custom-fields/:fieldId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const result = await prisma.customField.deleteMany({ where: { id: req.params.fieldId, workspaceId: id } }); if (!result.count) throw new AppError(404, 'Custom field not found'); res.json({ success: true }); }));

// Pipelines, stages, opportunities and Kanban moves.
router.get('/workspaces/:workspaceId/pipelines', asyncHandler(async (req, res) => { const id = await workspaceId(req); const pipelines = await prisma.pipeline.findMany({ where: { workspaceId: id, deletedAt: null }, include: { stages: { orderBy: { order: 'asc' }, include: { opportunities: { where: { deletedAt: null }, include: { contact: true } } } } }, orderBy: { createdAt: 'asc' } }); res.json({ success: true, data: { pipelines } }); }));
router.post('/workspaces/:workspaceId/pipelines', asyncHandler(async (req, res) => { const id = await workspaceId(req); if (!req.body.name) throw new AppError(400, 'Pipeline name is required'); const stages = Array.isArray(req.body.stages) && req.body.stages.length ? req.body.stages : defaultStages; const pipeline = await prisma.pipeline.create({ data: { workspaceId: id, name: req.body.name, description: req.body.description, isDefault: !!req.body.isDefault, stages: { create: stages.map((name: string, order: number) => ({ name, order })) } }, include: { stages: { orderBy: { order: 'asc' } } } }); res.status(201).json({ success: true, data: { pipeline } }); }));
router.post('/workspaces/:workspaceId/pipelines/:pipelineId/stages', asyncHandler(async (req, res) => { const id = await workspaceId(req); const pipeline = await prisma.pipeline.findFirst({ where: { id: req.params.pipelineId, workspaceId: id, deletedAt: null } }); if (!pipeline) throw new AppError(404, 'Pipeline not found'); const stage = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: req.body.name, order: Number(req.body.order) || 0, color: req.body.color || '#3B82F6' } }); res.status(201).json({ success: true, data: { stage } }); }));
router.post('/workspaces/:workspaceId/opportunities', asyncHandler(async (req, res) => { const id = await workspaceId(req); const { contactId, pipelineId, stageId, title, ...input } = req.body; const [contact, pipeline, stage] = await Promise.all([prisma.contact.findFirst({ where: { id: contactId, workspaceId: id, deletedAt: null } }), prisma.pipeline.findFirst({ where: { id: pipelineId, workspaceId: id, deletedAt: null } }), prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } })]); if (!contact || !pipeline || !stage || !title) throw new AppError(400, 'Valid contact, pipeline, stage and title are required'); const opportunity = await prisma.$transaction(async tx => { const created = await tx.opportunity.create({ data: { workspaceId: id, contactId, pipelineId, stageId, title, ...input } }); await tx.contactActivity.create({ data: { workspaceId: id, contactId, type: 'pipeline_change', title: `Opportunity created in ${stage.name}` } }); return created; }); res.status(201).json({ success: true, data: { opportunity } }); }));
router.put('/workspaces/:workspaceId/opportunities/:opportunityId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const opportunity = await prisma.opportunity.findFirst({ where: { id: req.params.opportunityId, workspaceId: id, deletedAt: null } }); if (!opportunity) throw new AppError(404, 'Opportunity not found'); if (req.body.stageId) { const stage = await prisma.pipelineStage.findFirst({ where: { id: req.body.stageId, pipelineId: opportunity.pipelineId } }); if (!stage) throw new AppError(400, 'Stage does not belong to this pipeline'); } const updated = await prisma.opportunity.update({ where: { id: opportunity.id }, data: req.body, include: { contact: true, stage: true, pipeline: true } }); if (req.body.stageId) await prisma.contactActivity.create({ data: { workspaceId: id, contactId: opportunity.contactId, type: 'pipeline_change', title: `Moved to ${updated.stage.name}` } }); res.json({ success: true, data: { opportunity: updated } }); }));
router.delete('/workspaces/:workspaceId/opportunities/:opportunityId', asyncHandler(async (req, res) => { const id = await workspaceId(req); const result = await prisma.opportunity.updateMany({ where: { id: req.params.opportunityId, workspaceId: id, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw new AppError(404, 'Opportunity not found'); res.json({ success: true }); }));

export default router;
