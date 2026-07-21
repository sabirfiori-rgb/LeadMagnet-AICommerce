import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  WorkflowProviderResult,
  workflowProviders,
} from '../providers/workflow.provider.js';

const prisma = new PrismaClient();

export const WORKFLOW_TRIGGER_TYPES = [
  'contact_created',
  'contact_tag_added',
  'contact_tag_removed',
  'form_submitted',
  'opportunity_created',
  'opportunity_stage_changed',
  'appointment_booked',
  'incoming_message_received',
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];

export const WORKFLOW_ACTION_TYPES = [
  'add_tag',
  'remove_tag',
  'create_task',
  'update_contact',
  'move_opportunity',
  'send_email',
  'send_sms',
  'wait',
  'webhook',
  'assign_user',
] as const;

export const WORKFLOW_CONDITION_TYPES = [
  'contact_has_tag',
  'contact_field_equals',
  'opportunity_stage',
  'email_status',
  'appointment_status',
] as const;

type JsonRecord = Record<string, unknown>;
type ExecutionStatus = 'queued' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowEvent {
  workspaceId: string;
  type: WorkflowTriggerType | string;
  contactId?: string | null;
  triggeredByUserId?: string | null;
  payload?: JsonRecord;
  /** A provider/event identifier. Reusing it makes dispatch idempotent. */
  deduplicationKey?: string;
}

export interface TriggerWorkflowInput {
  workspaceId: string;
  workflowId: string;
  contactId?: string | null;
  triggeredByUserId?: string | null;
  triggerType?: string | null;
  payload?: JsonRecord;
  deduplicationKey?: string;
  maxAttempts?: number;
}

interface WorkflowState {
  pendingNodeIds: string[];
  completedNodeIds: string[];
  decisions: Record<string, boolean | string>;
  actionResults: Record<string, JsonRecord>;
  waitingNodeId?: string;
  steps: number;
}

interface ProcessResult {
  nextNodeIds: string[];
  deferred?: { nextRunAt: Date; durationMs: number };
  result?: JsonRecord;
}

/**
 * Durable queue facade backed by WorkflowExecution. The in-memory set only
 * coalesces local wakeups; the database remains the source of truth, so a
 * restart can safely resume queued and delayed work.
 */
class DurableWorkflowQueue {
  private readonly pending = new Set<string>();
  private isDraining = false;
  private poller?: NodeJS.Timeout;

  constructor(private readonly engine: WorkflowEngine) {}

  start(): void {
    if (this.poller) return;
    this.poller = setInterval(() => {
      void this.recoverAndEnqueue();
    }, 5_000);
    this.poller.unref();
    void this.recoverAndEnqueue();
  }

  enqueue(executionId: string): void {
    this.start();
    this.pending.add(executionId);
    void this.drain();
  }

  private async enqueueDueExecutions(): Promise<void> {
    try {
      const due = await prisma.workflowExecution.findMany({
        where: {
          status: { in: ['queued', 'waiting'] },
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
        },
        select: { id: true },
        orderBy: { nextRunAt: 'asc' },
        take: 100,
      });
      for (const execution of due) this.enqueue(execution.id);
    } catch (error) {
      // A database outage should not crash the API process; the next poll
      // (or a later event) resumes durable executions.
      console.error('Unable to poll workflow executions', error);
    }
  }

  private async recoverAndEnqueue(): Promise<void> {
    await this.reclaimStaleExecutions();
    await this.enqueueDueExecutions();
  }

  /**
   * A process can die after claiming a job. There is no external queue lease
   * column in this first implementation, so reclaim only executions whose
   * `updatedAt` heartbeat is stale. The engine updates it on every claimed
   * run and after every completed node, avoiding duplicate reclaim of a
   * legitimate long workflow.
   */
  private async reclaimStaleExecutions(): Promise<void> {
    const staleAfterMs = Math.max(60_000, Number(process.env.WORKFLOW_STALE_EXECUTION_MS) || 5 * 60_000);
    const staleBefore = new Date(Date.now() - staleAfterMs);
    try {
      const stale = await prisma.workflowExecution.findMany({
        where: { status: 'running', updatedAt: { lte: staleBefore } },
        select: { id: true, workspaceId: true },
        take: 100,
      });
      for (const execution of stale) {
        const reclaimed = await prisma.workflowExecution.updateMany({
          where: { id: execution.id, status: 'running', updatedAt: { lte: staleBefore } },
          data: { status: 'queued', nextRunAt: new Date(), error: 'Execution reclaimed after an interrupted worker' },
        });
        if (reclaimed.count) {
          await prisma.workflowExecutionLog.create({
            data: {
              workspaceId: execution.workspaceId,
              executionId: execution.id,
              level: 'warn',
              event: 'execution_reclaimed',
              message: 'Execution requeued after an interrupted worker',
            },
          });
        }
      }
    } catch (error) {
      console.error('Unable to reclaim stale workflow executions', error);
    }
  }

  private async drain(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (this.pending.size > 0) {
        const [executionId] = this.pending;
        if (!executionId) break;
        this.pending.delete(executionId);
        await this.engine.runExecution(executionId);
      }
    } finally {
      this.isDraining = false;
      if (this.pending.size > 0) void this.drain();
    }
  }
}

export class WorkflowEngine {
  private readonly queue = new DurableWorkflowQueue(this);

  start(): void {
    this.queue.start();
  }

  /**
   * Dispatch an application event to every matching, active workflow. This
   * is intentionally exported for CRM, inbox, forms, and appointments to
   * call after their own database transaction succeeds.
   */
  async dispatch(event: WorkflowEvent): Promise<Array<{ workflowId: string; executionId: string; duplicate: boolean }>> {
    const workflows = await prisma.workflow.findMany({
      where: {
        workspaceId: event.workspaceId,
        deletedAt: null,
        isActive: true,
        status: 'active',
        triggerType: event.type,
      },
      select: { id: true },
    });

    return Promise.all(workflows.map(async (workflow) => {
      const execution = await this.trigger({
        workspaceId: event.workspaceId,
        workflowId: workflow.id,
        contactId: event.contactId,
        triggeredByUserId: event.triggeredByUserId,
        triggerType: event.type,
        payload: event.payload,
        deduplicationKey: event.deduplicationKey
          ? `${event.type}:${event.deduplicationKey}`
          : undefined,
      });
      return { workflowId: workflow.id, executionId: execution.id, duplicate: execution.duplicate };
    }));
  }

  /** Creates (or returns) a durable execution and schedules it immediately. */
  async trigger(input: TriggerWorkflowInput): Promise<{ id: string; duplicate: boolean }> {
    const workflow = await prisma.workflow.findFirst({
      where: { id: input.workflowId, workspaceId: input.workspaceId, deletedAt: null },
      select: {
        id: true,
        triggerType: true,
        version: true,
        nodes: { select: { id: true, type: true, label: true, config: true } },
        edges: { select: { id: true, sourceNodeId: true, targetNodeId: true, sourceHandle: true, targetHandle: true, config: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!workflow) throw new Error('Workflow not found in this workspace');

    if (input.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: input.contactId, workspaceId: input.workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (!contact) throw new Error('Contact does not belong to this workspace');
    }

    const eventPayload = input.payload || {};
    const deduplicationKey = input.deduplicationKey || this.createDeduplicationKey(input, eventPayload);
    const state: WorkflowState = {
      pendingNodeIds: [],
      completedNodeIds: [],
      decisions: {},
      actionResults: {},
      steps: 0,
    };

    try {
      const execution = await prisma.workflowExecution.create({
        data: {
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          contactId: input.contactId || null,
          triggeredByUserId: input.triggeredByUserId || null,
          triggerType: input.triggerType || workflow.triggerType || null,
          payload: toInputJson(eventPayload),
          context: toInputJson({
            workflowState: state,
            // A queued run must execute the graph that was active when its
            // triggering event happened—not a later editor save.
            workflowSnapshot: {
              id: workflow.id,
              version: workflow.version,
              nodes: workflow.nodes,
              edges: workflow.edges,
            },
          }),
          status: 'queued',
          deduplicationKey,
          attempts: 0,
          maxAttempts: clampAttempts(input.maxAttempts),
          scheduledFor: new Date(),
          nextRunAt: new Date(),
        },
        select: { id: true },
      });
      await this.log({
        workspaceId: input.workspaceId,
        executionId: execution.id,
        event: 'execution_queued',
        message: `Workflow queued for ${input.triggerType || workflow.triggerType || 'manual'} trigger`,
      });
      this.queue.enqueue(execution.id);
      return { id: execution.id, duplicate: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await prisma.workflowExecution.findFirst({
        where: { workflowId: input.workflowId, deduplicationKey },
        select: { id: true },
      });
      if (!existing) throw error;
      return { id: existing.id, duplicate: true };
    }
  }

  /** Requeues a failed/cancelled execution from its last durable node state. */
  async retry(workspaceId: string, executionId: string): Promise<void> {
    const execution = await prisma.workflowExecution.findFirst({
      where: { id: executionId, workspaceId },
      select: { id: true, status: true },
    });
    if (!execution) throw new Error('Workflow execution not found');
    if (!['failed', 'cancelled'].includes(execution.status)) {
      throw new Error('Only failed or cancelled executions can be retried');
    }
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        status: 'queued',
        attempts: 0,
        error: null,
        completedAt: null,
        nextRunAt: new Date(),
      },
    });
    await this.log({
      workspaceId,
      executionId,
      level: 'info',
      event: 'execution_requeued',
      message: 'Execution manually requeued',
    });
    this.queue.enqueue(executionId);
  }

  /** Called only by DurableWorkflowQueue. */
  async runExecution(executionId: string): Promise<void> {
    const candidate = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
    if (!candidate) return;
    const now = new Date();
    const claimed = await prisma.workflowExecution.updateMany({
      where: {
        id: executionId,
        status: { in: ['queued', 'waiting'] },
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      data: {
        status: 'running',
        startedAt: candidate.startedAt || now,
        nextRunAt: null,
      },
    });
    if (claimed.count === 0) return;

    const execution = await prisma.workflowExecution.findUnique({ where: { id: executionId } });
    if (!execution) return;
    const workflow = await prisma.workflow.findFirst({
      where: { id: execution.workflowId, workspaceId: execution.workspaceId, deletedAt: null },
      include: { nodes: { orderBy: { createdAt: 'asc' } }, edges: { orderBy: { createdAt: 'asc' } } },
    });
    if (!workflow) {
      await this.cancel(execution, 'Workflow was deleted before execution');
      return;
    }

    const heartbeat = setInterval(() => {
      void prisma.workflowExecution.updateMany({
        where: { id: execution.id, status: 'running' },
        // `nextRunAt` is ignored for running jobs; writing it gives the
        // @updatedAt column a durable heartbeat while a provider call runs.
        data: { nextRunAt: new Date() },
      }).catch((error) => console.error('Unable to heartbeat workflow execution', error));
    }, 30_000);
    heartbeat.unref();

    try {
      await this.log({
        workspaceId: execution.workspaceId,
        executionId: execution.id,
        event: 'execution_started',
        message: 'Workflow execution started',
        attempt: execution.attempts,
      });

      const state = readWorkflowState(execution.context);
      const graph = readWorkflowSnapshot(execution.context) || workflow;
      if (state.pendingNodeIds.length === 0 && state.completedNodeIds.length === 0) {
        state.pendingNodeIds = initialNodeIds(graph.nodes, graph.edges, execution.triggerType || workflow.triggerType);
      }
      if (state.pendingNodeIds.length === 0) {
        throw new Error('Workflow has no trigger or starting node');
      }

      const maxSteps = Math.max(graph.nodes.length * 5, 100);
      while (state.pendingNodeIds.length > 0) {
        if (state.steps >= maxSteps) throw new Error('Workflow graph exceeded the maximum execution steps');
        const nodeId = state.pendingNodeIds.shift();
        if (!nodeId || state.completedNodeIds.includes(nodeId)) continue;
        const node = graph.nodes.find((candidateNode: any) => candidateNode.id === nodeId);
        if (!node) throw new Error(`Workflow node ${nodeId} no longer exists`);
        // A graph save can delete a node after this execution captured its
        // snapshot. Keep its audit logs useful without violating the current
        // FK by omitting the optional relation in that rare case.
        const persistedNodeId = workflow.nodes.some((candidateNode: any) => candidateNode.id === node.id) ? node.id : undefined;

        await this.log({
          workspaceId: execution.workspaceId,
          executionId: execution.id,
          workflowNodeId: persistedNodeId,
          event: 'node_started',
          message: `Running ${node.type} node`,
          attempt: execution.attempts,
        });

        const result = await this.processNode(execution, { ...workflow, nodes: graph.nodes, edges: graph.edges }, node, state);
        if (result.deferred) {
          state.pendingNodeIds.unshift(node.id, ...state.pendingNodeIds);
          state.waitingNodeId = node.id;
          await this.saveState(execution.id, execution.context, state, {
            status: 'waiting',
            nextRunAt: result.deferred.nextRunAt,
          });
          await this.log({
            workspaceId: execution.workspaceId,
            executionId: execution.id,
            workflowNodeId: persistedNodeId,
            event: 'node_delayed',
            message: `Workflow paused for ${result.deferred.durationMs}ms`,
            data: { nextRunAt: result.deferred.nextRunAt.toISOString() },
            attempt: execution.attempts,
          });
          return;
        }

        state.completedNodeIds.push(node.id);
        state.steps += 1;
        state.pendingNodeIds.push(...result.nextNodeIds.filter((id) => !state.completedNodeIds.includes(id)));
        if (result.result) state.actionResults[node.id] = result.result;
        await this.saveState(execution.id, execution.context, state);
        await this.log({
          workspaceId: execution.workspaceId,
          executionId: execution.id,
          workflowNodeId: persistedNodeId,
          event: 'node_completed',
          message: `${node.type} node completed`,
          data: result.result,
          attempt: execution.attempts,
        });
      }

      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: { status: 'completed', completedAt: new Date(), nextRunAt: null, error: null },
      });
      await this.log({
        workspaceId: execution.workspaceId,
        executionId: execution.id,
        event: 'execution_completed',
        message: 'Workflow execution completed',
        attempt: execution.attempts,
      });
    } catch (error) {
      await this.failOrRetry(execution, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async processNode(execution: any, workflow: any, node: any, state: WorkflowState): Promise<ProcessResult> {
    const config = asRecord(node.config);
    const nodeType = normalise(node.type);

    if (nodeType === 'trigger') {
      return { nextNodeIds: selectEdges(workflow.edges, node.id) };
    }

    if (nodeType === 'delay' || (nodeType === 'action' && normalise(config.action || config.actionType || config.type) === 'wait')) {
      if (state.waitingNodeId === node.id) {
        delete state.waitingNodeId;
        return { nextNodeIds: selectEdges(workflow.edges, node.id) };
      }
      const durationMs = delayDurationMs(config);
      return { nextNodeIds: [], deferred: { durationMs, nextRunAt: new Date(Date.now() + durationMs) } };
    }

    if (nodeType === 'condition') {
      const passed = await this.evaluateCondition(execution, config);
      state.decisions[node.id] = passed;
      return {
        nextNodeIds: selectEdges(workflow.edges, node.id, passed),
        result: { passed },
      };
    }

    if (nodeType === 'branch') {
      const outcome = branchOutcome(config, state);
      return {
        nextNodeIds: selectEdges(workflow.edges, node.id, outcome),
        result: { outcome },
      };
    }

    if (nodeType !== 'action') throw new Error(`Unsupported workflow node type: ${node.type}`);
    const result = await this.executeAction(execution, workflow, node, config);
    return { nextNodeIds: selectEdges(workflow.edges, node.id), result };
  }

  private async evaluateCondition(execution: any, config: JsonRecord): Promise<boolean> {
    const condition = normalise(config.condition || config.conditionType || config.type);
    const contact = await this.executionContact(execution);
    const payload = asRecord(execution.payload);

    switch (condition) {
      case 'contact_has_tag': {
        if (!contact) return false;
        const tagId = stringValue(config.tagId);
        const tagName = stringValue(config.tagName || config.value);
        const tag = await prisma.contactTag.findFirst({
          where: {
            contactId: contact.id,
            tag: {
              workspaceId: execution.workspaceId,
              ...(tagId ? { id: tagId } : {}),
              ...(tagName ? { name: { equals: tagName, mode: 'insensitive' } } : {}),
            },
          },
        });
        return Boolean(tag);
      }
      case 'contact_field_equals': {
        if (!contact) return false;
        const field = stringValue(config.field || config.fieldName);
        const expected = config.value;
        if (!field) throw new Error('contact_field_equals requires a field');
        if (field === 'customField' || field === 'custom_field') {
          const customFieldId = stringValue(config.customFieldId);
          if (!customFieldId) throw new Error('Custom field condition requires customFieldId');
          const value = await prisma.customFieldValue.findFirst({
            where: { contactId: contact.id, customFieldId, customField: { workspaceId: execution.workspaceId } },
            select: { value: true },
          });
          return valuesEqual(value?.value, expected);
        }
        const permitted = new Set(['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'address', 'source', 'notes', 'assignedUserId', 'companyId']);
        if (!permitted.has(field)) throw new Error('Unsupported contact field condition');
        return valuesEqual(contact[field as keyof typeof contact], expected);
      }
      case 'opportunity_stage': {
        const opportunityId = stringValue(config.opportunityId || payload.opportunityId);
        if (!opportunityId) return false;
        const opportunity = await prisma.opportunity.findFirst({
          where: { id: opportunityId, workspaceId: execution.workspaceId, deletedAt: null },
          include: { stage: true },
        });
        if (!opportunity) return false;
        const expectedStageId = stringValue(config.stageId);
        const expectedStage = config.stageName ?? config.value;
        return expectedStageId
          ? opportunity.stageId === expectedStageId
          : valuesEqual(opportunity.stage?.name, expectedStage);
      }
      case 'email_status':
        return valuesEqual(readPayloadValue(payload, stringValue(config.field) || 'emailStatus'), config.value ?? config.status);
      case 'appointment_status':
        return valuesEqual(readPayloadValue(payload, stringValue(config.field) || 'appointmentStatus'), config.value ?? config.status);
      default:
        throw new Error(`Unsupported workflow condition: ${condition || 'missing condition'}`);
    }
  }

  private async executeAction(execution: any, workflow: any, node: any, config: JsonRecord): Promise<JsonRecord> {
    const action = normalise(config.action || config.actionType || config.type);
    const contact = await this.executionContact(execution, stringValue(config.contactId));

    switch (action) {
      case 'add_tag': {
        if (!contact) throw new Error('Add tag action requires a contact');
        const tag = await workflowTag(execution.workspaceId, config);
        if (!tag) throw new Error('Tag does not belong to this workspace');
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
          create: { contactId: contact.id, tagId: tag.id },
          update: {},
        });
        await this.activity(execution.workspaceId, contact.id, 'contact_updated', `Tag added: ${tag.name}`);
        return { action, tagId: tag.id, contactId: contact.id };
      }
      case 'remove_tag': {
        if (!contact) throw new Error('Remove tag action requires a contact');
        const tag = await workflowTag(execution.workspaceId, config);
        const deleted = await prisma.contactTag.deleteMany({ where: { contactId: contact.id, tagId: tag.id } });
        await this.activity(execution.workspaceId, contact.id, 'contact_updated', 'Tag removed');
        return { action, tagId: tag.id, contactId: contact.id, removed: deleted.count > 0 };
      }
      case 'create_task': {
        const targetContactId = contact?.id || null;
        const title = requiredString(config.title || config.value, 'Create task action requires a title');
        const dueDate = dateValue(config.dueDate);
        const task = await prisma.task.create({
          data: {
            workspaceId: execution.workspaceId,
            contactId: targetContactId,
            title,
            description: stringValue(config.description) || null,
            dueDate,
          },
        });
        if (targetContactId) await this.activity(execution.workspaceId, targetContactId, 'task', `Task created: ${title}`);
        return { action, taskId: task.id, contactId: targetContactId };
      }
      case 'update_contact': {
        if (!contact) throw new Error('Update contact action requires a contact');
        const fields = asRecord(config.fields || config.data);
        if (Object.keys(fields).length === 0 && stringValue(config.field)) fields[stringValue(config.field)!] = config.value;
        const allowed = ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'address', 'source', 'notes', 'assignedUserId', 'companyId'];
        const data: JsonRecord = {};
        for (const key of allowed) if (fields[key] !== undefined) data[key] = fields[key];
        if (Object.keys(data).length === 0) throw new Error('Update contact action has no permitted fields');
        await this.validateContactUpdate(execution.workspaceId, data);
        await prisma.contact.update({ where: { id: contact.id }, data: data as any });
        await this.activity(execution.workspaceId, contact.id, 'contact_updated', 'Contact updated by workflow', data);
        return { action, contactId: contact.id, fields: data };
      }
      case 'move_opportunity': {
        const payload = asRecord(execution.payload);
        const opportunityId = requiredString(config.opportunityId || payload.opportunityId, 'Move opportunity action requires opportunityId');
        const stageId = stringValue(config.stageId);
        const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, workspaceId: execution.workspaceId, deletedAt: null } });
        if (!opportunity) throw new Error('Opportunity does not belong to this workspace');
        const stageName = stringValue(config.stageName || config.value);
        const stage = await prisma.pipelineStage.findFirst({
          where: {
            pipelineId: opportunity.pipelineId,
            ...(stageId ? { id: stageId } : {}),
            ...(!stageId && stageName ? { name: { equals: stageName, mode: 'insensitive' } } : {}),
          },
        });
        if (!stage) throw new Error('Pipeline stage does not belong to the opportunity pipeline');
        await prisma.opportunity.update({ where: { id: opportunity.id }, data: { stageId: stage.id } });
        await this.activity(execution.workspaceId, opportunity.contactId, 'pipeline_change', `Opportunity moved to ${stage.name}`);
        return { action, opportunityId, stageId: stage.id };
      }
      case 'assign_user': {
        const userId = requiredString(config.userId || config.assignedUserId || config.value, 'Assign user action requires userId');
        const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId: execution.workspaceId } } });
        if (!member) throw new Error('Assigned user is not a workspace member');
        const target = normalise(config.target || 'contact');
        if (target === 'opportunity') {
          const payload = asRecord(execution.payload);
          const opportunityId = requiredString(config.opportunityId || payload.opportunityId, 'Assign opportunity action requires opportunityId');
          const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, workspaceId: execution.workspaceId, deletedAt: null } });
          if (!opportunity) throw new Error('Opportunity does not belong to this workspace');
          await prisma.opportunity.update({ where: { id: opportunity.id }, data: { assignedUserId: userId } });
          return { action, target, opportunityId, userId };
        }
        if (!contact) throw new Error('Assign user action requires a contact');
        await prisma.contact.update({ where: { id: contact.id }, data: { assignedUserId: userId } });
        await this.activity(execution.workspaceId, contact.id, 'contact_updated', 'Contact assigned by workflow', { userId });
        return { action, target: 'contact', contactId: contact.id, userId };
      }
      case 'send_email':
      case 'send_sms':
      case 'webhook': {
        const providerType = action === 'send_email' ? 'email' : action === 'send_sms' ? 'sms' : 'webhook';
        const result = await workflowProviders.get(providerType).execute({
          workspaceId: execution.workspaceId,
          workflowId: workflow.id,
          executionId: execution.id,
          nodeId: node.id,
          idempotencyKey: `${execution.id}:${node.id}`,
          contact,
          config,
          payload: asRecord(execution.payload),
        });
        await this.recordDeliveryActivity(execution, contact, action, config, result);
        return { action, ...providerResult(result) };
      }
      case 'wait':
        // A `wait` action is handled in processNode so it can persist the
        // current graph position before returning control to the queue.
        throw new Error('Wait action was not processed as a delay node');
      default:
        throw new Error(`Unsupported workflow action: ${action || 'missing action'}`);
    }
  }

  private async executionContact(execution: any, explicitContactId?: string): Promise<any | null> {
    const contactId = explicitContactId || execution.contactId || stringValue(asRecord(execution.payload).contactId);
    if (!contactId) return null;
    return prisma.contact.findFirst({
      where: { id: contactId, workspaceId: execution.workspaceId, deletedAt: null },
    });
  }

  private async validateContactUpdate(workspaceId: string, data: JsonRecord): Promise<void> {
    const companyId = stringValue(data.companyId);
    if (companyId && !await prisma.company.findFirst({ where: { id: companyId, workspaceId, deletedAt: null }, select: { id: true } })) {
      throw new Error('Company does not belong to this workspace');
    }
    const userId = stringValue(data.assignedUserId);
    if (userId && !await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } })) {
      throw new Error('Assigned user is not a workspace member');
    }
  }

  private async recordDeliveryActivity(execution: any, contact: any | null, action: string, config: JsonRecord, result: WorkflowProviderResult): Promise<void> {
    if (!contact) return;
    const type = action === 'send_email' ? 'email' : action === 'send_sms' ? 'sms' : 'note';
    const description = stringValue(config.body || config.message || config.value) || undefined;
    await this.activity(execution.workspaceId, contact.id, type, `${type.toUpperCase()} workflow action ${result.status}`, {
      providerMessageId: result.providerMessageId,
      ...result.metadata,
    }, description);
  }

  private async activity(workspaceId: string, contactId: string, type: string, title: string, metadata?: JsonRecord, description?: string): Promise<void> {
    await prisma.contactActivity.create({
      data: {
        workspaceId,
        contactId,
        type,
        title,
        description,
        metadata: metadata ? toInputJson(metadata) : undefined,
      },
    });
  }

  private async saveState(executionId: string, currentContext: unknown, state: WorkflowState, extra: Record<string, unknown> = {}): Promise<void> {
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        context: toInputJson({ ...asRecord(currentContext), workflowState: state }),
        ...extra,
      } as any,
    });
  }

  private async failOrRetry(execution: any, failure: unknown): Promise<void> {
    const message = errorMessage(failure);
    const attempts = execution.attempts + 1;
    const exhausted = attempts >= execution.maxAttempts;
    const nextRunAt = exhausted ? null : new Date(Date.now() + retryDelayMs(attempts));
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: {
        attempts,
        status: exhausted ? 'failed' : 'queued',
        error: message,
        completedAt: exhausted ? new Date() : null,
        nextRunAt,
      },
    });
    await this.log({
      workspaceId: execution.workspaceId,
      executionId: execution.id,
      level: 'error',
      event: exhausted ? 'execution_failed' : 'execution_retry_scheduled',
      message,
      data: exhausted ? undefined : { nextRunAt: nextRunAt?.toISOString() },
      attempt: attempts,
    });
    if (!exhausted) this.queue.enqueue(execution.id);
  }

  private async cancel(execution: any, reason: string): Promise<void> {
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { status: 'cancelled', error: reason, completedAt: new Date() },
    });
    await this.log({ workspaceId: execution.workspaceId, executionId: execution.id, level: 'warn', event: 'execution_cancelled', message: reason });
  }

  private async log(input: {
    workspaceId: string;
    executionId: string;
    workflowNodeId?: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
    event: string;
    message?: string;
    data?: JsonRecord;
    attempt?: number;
  }): Promise<void> {
    await prisma.workflowExecutionLog.create({
      data: {
        workspaceId: input.workspaceId,
        executionId: input.executionId,
        workflowNodeId: input.workflowNodeId,
        level: input.level || 'info',
        event: input.event,
        message: input.message,
        data: input.data ? toInputJson(input.data) : undefined,
        attempt: input.attempt || 0,
      },
    });
  }

  private createDeduplicationKey(input: TriggerWorkflowInput, payload: JsonRecord): string {
    const externalEventId = stringValue(payload.eventId || payload.id || payload.messageId || payload.submissionId);
    if (externalEventId) return `${input.triggerType || 'manual'}:${externalEventId}`;
    // Manual API triggers and domain events without a stable external id are
    // intentionally distinct. Callers that need at-most-once delivery pass a
    // provider event id through deduplicationKey.
    return `${input.triggerType || 'manual'}:${randomUUID()}`;
  }
}

/** Shared application singleton. Route registration starts its durable poller. */
export const workflowEngine = new WorkflowEngine();

async function workflowTag(workspaceId: string, config: JsonRecord): Promise<{ id: string; name: string }> {
  const tagId = stringValue(config.tagId);
  const tagName = stringValue(config.tagName || config.value);
  if (!tagId && !tagName) throw new Error('Tag action requires tagId or tag name');
  const tag = await prisma.tag.findFirst({
    where: {
      workspaceId,
      ...(tagId ? { id: tagId } : {}),
      ...(!tagId && tagName ? { name: { equals: tagName, mode: 'insensitive' } } : {}),
    },
    select: { id: true, name: true },
  });
  if (!tag) throw new Error('Tag does not belong to this workspace');
  return tag;
}

function initialNodeIds(nodes: any[], edges: any[], triggerType?: string | null): string[] {
  const triggers = nodes.filter((node) => {
    if (normalise(node.type) !== 'trigger') return false;
    const config = asRecord(node.config);
    const configuredType = stringValue(config.triggerType || config.trigger || config.eventType || config.type);
    return !triggerType || !configuredType || configuredType === triggerType;
  });
  if (triggers.length > 0) return triggers.map((node) => node.id);
  const targets = new Set(edges.map((edge) => edge.targetNodeId));
  return nodes.filter((node) => !targets.has(node.id)).map((node) => node.id);
}

function selectEdges(edges: any[], sourceNodeId: string, outcome?: boolean | string): string[] {
  const outgoing = edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  if (outgoing.length === 0) return [];
  if (outcome !== undefined) {
    const expected = String(outcome).toLowerCase();
    const alternatives = expected === 'true' ? ['true', 'yes', 'success'] : expected === 'false' ? ['false', 'no', 'failure'] : [expected];
    const matched = outgoing.filter((edge) => alternatives.includes(normalise(edge.sourceHandle)));
    if (matched.length > 0) return matched.map((edge) => edge.targetNodeId);
  }
  const defaults = outgoing.filter((edge) => ['default', '', 'next'].includes(normalise(edge.sourceHandle)));
  // The API supports explicit true/false handles. For simpler editors that
  // create two unlabeled outgoing edges, preserve creation order as a useful
  // convention: first is true, second is false.
  if (typeof outcome === 'boolean' && defaults.length > 1) {
    return [defaults[outcome ? 0 : 1].targetNodeId];
  }
  return (defaults.length > 0 ? defaults : outcome === undefined ? outgoing : []).map((edge) => edge.targetNodeId);
}

function branchOutcome(config: JsonRecord, state: WorkflowState): boolean | string {
  const conditionNodeId = stringValue(config.conditionNodeId || config.fromConditionId);
  if (conditionNodeId && state.decisions[conditionNodeId] !== undefined) return state.decisions[conditionNodeId];
  const decisions = Object.values(state.decisions);
  if (decisions.length > 0) return decisions[decisions.length - 1] as boolean | string;
  return String(config.value ?? config.branch ?? 'default');
}

function readWorkflowState(context: unknown): WorkflowState {
  const raw = asRecord(context);
  const state = asRecord(raw.workflowState);
  return {
    pendingNodeIds: stringArray(state.pendingNodeIds),
    completedNodeIds: stringArray(state.completedNodeIds),
    decisions: asRecord(state.decisions) as Record<string, boolean | string>,
    actionResults: asRecord(state.actionResults) as Record<string, JsonRecord>,
    waitingNodeId: stringValue(state.waitingNodeId),
    steps: Math.max(0, Number(state.steps) || 0),
  };
}

function readWorkflowSnapshot(context: unknown): { id: string; nodes: any[]; edges: any[] } | null {
  const snapshot = asRecord(asRecord(context).workflowSnapshot);
  const id = stringValue(snapshot.id);
  if (!id || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return null;
  const nodes = snapshot.nodes.filter((node): node is JsonRecord => Boolean(stringValue(asRecord(node).id)));
  const edges = snapshot.edges.filter((edge): edge is JsonRecord => Boolean(stringValue(asRecord(edge).sourceNodeId)) && Boolean(stringValue(asRecord(edge).targetNodeId)));
  return { id, nodes, edges };
}

function delayDurationMs(config: JsonRecord): number {
  const direct = Number(config.delayMs ?? config.durationMs);
  if (Number.isFinite(direct) && direct >= 0) return Math.min(direct, 1000 * 60 * 60 * 24 * 365);
  const amount = Math.max(0, Number(config.amount ?? config.delayAmount ?? config.duration ?? config.delay ?? 0));
  const unit = normalise(config.unit ?? config.delayUnit ?? 'minutes');
  const factor = unit.startsWith('second') ? 1_000 : unit.startsWith('hour') ? 3_600_000 : unit.startsWith('day') ? 86_400_000 : 60_000;
  return Math.min(amount * factor, 1000 * 60 * 60 * 24 * 365);
}

function retryDelayMs(attempt: number): number {
  const base = Math.max(1_000, Number(process.env.WORKFLOW_RETRY_BASE_MS) || 5_000);
  return Math.min(base * (2 ** Math.max(0, attempt - 1)), 15 * 60_000);
}

function clampAttempts(value: number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(10, Math.max(1, Math.floor(parsed))) : 3;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalise(value: unknown): string {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') || '';
}

function requiredString(value: unknown, message: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(message);
  return result;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined) return right === null || right === undefined || right === '';
  if (typeof left === 'boolean' || typeof right === 'boolean') return String(left).toLowerCase() === String(right).toLowerCase();
  return String(left).trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}

function readPayloadValue(payload: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => asRecord(current)[key], payload);
}

function dateValue(value: unknown): Date | null {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid task due date');
  return date;
}

function providerResult(result: WorkflowProviderResult): JsonRecord {
  return {
    status: result.status,
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    ...(result.metadata ? { metadata: result.metadata } : {}),
  };
}

function toInputJson(value: JsonRecord): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workflow execution failed';
}
