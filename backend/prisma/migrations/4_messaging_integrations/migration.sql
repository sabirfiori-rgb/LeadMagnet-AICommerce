-- Phase 5: provider-neutral email and SMS integrations.
-- API keys are intentionally not persisted here; providers are configured via
-- server-side environment variables. All communication records are directly
-- scoped to a workspace for tenant-safe queries and webhook handling.

CREATE TABLE "EmailTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "subject" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "textBody" TEXT,
  "variables" JSONB,
  "category" TEXT NOT NULL DEFAULT 'marketing',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "body" TEXT NOT NULL,
  "variables" JSONB,
  "category" TEXT NOT NULL DEFAULT 'marketing',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "templateId" TEXT,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "senderName" TEXT,
  "fromEmail" TEXT,
  "replyTo" TEXT,
  "subject" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "textBody" TEXT,
  "audienceFilter" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledFor" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundMessage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT,
  "conversationId" TEXT,
  "workflowExecutionId" TEXT,
  "emailTemplateId" TEXT,
  "smsTemplateId" TEXT,
  "emailCampaignId" TEXT,
  "createdByUserId" TEXT,
  "channel" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "sender" TEXT,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "htmlBody" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "providerMessageId" TEXT,
  "idempotencyKey" TEXT,
  "trackingToken" TEXT,
  "unsubscribeToken" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundMessageLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'info',
  "event" TEXT NOT NULL,
  "status" TEXT,
  "message" TEXT,
  "providerResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboundMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageTrackingLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "destinationUrl" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "firstClickedAt" TIMESTAMP(3),
  "lastClickedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageTrackingLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageTrackingEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "trackingLinkId" TEXT,
  "eventType" TEXT NOT NULL,
  "visitorHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationOptOut" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT,
  "channel" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "normalizedAddress" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "unsubscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resubscribedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunicationOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailTemplate_workspaceId_name_key" ON "EmailTemplate"("workspaceId", "name");
CREATE INDEX "EmailTemplate_workspaceId_idx" ON "EmailTemplate"("workspaceId");
CREATE INDEX "EmailTemplate_workspaceId_isActive_idx" ON "EmailTemplate"("workspaceId", "isActive");
CREATE INDEX "EmailTemplate_createdByUserId_idx" ON "EmailTemplate"("createdByUserId");
CREATE INDEX "EmailTemplate_createdAt_idx" ON "EmailTemplate"("createdAt");

CREATE UNIQUE INDEX "SmsTemplate_workspaceId_name_key" ON "SmsTemplate"("workspaceId", "name");
CREATE INDEX "SmsTemplate_workspaceId_idx" ON "SmsTemplate"("workspaceId");
CREATE INDEX "SmsTemplate_workspaceId_isActive_idx" ON "SmsTemplate"("workspaceId", "isActive");
CREATE INDEX "SmsTemplate_createdByUserId_idx" ON "SmsTemplate"("createdByUserId");
CREATE INDEX "SmsTemplate_createdAt_idx" ON "SmsTemplate"("createdAt");

CREATE INDEX "EmailCampaign_workspaceId_idx" ON "EmailCampaign"("workspaceId");
CREATE INDEX "EmailCampaign_workspaceId_status_idx" ON "EmailCampaign"("workspaceId", "status");
CREATE INDEX "EmailCampaign_workspaceId_scheduledFor_idx" ON "EmailCampaign"("workspaceId", "scheduledFor");
CREATE INDEX "EmailCampaign_templateId_idx" ON "EmailCampaign"("templateId");
CREATE INDEX "EmailCampaign_createdByUserId_idx" ON "EmailCampaign"("createdByUserId");
CREATE INDEX "EmailCampaign_createdAt_idx" ON "EmailCampaign"("createdAt");

CREATE UNIQUE INDEX "OutboundMessage_trackingToken_key" ON "OutboundMessage"("trackingToken");
CREATE UNIQUE INDEX "OutboundMessage_unsubscribeToken_key" ON "OutboundMessage"("unsubscribeToken");
CREATE UNIQUE INDEX "OutboundMessage_workspaceId_idempotencyKey_key" ON "OutboundMessage"("workspaceId", "idempotencyKey");
CREATE INDEX "OutboundMessage_workspaceId_idx" ON "OutboundMessage"("workspaceId");
CREATE INDEX "OutboundMessage_contactId_idx" ON "OutboundMessage"("contactId");
CREATE INDEX "OutboundMessage_conversationId_idx" ON "OutboundMessage"("conversationId");
CREATE INDEX "OutboundMessage_workflowExecutionId_idx" ON "OutboundMessage"("workflowExecutionId");
CREATE INDEX "OutboundMessage_emailTemplateId_idx" ON "OutboundMessage"("emailTemplateId");
CREATE INDEX "OutboundMessage_smsTemplateId_idx" ON "OutboundMessage"("smsTemplateId");
CREATE INDEX "OutboundMessage_emailCampaignId_idx" ON "OutboundMessage"("emailCampaignId");
CREATE INDEX "OutboundMessage_createdByUserId_idx" ON "OutboundMessage"("createdByUserId");
CREATE INDEX "OutboundMessage_providerMessageId_idx" ON "OutboundMessage"("providerMessageId");
CREATE INDEX "OutboundMessage_workspaceId_channel_status_idx" ON "OutboundMessage"("workspaceId", "channel", "status");
CREATE INDEX "OutboundMessage_status_nextAttemptAt_idx" ON "OutboundMessage"("status", "nextAttemptAt");
CREATE INDEX "OutboundMessage_workspaceId_scheduledFor_idx" ON "OutboundMessage"("workspaceId", "scheduledFor");
CREATE INDEX "OutboundMessage_createdAt_idx" ON "OutboundMessage"("createdAt");

CREATE INDEX "OutboundMessageLog_workspaceId_idx" ON "OutboundMessageLog"("workspaceId");
CREATE INDEX "OutboundMessageLog_outboundMessageId_idx" ON "OutboundMessageLog"("outboundMessageId");
CREATE INDEX "OutboundMessageLog_workspaceId_createdAt_idx" ON "OutboundMessageLog"("workspaceId", "createdAt");
CREATE INDEX "OutboundMessageLog_outboundMessageId_createdAt_idx" ON "OutboundMessageLog"("outboundMessageId", "createdAt");

CREATE UNIQUE INDEX "MessageTrackingLink_token_key" ON "MessageTrackingLink"("token");
CREATE INDEX "MessageTrackingLink_workspaceId_idx" ON "MessageTrackingLink"("workspaceId");
CREATE INDEX "MessageTrackingLink_outboundMessageId_idx" ON "MessageTrackingLink"("outboundMessageId");

CREATE INDEX "MessageTrackingEvent_workspaceId_idx" ON "MessageTrackingEvent"("workspaceId");
CREATE INDEX "MessageTrackingEvent_outboundMessageId_idx" ON "MessageTrackingEvent"("outboundMessageId");
CREATE INDEX "MessageTrackingEvent_trackingLinkId_idx" ON "MessageTrackingEvent"("trackingLinkId");
CREATE INDEX "MessageTrackingEvent_outboundMessageId_eventType_idx" ON "MessageTrackingEvent"("outboundMessageId", "eventType");
CREATE INDEX "MessageTrackingEvent_workspaceId_createdAt_idx" ON "MessageTrackingEvent"("workspaceId", "createdAt");

CREATE UNIQUE INDEX "CommunicationOptOut_workspaceId_channel_normalizedAddress_key"
  ON "CommunicationOptOut"("workspaceId", "channel", "normalizedAddress");
CREATE INDEX "CommunicationOptOut_workspaceId_idx" ON "CommunicationOptOut"("workspaceId");
CREATE INDEX "CommunicationOptOut_contactId_idx" ON "CommunicationOptOut"("contactId");
CREATE INDEX "CommunicationOptOut_workspaceId_channel_resubscribedAt_idx"
  ON "CommunicationOptOut"("workspaceId", "channel", "resubscribedAt");
CREATE INDEX "CommunicationOptOut_unsubscribedAt_idx" ON "CommunicationOptOut"("unsubscribedAt");

ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SmsTemplate"
  ADD CONSTRAINT "SmsTemplate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsTemplate"
  ADD CONSTRAINT "SmsTemplate_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign"
  ADD CONSTRAINT "EmailCampaign_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_workflowExecutionId_fkey"
  FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_emailTemplateId_fkey"
  FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_smsTemplateId_fkey"
  FOREIGN KEY ("smsTemplateId") REFERENCES "SmsTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_emailCampaignId_fkey"
  FOREIGN KEY ("emailCampaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutboundMessageLog"
  ADD CONSTRAINT "OutboundMessageLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundMessageLog"
  ADD CONSTRAINT "OutboundMessageLog_outboundMessageId_fkey"
  FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageTrackingLink"
  ADD CONSTRAINT "MessageTrackingLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageTrackingLink"
  ADD CONSTRAINT "MessageTrackingLink_outboundMessageId_fkey"
  FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageTrackingEvent"
  ADD CONSTRAINT "MessageTrackingEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageTrackingEvent"
  ADD CONSTRAINT "MessageTrackingEvent_outboundMessageId_fkey"
  FOREIGN KEY ("outboundMessageId") REFERENCES "OutboundMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageTrackingEvent"
  ADD CONSTRAINT "MessageTrackingEvent_trackingLinkId_fkey"
  FOREIGN KEY ("trackingLinkId") REFERENCES "MessageTrackingLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationOptOut"
  ADD CONSTRAINT "CommunicationOptOut_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationOptOut"
  ADD CONSTRAINT "CommunicationOptOut_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
