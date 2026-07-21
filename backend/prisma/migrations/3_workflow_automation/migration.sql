-- Phase 4: visual marketing automation workflows
-- Graph configuration and provider payloads are JSONB so integrations can grow
-- without requiring a migration for every new trigger or action type.

CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "triggerType" TEXT,
  "triggerConfig" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowNode" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT,
  "config" JSONB,
  "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowEdge" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "sourceNodeId" TEXT NOT NULL,
  "targetNodeId" TEXT NOT NULL,
  "sourceHandle" TEXT NOT NULL DEFAULT 'default',
  "targetHandle" TEXT NOT NULL DEFAULT 'default',
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowEdge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowExecution" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "contactId" TEXT,
  "triggeredByUserId" TEXT,
  "triggerType" TEXT,
  "payload" JSONB,
  "context" JSONB,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "deduplicationKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "scheduledFor" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowExecutionLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "workflowNodeId" TEXT,
  "level" TEXT NOT NULL DEFAULT 'info',
  "event" TEXT NOT NULL,
  "message" TEXT,
  "data" JSONB,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowExecutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workflow_workspaceId_idx" ON "Workflow"("workspaceId");
CREATE INDEX "Workflow_workspaceId_isActive_idx" ON "Workflow"("workspaceId", "isActive");
CREATE INDEX "Workflow_workspaceId_triggerType_idx" ON "Workflow"("workspaceId", "triggerType");
CREATE INDEX "Workflow_createdByUserId_idx" ON "Workflow"("createdByUserId");
CREATE INDEX "Workflow_createdAt_idx" ON "Workflow"("createdAt");

CREATE INDEX "WorkflowNode_workflowId_idx" ON "WorkflowNode"("workflowId");
CREATE INDEX "WorkflowNode_workflowId_type_idx" ON "WorkflowNode"("workflowId", "type");

CREATE UNIQUE INDEX "WorkflowEdge_workflowId_sourceNodeId_targetNodeId_sourceHandle_targetHandle_key"
  ON "WorkflowEdge"("workflowId", "sourceNodeId", "targetNodeId", "sourceHandle", "targetHandle");
CREATE INDEX "WorkflowEdge_workflowId_idx" ON "WorkflowEdge"("workflowId");
CREATE INDEX "WorkflowEdge_sourceNodeId_idx" ON "WorkflowEdge"("sourceNodeId");
CREATE INDEX "WorkflowEdge_targetNodeId_idx" ON "WorkflowEdge"("targetNodeId");

CREATE UNIQUE INDEX "WorkflowExecution_workflowId_deduplicationKey_key"
  ON "WorkflowExecution"("workflowId", "deduplicationKey");
CREATE INDEX "WorkflowExecution_workspaceId_idx" ON "WorkflowExecution"("workspaceId");
CREATE INDEX "WorkflowExecution_workflowId_idx" ON "WorkflowExecution"("workflowId");
CREATE INDEX "WorkflowExecution_contactId_idx" ON "WorkflowExecution"("contactId");
CREATE INDEX "WorkflowExecution_triggeredByUserId_idx" ON "WorkflowExecution"("triggeredByUserId");
CREATE INDEX "WorkflowExecution_workspaceId_status_idx" ON "WorkflowExecution"("workspaceId", "status");
CREATE INDEX "WorkflowExecution_workflowId_status_idx" ON "WorkflowExecution"("workflowId", "status");
CREATE INDEX "WorkflowExecution_status_nextRunAt_idx" ON "WorkflowExecution"("status", "nextRunAt");
CREATE INDEX "WorkflowExecution_createdAt_idx" ON "WorkflowExecution"("createdAt");

CREATE INDEX "WorkflowExecutionLog_workspaceId_idx" ON "WorkflowExecutionLog"("workspaceId");
CREATE INDEX "WorkflowExecutionLog_executionId_idx" ON "WorkflowExecutionLog"("executionId");
CREATE INDEX "WorkflowExecutionLog_workflowNodeId_idx" ON "WorkflowExecutionLog"("workflowNodeId");
CREATE INDEX "WorkflowExecutionLog_workspaceId_createdAt_idx" ON "WorkflowExecutionLog"("workspaceId", "createdAt");
CREATE INDEX "WorkflowExecutionLog_executionId_createdAt_idx" ON "WorkflowExecutionLog"("executionId", "createdAt");

ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workflow"
  ADD CONSTRAINT "Workflow_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowNode"
  ADD CONSTRAINT "WorkflowNode_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowEdge"
  ADD CONSTRAINT "WorkflowEdge_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowEdge"
  ADD CONSTRAINT "WorkflowEdge_sourceNodeId_fkey"
  FOREIGN KEY ("sourceNodeId") REFERENCES "WorkflowNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowEdge"
  ADD CONSTRAINT "WorkflowEdge_targetNodeId_fkey"
  FOREIGN KEY ("targetNodeId") REFERENCES "WorkflowNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowExecution"
  ADD CONSTRAINT "WorkflowExecution_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution"
  ADD CONSTRAINT "WorkflowExecution_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution"
  ADD CONSTRAINT "WorkflowExecution_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution"
  ADD CONSTRAINT "WorkflowExecution_triggeredByUserId_fkey"
  FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowExecutionLog"
  ADD CONSTRAINT "WorkflowExecutionLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecutionLog"
  ADD CONSTRAINT "WorkflowExecutionLog_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecutionLog"
  ADD CONSTRAINT "WorkflowExecutionLog_workflowNodeId_fkey"
  FOREIGN KEY ("workflowNodeId") REFERENCES "WorkflowNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
