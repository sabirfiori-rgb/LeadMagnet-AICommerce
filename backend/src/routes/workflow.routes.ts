import { Request, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_CONDITION_TYPES,
  WORKFLOW_TRIGGER_TYPES,
  workflowEngine,
} from '../services/workflow.engine.js';

const router = Router();
const prisma = new PrismaClient();
const nodeTypes = new Set(['trigger', 'action', 'delay', 'condition', 'branch']);

router.use(authMiddleware);

async function getWorkspaceId(req: Request): Promise<string> {
  const workspaceId = req.params.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.auth!.userId, workspaceId } },
  });
  // Return 404 rather than leaking the existence of another tenant's workspace.
  if (!member) throw new AppError(404, 'Workspace not found');
  return workspaceId;
}

async function getWorkflow(workspaceId: string, workflowId: string, includeGraph = false): Promise<any> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId, deletedAt: null },
    ...(includeGraph ? { include: { nodes: { orderBy: { createdAt: 'asc' } }, edges: { orderBy: { createdAt: 'asc' } } } } : {}),
  });
  if (!workflow) throw new AppError(404, 'Workflow not found');
  return workflow;
}

function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalise(value: unknown): string {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') || '';
}

function workflowInput(body: any) {
  const triggerType = body.triggerType === null ? null : normalise(body.triggerType);
  if (triggerType && !WORKFLOW_TRIGGER_TYPES.includes(triggerType as any)) {
    throw new AppError(400, 'Unsupported workflow trigger type');
  }
  const data: any = {};
  if (body.name !== undefined) {
    const name = stringValue(body.name);
    if (!name) throw new AppError(400, 'Workflow name is required');
    data.name = name.slice(0, 160);
  }
  if (body.description !== undefined) data.description = stringValue(body.description) || null;
  if (body.triggerType !== undefined) data.triggerType = triggerType;
  if (body.triggerConfig !== undefined) data.triggerConfig = asRecord(body.triggerConfig);
  return data;
}

function parseNode(input: any): { clientKey: string; existingId?: string; data: any } {
  const type = normalise(input.type);
  if (!nodeTypes.has(type)) throw new AppError(400, 'Invalid workflow node type');
  const suppliedId = stringValue(input.id);
  const clientId = stringValue(input.clientId) || suppliedId;
  if (!clientId) throw new AppError(400, 'Each workflow node requires an id or clientId');
  const position = asRecord(input.position);
  return {
    clientKey: clientId,
    existingId: suppliedId,
    data: {
      type,
      label: stringValue(input.label) || null,
      config: asRecord(input.config),
      positionX: numberValue(input.positionX ?? position.x),
      positionY: numberValue(input.positionY ?? position.y),
    },
  };
}

function parseEdge(input: any): { sourceRef: string; targetRef: string; sourceHandle: string; targetHandle: string; config: Record<string, unknown> } {
  const sourceRef = stringValue(input.sourceNodeId ?? input.source);
  const targetRef = stringValue(input.targetNodeId ?? input.target);
  if (!sourceRef || !targetRef) throw new AppError(400, 'Each edge requires a source and target node');
  if (sourceRef === targetRef) throw new AppError(400, 'A workflow edge cannot target the same node');
  return {
    sourceRef,
    targetRef,
    sourceHandle: stringValue(input.sourceHandle) || 'default',
    targetHandle: stringValue(input.targetHandle) || 'default',
    config: asRecord(input.config),
  };
}

async function replaceGraph(workflow: any, rawNodes: unknown, rawEdges: unknown): Promise<any> {
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    throw new AppError(400, 'Saving a graph requires both nodes and edges arrays');
  }
  if (rawNodes.length > 200 || rawEdges.length > 500) throw new AppError(400, 'Workflow graph is too large');
  const nodes = rawNodes.map(parseNode);
  const clientKeys = new Set<string>();
  for (const node of nodes) {
    if (clientKeys.has(node.clientKey)) throw new AppError(400, 'Workflow node ids must be unique');
    clientKeys.add(node.clientKey);
  }
  const existingNodes = await prisma.workflowNode.findMany({ where: { workflowId: workflow.id } });
  const existingById = new Map(existingNodes.map((node) => [node.id, node]));
  const suppliedExistingIds = nodes.map((node) => node.existingId).filter((id): id is string => Boolean(id));
  const foreignNodes = suppliedExistingIds.filter((id) => !existingById.has(id));
  if (foreignNodes.length > 0) {
    const conflicting = await prisma.workflowNode.findFirst({ where: { id: { in: foreignNodes } }, select: { id: true } });
    if (conflicting) throw new AppError(400, 'Workflow nodes cannot be reused across workflows');
  }

  const edgeInputs = rawEdges.map(parseEdge);
  const edgeKeys = new Set<string>();
  for (const edge of edgeInputs) {
    const key = `${edge.sourceRef}|${edge.targetRef}|${edge.sourceHandle}|${edge.targetHandle}`;
    if (edgeKeys.has(key)) throw new AppError(400, 'Duplicate workflow edge');
    edgeKeys.add(key);
  }

  await prisma.$transaction(async (tx) => {
    const retainedIds = new Set(nodes.filter((node) => node.existingId && existingById.has(node.existingId)).map((node) => node.existingId!));
    await tx.workflowEdge.deleteMany({ where: { workflowId: workflow.id } });
    await tx.workflowNode.deleteMany({ where: { workflowId: workflow.id, id: { notIn: [...retainedIds] } } });

    const idMap = new Map<string, string>();
    for (const node of nodes) {
      if (node.existingId && existingById.has(node.existingId)) {
        await tx.workflowNode.update({ where: { id: node.existingId }, data: node.data });
        idMap.set(node.clientKey, node.existingId);
        idMap.set(node.existingId, node.existingId);
      } else {
        const created = await tx.workflowNode.create({ data: { workflowId: workflow.id, ...node.data } });
        idMap.set(node.clientKey, created.id);
      }
    }

    const edges = edgeInputs.map((edge) => {
      const sourceNodeId = idMap.get(edge.sourceRef);
      const targetNodeId = idMap.get(edge.targetRef);
      if (!sourceNodeId || !targetNodeId) throw new AppError(400, 'An edge references a node outside this workflow');
      return {
        workflowId: workflow.id,
        sourceNodeId,
        targetNodeId,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        config: edge.config as any,
      };
    });
    if (edges.length) await tx.workflowEdge.createMany({ data: edges });
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
  });

  return getWorkflow(workflow.workspaceId, workflow.id, true);
}

function assertActivatable(workflow: any): void {
  if (!workflow.triggerType) throw new AppError(400, 'Select a workflow trigger before activating');
  const triggerNodes = workflow.nodes.filter((node: any) => normalise(node.type) === 'trigger');
  if (!triggerNodes.length) throw new AppError(400, 'A workflow requires a trigger node before activation');
  if (!workflow.nodes.some((node: any) => normalise(node.type) !== 'trigger')) {
    throw new AppError(400, 'A workflow requires at least one action, condition, branch, or delay node');
  }

  const nodeIds = new Set(workflow.nodes.map((node: any) => node.id));
  if (workflow.edges.some((edge: any) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))) {
    throw new AppError(400, 'Workflow contains a connection to a missing node');
  }

  for (const node of triggerNodes) {
    const configuredTrigger = normalise(asRecord(node.config).triggerType || asRecord(node.config).eventType);
    if (configuredTrigger && configuredTrigger !== workflow.triggerType) {
      throw new AppError(400, 'Every trigger node must match the workflow trigger');
    }
  }

  const outgoing = new Map<string, any[]>();
  for (const edge of workflow.edges) {
    const list = outgoing.get(edge.sourceNodeId) || [];
    list.push(edge);
    outgoing.set(edge.sourceNodeId, list);
  }

  for (const node of workflow.nodes) {
    const type = normalise(node.type);
    const config = asRecord(node.config);
    if (type === 'action') {
      const action = normalise(config.action || config.actionType || config.type);
      if (!WORKFLOW_ACTION_TYPES.includes(action as any)) throw new AppError(400, `Action node “${node.label || node.id}” has an unsupported action`);
    }
    if (type === 'condition') {
      const condition = normalise(config.condition || config.conditionType || config.type);
      if (!WORKFLOW_CONDITION_TYPES.includes(condition as any)) throw new AppError(400, `Condition node “${node.label || node.id}” has an unsupported condition`);
    }
    if (type === 'condition' || type === 'branch') {
      const paths = outgoing.get(node.id) || [];
      if (paths.length < 2) throw new AppError(400, `${type === 'condition' ? 'Condition' : 'Branch'} nodes require two outgoing paths`);
      const handles = new Set(paths.map((edge) => normalise(edge.sourceHandle)));
      const defaultPaths = paths.filter((edge) => ['default', '', 'next'].includes(normalise(edge.sourceHandle)));
      if (!(handles.has('true') && handles.has('false')) && defaultPaths.length < 2) {
        throw new AppError(400, `${type === 'condition' ? 'Condition' : 'Branch'} paths must use true/false handles or two default paths`);
      }
    }
  }

  // Avoid silently activating detached nodes: every node must be reachable
  // from one of the event triggers.
  const reachable = new Set<string>(triggerNodes.map((node: any) => node.id));
  const queue = [...reachable];
  while (queue.length) {
    const nodeId = queue.shift()!;
    for (const edge of outgoing.get(nodeId) || []) {
      if (!reachable.has(edge.targetNodeId)) {
        reachable.add(edge.targetNodeId);
        queue.push(edge.targetNodeId);
      }
    }
  }
  if (reachable.size !== nodeIds.size) throw new AppError(400, 'Connect every workflow node to a trigger before activation');

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const edge of outgoing.get(nodeId) || []) if (visit(edge.targetNodeId)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if (workflow.nodes.some((node: any) => visit(node.id))) {
    throw new AppError(400, 'Workflow cycles are not supported; use a delay and separate workflow instead');
  }
}

// Workflows
router.get('/workspaces/:workspaceId/workflows', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const where: any = { workspaceId, deletedAt: null };
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.active === 'true') where.isActive = true;
  if (req.query.active === 'false') where.isActive = false;
  const search = stringValue(req.query.search);
  if (search) where.name = { contains: search, mode: 'insensitive' };
  const workflows = await prisma.workflow.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { nodes: true, executions: true } } },
  });
  res.json({ success: true, data: { workflows } });
}));

router.post('/workspaces/:workspaceId/workflows', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const input = workflowInput(req.body);
  if (!input.name) throw new AppError(400, 'Workflow name is required');
  const workflow = await prisma.workflow.create({
    data: {
      workspaceId,
      createdByUserId: req.auth!.userId,
      name: input.name,
      description: input.description,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig,
      status: 'draft',
      isActive: false,
    },
    include: { nodes: true, edges: true },
  });
  res.status(201).json({ success: true, data: { workflow } });
}));

router.get('/workspaces/:workspaceId/workflows/:workflowId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId, true);
  res.json({ success: true, data: { workflow } });
}));

router.put('/workspaces/:workspaceId/workflows/:workflowId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId, true);
  const input = workflowInput(req.body);
  if (Object.keys(input).length) {
    await prisma.workflow.update({ where: { id: workflow.id }, data: { ...input, version: { increment: 1 } } });
  }
  const hasNodes = req.body.nodes !== undefined;
  const hasEdges = req.body.edges !== undefined;
  if (hasNodes || hasEdges) {
    const saved = await replaceGraph({ ...workflow, ...input }, req.body.nodes, req.body.edges);
    res.json({ success: true, data: { workflow: saved } });
    return;
  }
  const saved = await getWorkflow(workspaceId, workflow.id, true);
  res.json({ success: true, data: { workflow: saved } });
}));

router.delete('/workspaces/:workspaceId/workflows/:workflowId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { deletedAt: new Date(), isActive: false, status: 'archived', version: { increment: 1 } },
  });
  res.json({ success: true });
}));

router.post('/workspaces/:workspaceId/workflows/:workflowId/activate', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId, true);
  assertActivatable(workflow);
  const updated = await prisma.workflow.update({
    where: { id: workflow.id },
    data: { isActive: true, status: 'active', version: { increment: 1 } },
    include: { nodes: true, edges: true },
  });
  res.json({ success: true, data: { workflow: updated } });
}));

router.post('/workspaces/:workspaceId/workflows/:workflowId/deactivate', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const updated = await prisma.workflow.update({
    where: { id: workflow.id },
    data: { isActive: false, status: 'inactive', version: { increment: 1 } },
  });
  res.json({ success: true, data: { workflow: updated } });
}));

/** Manual/test trigger. Domain events should call dispatchWorkflowEvent instead. */
router.post('/workspaces/:workspaceId/workflows/:workflowId/trigger', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  if (!workflow.isActive || workflow.status !== 'active') throw new AppError(400, 'Activate the workflow before triggering it');
  const contactId = stringValue(req.body.contactId);
  if (contactId && !await prisma.contact.findFirst({ where: { id: contactId, workspaceId, deletedAt: null }, select: { id: true } })) {
    throw new AppError(400, 'Contact does not belong to this workspace');
  }
  const triggerType = normalise(req.body.triggerType || workflow.triggerType);
  if (triggerType && !WORKFLOW_TRIGGER_TYPES.includes(triggerType as any)) throw new AppError(400, 'Unsupported workflow trigger type');
  const execution = await workflowEngine.trigger({
    workspaceId,
    workflowId: workflow.id,
    contactId,
    triggeredByUserId: req.auth!.userId,
    triggerType,
    payload: asRecord(req.body.payload),
    deduplicationKey: stringValue(req.body.deduplicationKey),
    maxAttempts: req.body.maxAttempts === undefined ? undefined : Number(req.body.maxAttempts),
  });
  res.status(execution.duplicate ? 200 : 202).json({ success: true, data: { execution } });
}));

// Nodes and edges are available for incremental editor updates. The PUT
// workflow endpoint is preferable for an atomic full-graph save.
router.post('/workspaces/:workspaceId/workflows/:workflowId/nodes', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const node = parseNode({ ...req.body, clientId: req.body.clientId || `new-${Date.now()}` });
  const created = await prisma.$transaction(async (tx) => {
    const newNode = await tx.workflowNode.create({ data: { workflowId: workflow.id, ...node.data } });
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
    return newNode;
  });
  res.status(201).json({ success: true, data: { node: created } });
}));

router.put('/workspaces/:workspaceId/workflows/:workflowId/nodes/:nodeId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const node = await prisma.workflowNode.findFirst({ where: { id: req.params.nodeId, workflowId: workflow.id } });
  if (!node) throw new AppError(404, 'Workflow node not found');
  const parsed = parseNode({ ...req.body, id: node.id });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workflowNode.update({ where: { id: node.id }, data: parsed.data });
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
    return result;
  });
  res.json({ success: true, data: { node: updated } });
}));

router.delete('/workspaces/:workspaceId/workflows/:workflowId/nodes/:nodeId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.workflowNode.deleteMany({ where: { id: req.params.nodeId, workflowId: workflow.id } });
    if (!deleted.count) throw new AppError(404, 'Workflow node not found');
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
    return deleted;
  });
  res.json({ success: true, data: { deleted: result.count } });
}));

router.post('/workspaces/:workspaceId/workflows/:workflowId/edges', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const edge = parseEdge(req.body);
  const [source, target] = await Promise.all([
    prisma.workflowNode.findFirst({ where: { id: edge.sourceRef, workflowId: workflow.id }, select: { id: true } }),
    prisma.workflowNode.findFirst({ where: { id: edge.targetRef, workflowId: workflow.id }, select: { id: true } }),
  ]);
  if (!source || !target) throw new AppError(400, 'Workflow edge nodes must belong to this workflow');
  const created = await prisma.$transaction(async (tx) => {
    const newEdge = await tx.workflowEdge.create({ data: { workflowId: workflow.id, sourceNodeId: source.id, targetNodeId: target.id, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle, config: edge.config as any } });
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
    return newEdge;
  });
  res.status(201).json({ success: true, data: { edge: created } });
}));

router.delete('/workspaces/:workspaceId/workflows/:workflowId/edges/:edgeId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.workflowEdge.deleteMany({ where: { id: req.params.edgeId, workflowId: workflow.id } });
    if (!deleted.count) throw new AppError(404, 'Workflow edge not found');
    await tx.workflow.update({ where: { id: workflow.id }, data: { version: { increment: 1 } } });
    return deleted;
  });
  res.json({ success: true, data: { deleted: result.count } });
}));

// Execution history and logs
router.get('/workspaces/:workspaceId/workflows/:workflowId/executions', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const workflow = await getWorkflow(workspaceId, req.params.workflowId);
  const { page, limit, skip } = pageParams(req);
  const where: any = { workspaceId, workflowId: workflow.id };
  if (req.query.status) where.status = String(req.query.status);
  const [executions, total] = await Promise.all([
    prisma.workflowExecution.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        logs: { select: { id: true, level: true, event: true, message: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 },
        _count: { select: { logs: true } },
      },
    }),
    prisma.workflowExecution.count({ where }),
  ]);
  res.json({ success: true, data: { executions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}));

router.get('/workspaces/:workspaceId/executions/:executionId', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: req.params.executionId, workspaceId },
    include: {
      workflow: { select: { id: true, name: true, triggerType: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      logs: { orderBy: { createdAt: 'asc' }, include: { workflowNode: { select: { id: true, label: true, type: true } } } },
    },
  });
  if (!execution) throw new AppError(404, 'Workflow execution not found');
  res.json({ success: true, data: { execution } });
}));

router.post('/workspaces/:workspaceId/executions/:executionId/retry', asyncHandler(async (req, res) => {
  const workspaceId = await getWorkspaceId(req);
  const execution = await prisma.workflowExecution.findFirst({ where: { id: req.params.executionId, workspaceId }, select: { id: true, workflowId: true } });
  if (!execution) throw new AppError(404, 'Workflow execution not found');
  try {
    await workflowEngine.retry(workspaceId, execution.id);
  } catch (error) {
    throw new AppError(400, error instanceof Error ? error.message : 'Unable to retry workflow execution');
  }
  res.status(202).json({ success: true });
}));

// Starting the route also starts a durable polling loop that resumes delayed
// jobs after a process restart. It is unref'd by the engine, so it does not
// prevent a clean test/process shutdown.
workflowEngine.start();

export default router;
