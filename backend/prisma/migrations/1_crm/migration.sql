-- Phase 2: workspace-scoped CRM
CREATE TABLE "Company" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "website" TEXT, "phone" TEXT, "address" TEXT, "industry" TEXT, "employeeCount" TEXT, "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "companyId" TEXT, "jobTitle" TEXT, "address" TEXT, "source" TEXT, "notes" TEXT, "assignedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Tag" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#3B82F6', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContactTag" (
  "id" TEXT NOT NULL, "contactId" TEXT NOT NULL, "tagId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomField" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "fieldType" TEXT NOT NULL, "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "isRequired" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CustomFieldValue" (
  "id" TEXT NOT NULL, "contactId" TEXT NOT NULL, "customFieldId" TEXT NOT NULL, "value" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Pipeline" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "isDefault" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PipelineStage" (
  "id" TEXT NOT NULL, "pipelineId" TEXT NOT NULL, "name" TEXT NOT NULL, "order" INTEGER NOT NULL, "color" TEXT NOT NULL DEFAULT '#3B82F6', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "contactId" TEXT NOT NULL, "pipelineId" TEXT NOT NULL, "stageId" TEXT NOT NULL, "assignedUserId" TEXT, "title" TEXT NOT NULL, "dealValue" DOUBLE PRECISION, "probability" INTEGER NOT NULL DEFAULT 0, "expectedCloseDate" TIMESTAMP(3), "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "closedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContactActivity" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "contactId" TEXT NOT NULL, "type" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Task" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "contactId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "dueDate" TIMESTAMP(3), "completed" BOOLEAN NOT NULL DEFAULT false, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_workspaceId_idx" ON "Company"("workspaceId");
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");
CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");
CREATE INDEX "Contact_assignedUserId_idx" ON "Contact"("assignedUserId");
CREATE INDEX "Contact_createdAt_idx" ON "Contact"("createdAt");
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");
CREATE UNIQUE INDEX "ContactTag_contactId_tagId_key" ON "ContactTag"("contactId", "tagId");
CREATE INDEX "ContactTag_contactId_idx" ON "ContactTag"("contactId");
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");
CREATE UNIQUE INDEX "CustomField_workspaceId_name_key" ON "CustomField"("workspaceId", "name");
CREATE INDEX "CustomField_workspaceId_idx" ON "CustomField"("workspaceId");
CREATE UNIQUE INDEX "CustomFieldValue_contactId_customFieldId_key" ON "CustomFieldValue"("contactId", "customFieldId");
CREATE INDEX "CustomFieldValue_contactId_idx" ON "CustomFieldValue"("contactId");
CREATE INDEX "CustomFieldValue_customFieldId_idx" ON "CustomFieldValue"("customFieldId");
CREATE INDEX "Pipeline_workspaceId_idx" ON "Pipeline"("workspaceId");
CREATE INDEX "Pipeline_createdAt_idx" ON "Pipeline"("createdAt");
CREATE UNIQUE INDEX "PipelineStage_pipelineId_name_key" ON "PipelineStage"("pipelineId", "name");
CREATE INDEX "PipelineStage_pipelineId_idx" ON "PipelineStage"("pipelineId");
CREATE INDEX "Opportunity_workspaceId_idx" ON "Opportunity"("workspaceId");
CREATE INDEX "Opportunity_contactId_idx" ON "Opportunity"("contactId");
CREATE INDEX "Opportunity_pipelineId_idx" ON "Opportunity"("pipelineId");
CREATE INDEX "Opportunity_stageId_idx" ON "Opportunity"("stageId");
CREATE INDEX "Opportunity_assignedUserId_idx" ON "Opportunity"("assignedUserId");
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");
CREATE INDEX "ContactActivity_workspaceId_idx" ON "ContactActivity"("workspaceId");
CREATE INDEX "ContactActivity_contactId_idx" ON "ContactActivity"("contactId");
CREATE INDEX "ContactActivity_createdAt_idx" ON "ContactActivity"("createdAt");
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Task_completed_idx" ON "Task"("completed");

ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
