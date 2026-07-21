import {
  WorkflowEvent,
  WorkflowTriggerType,
  workflowEngine,
} from './workflow.engine.js';

/**
 * Application-facing event gateway. CRM, inbox, form, and appointment code
 * can import this module and dispatch only after their own transaction has
 * committed. It is intentionally provider-agnostic and carries a stable
 * `deduplicationKey` when the source has one.
 */
export async function dispatchWorkflowEvent(event: WorkflowEvent) {
  return workflowEngine.dispatch(event);
}

export function workflowEvent(
  workspaceId: string,
  type: WorkflowTriggerType,
  options: Omit<WorkflowEvent, 'workspaceId' | 'type'> = {},
): WorkflowEvent {
  return { workspaceId, type, ...options };
}
