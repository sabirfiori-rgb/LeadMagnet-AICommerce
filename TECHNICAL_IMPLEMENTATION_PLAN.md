# Technical Implementation Plan — Phases 6-9

## Architecture Overview

### Current Stack
- **Backend**: Express.js + TypeScript + Prisma ORM + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Zustand + React Query
- **Auth**: JWT-based with sessions, multi-tenant (Organization → Workspace → Member)
- **Patterns**: Provider abstraction, class-based services, asyncHandler middleware, consistent API responses

### Key Patterns to Follow
- Route handlers use `asyncHandler` wrapper from `errorHandler.ts`
- Services use class-based architecture with exported singletons
- Provider abstraction pattern (like `messaging.provider.ts`)
- Prisma for database with migrations
- Consistent API response: `{ success: boolean, data?: T, error?: string }`
- Workspace-scoped tenant isolation via `workspaceId` parameter
- Auth middleware on all protected routes

---

## Phase 6: Website Builder + Sales Funnels

### Database Schema Updates (prisma/schema.prisma)

New models needed:
- `Funnel` - Core funnel entity with status, versioning, publishing
- `FunnelPage` - Pages within a funnel (landing, sales, checkout, etc.)
- `FunnelBlock` - Individual blocks within pages
- `FunnelForm` - Form definitions
- `FunnelFormSubmission` - Form submission data
- `FunnelAnalytics` - Analytics tracking
- `FunnelVersion` - Version history
- `FunnelDomain` - Custom domain support

### Backend Services & Routes

**Services:**
- `funnel.service.ts` - Core funnel CRUD, duplication, import/export
- `funnel-builder.service.ts` - Block management, drag-drop state
- `funnel-publisher.service.ts` - Publishing, versioning, domains
- `funnel-analytics.service.ts` - Analytics tracking
- `funnel-form.service.ts` - Form builder, submissions, webhooks

**Routes:**
- `POST /api/funnels/workspaces/:workspaceId/funnels` - Create funnel
- `GET /api/funnels/workspaces/:workspaceId/funnels` - List funnels
- `GET /api/funnels/workspaces/:workspaceId/funnels/:id` - Get funnel
- `PUT /api/funnels/workspaces/:workspaceId/funnels/:id` - Update funnel
- `DELETE /api/funnels/workspaces/:workspaceId/funnels/:id` - Delete funnel
- `POST /api/funnels/workspaces/:workspaceId/funnels/:id/duplicate` - Duplicate
- `POST /api/funnels/workspaces/:workspaceId/funnels/:id/publish` - Publish
- `POST /api/funnels/workspaces/:workspaceId/funnels/:id/unpublish` - Unpublish
- `GET /api/funnels/workspaces/:workspaceId/funnels/:id/versions` - Version history
- `POST /api/funnels/workspaces/:workspaceId/funnels/:id/versions/:versionId/restore` - Restore version
- `POST /api/funnels/workspaces/:workspaceId/funnels/:id/export` - Export funnel
- `POST /api/funnels/workspaces/:workspaceId/funnels/import` - Import funnel
- Page & Block CRUD endpoints
- Form CRUD & submission endpoints
- Analytics endpoints

### Frontend Components

**Pages:**
- `FunnelsPage.tsx` - Funnel list/dashboard
- `FunnelBuilderPage.tsx` - Visual drag-drop builder
- `FunnelPreviewPage.tsx` - Preview published funnel
- `FunnelAnalyticsPage.tsx` - Analytics dashboard
- `FunnelFormBuilderPage.tsx` - Form builder

**Components:**
- `FunnelCard.tsx` - Funnel list item
- `FunnelEditor.tsx` - Main editor container
- `BlockPalette.tsx` - Draggable block palette
- `Canvas.tsx` - Drop zone / canvas
- `BlockRenderer.tsx` - Render individual blocks
- `StylePanel.tsx` - Styling controls
- `ResponsiveControls.tsx` - Desktop/Tablet/Mobile
- `FormBuilder.tsx` - Form field editor
- `AnalyticsChart.tsx` - Chart components
- `VersionHistory.tsx` - Version timeline

**Block Components:**
- `SectionBlock.tsx`, `ContainerBlock.tsx`, `ColumnsBlock.tsx`, `GridBlock.tsx`
- `HeadingBlock.tsx`, `ParagraphBlock.tsx`, `ImageBlock.tsx`, `GalleryBlock.tsx`
- `ButtonBlock.tsx`, `VideoBlock.tsx`, `FormBlock.tsx`, `CountdownBlock.tsx`
- `TestimonialBlock.tsx`, `FAQBlock.tsx`, `PricingBlock.tsx`, `FeaturesBlock.tsx`
- `TeamBlock.tsx`, `NavBlock.tsx`, `FooterBlock.tsx`, `DividerBlock.tsx`
- `SpacerBlock.tsx`, `ProgressBlock.tsx`, `IconBlock.tsx`, `SocialBlock.tsx`
- `MapBlock.tsx`, `HTMLBlock.tsx`, `EmbedBlock.tsx`, `PopupBlock.tsx`, `StickyBarBlock.tsx`

---

## Phase 7: Calendars & Appointments

### Database Schema Updates

New models:
- `Calendar` - Calendar configuration
- `CalendarAvailability` - Availability slots
- `CalendarService` - Service offerings
- `CalendarBooking` - Booked appointments
- `CalendarHoliday` - Holiday/blocked dates
- `CalendarIntegration` - External calendar provider config

### Backend Services & Routes

**Services:**
- `calendar.service.ts` - Calendar CRUD, availability management
- `booking.service.ts` - Booking flow, reschedule, cancel
- `calendar-provider.ts` - Provider abstraction (Google, Outlook, Apple)
- `calendar-notification.service.ts` - Reminders, confirmations

**Routes:**
- Calendar CRUD
- Availability management
- Service management
- Booking flow (choose service → member → date → time → confirm)
- Reschedule/Cancel
- Integration endpoints (Google Calendar, Outlook, Apple)

### Frontend Components

**Pages:**
- `CalendarsPage.tsx` - Calendar list
- `CalendarSettingsPage.tsx` - Calendar configuration
- `BookingPage.tsx` - Public booking flow
- `AppointmentsPage.tsx` - Appointment management

**Components:**
- `CalendarPicker.tsx` - Date/time picker
- `AvailabilityEditor.tsx` - Set availability
- `BookingWidget.tsx` - Embeddable booking widget
- `AppointmentCard.tsx` - Appointment display
- `IntegrationConnect.tsx` - Calendar integration setup

---

## Phase 8: AI Platform + Analytics

### Database Schema Updates

New models:
- `AiProvider` - AI provider configuration
- `AiUsage` - Usage tracking
- `AiConversation` - AI chat sessions
- `AnalyticsEvent` - Analytics events
- `AnalyticsReport` - Saved reports
- `DashboardCard` - Custom dashboard cards

### Backend Services & Routes

**Services:**
- `ai-provider.ts` - Provider abstraction (OpenAI, Anthropic, etc.)
- `ai-assistant.service.ts` - AI chat assistant
- `ai-crm.service.ts` - CRM AI features
- `ai-content.service.ts` - Content generation
- `ai-analytics.service.ts` - AI-powered analytics
- `analytics.service.ts` - Analytics engine
- `report.service.ts` - Report generation & export

**Routes:**
- AI chat endpoints
- AI content generation endpoints
- AI CRM assistant endpoints
- Analytics endpoints
- Report endpoints (CSV, Excel, PDF export)

### Frontend Components

**Pages:**
- `AiAssistantPage.tsx` - AI chat interface
- `AnalyticsDashboardPage.tsx` - Analytics dashboard
- `ReportsPage.tsx` - Reports management
- `AiSettingsPage.tsx` - AI configuration

**Components:**
- `AiChatWidget.tsx` - Chat interface
- `AnalyticsCard.tsx` - Dashboard card
- `ChartComponent.tsx` - Chart rendering
- `DateRangePicker.tsx` - Date range selection
- `ExportButton.tsx` - Export functionality
- `AiSuggestionPopover.tsx` - AI suggestions

---

## Phase 9: Billing & Subscriptions

### Database Schema Updates

New models:
- `SubscriptionPlan` - Plan definitions
- `Subscription` - Organization subscriptions
- `Invoice` - Billing invoices
- `PaymentMethod` - Stored payment methods
- `Coupon` - Discount coupons
- `UsageRecord` - Usage tracking records
- `FeatureLimit` - Feature limit enforcement

### Backend Services & Routes

**Services:**
- `billing-provider.ts` - Payment provider abstraction (Stripe, etc.)
- `subscription.service.ts` - Subscription management
- `billing.service.ts` - Invoicing, payments
- `feature-enforcement.service.ts` - Server-side feature limits
- `usage-tracking.service.ts` - Usage metering

**Routes:**
- Plan CRUD (admin)
- Subscription management
- Checkout session
- Billing portal
- Payment methods
- Invoices
- Coupons
- Webhook handler
- Usage tracking

### Frontend Components

**Pages:**
- `PlansPage.tsx` - Plan comparison/pricing
- `SubscriptionPage.tsx` - Subscription management
- `BillingPage.tsx` - Billing dashboard
- `InvoicesPage.tsx` - Invoice history
- `AdminPlansPage.tsx` - Plan management (admin)

**Components:**
- `PricingCard.tsx` - Plan display
- `SubscriptionStatus.tsx` - Status badge
- `InvoiceTable.tsx` - Invoice listing
- `PaymentMethodForm.tsx` - Payment method input
- `UsageMeter.tsx` - Usage progress bar
- `FeatureLimitBadge.tsx` - Feature limit indicator

---

## Admin Dashboard

### Backend Routes
- `GET /api/admin/users` - List users
- `GET /api/admin/organizations` - List organizations
- `GET /api/admin/plans` - Manage plans
- `GET /api/admin/subscriptions` - View all subscriptions
- `GET /api/admin/revenue` - Revenue analytics
- `GET /api/admin/ai-usage` - AI usage overview
- `GET /api/admin/audit-logs` - Audit log viewer
- `GET /api/admin/health` - System health
- `PUT /api/admin/feature-flags` - Feature flags
- `GET /api/admin/settings` - System settings

### Frontend Pages
- `AdminDashboardPage.tsx` - Admin overview
- `AdminUsersPage.tsx` - User management
- `AdminOrganizationsPage.tsx` - Organization management
- `AdminPlansPage.tsx` - Plan management
- `AdminRevenuePage.tsx` - Revenue dashboard
- `AdminAuditLogPage.tsx` - Audit log viewer
- `AdminSettingsPage.tsx` - System settings

---

## Security Implementation

- Tenant isolation via workspace-scoped queries (existing pattern)
- Role-based access control (owner, admin, editor, viewer)
- Input validation on all endpoints
- Rate limiting (existing middleware)
- Audit logging for all critical operations
- Secure JWT with proper expiration
- Password hashing with bcrypt (existing)
- Environment variable validation
- CORS configuration (existing)
- Helmet middleware (existing)

---

## Performance Optimizations

- Lazy loading for route components
- Pagination for all list endpoints (existing pattern)
- Code splitting by route
- Image optimization for funnel assets
- Query optimization with Prisma select/include
- Caching layer for analytics
- Background jobs for email/SMS delivery (existing)
- Queue workers for funnel publishing

---

## Testing Strategy

1. **Frontend Build**: `npm run build` in frontend
2. **Backend Build**: `npm run build` in backend
3. **Database Migration**: Test new migrations
4. **Type Checking**: `npm run type-check` in both
5. **Linting**: `npm run lint` in both

---

## Deployment Preparation

- Update `.env.example` with all new variables
- Update `README.md` with new features
- Create API documentation
- Create migration guide
- Update `docker-compose.yml` if needed

---

## Implementation Order

1. Database schema updates (all phases)
2. Backend services & routes (Phase 6 → 7 → 8 → 9)
3. Frontend components & pages (Phase 6 → 7 → 8 → 9)
4. Admin dashboard
5. Security hardening
6. Performance optimization
7. Testing & fixes
8. Documentation & deployment prep
