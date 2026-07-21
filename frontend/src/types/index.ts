export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isEmailVerified: boolean;
  profileImage: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  invitedAt: string | null;
  user?: User;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: string;
  invitedAt: string | null;
  user?: User;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============= FUNNEL TYPES =============

export type FunnelType = 'sales' | 'landing' | 'webinar' | 'survey';
export type FunnelStatus = 'draft' | 'published' | 'archived';
export type FunnelPageType = 'landing' | 'sales' | 'checkout' | 'thank_you' | 'upsell' | 'downsell' | 'order_confirmation';
export type BlockType =
  | 'section' | 'container' | 'columns' | 'grid'
  | 'heading' | 'paragraph' | 'image' | 'gallery' | 'button' | 'video'
  | 'form' | 'countdown' | 'testimonials' | 'faq' | 'pricing' | 'features' | 'team'
  | 'navigation' | 'footer' | 'divider' | 'spacer' | 'progress_bar'
  | 'icons' | 'social_icons' | 'maps' | 'html_block' | 'embed_block'
  | 'popup' | 'sticky_bar';

export interface FunnelBlock {
  id: string;
  pageId: string;
  parentId: string | null;
  blockType: BlockType;
  blockName: string | null;
  content: Record<string, any>;
  styles: Record<string, any>;
  responsiveStyles: Record<string, any>;
  animation: Record<string, any>;
  visibility: Record<string, any>;
  sortOrder: number;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  children?: FunnelBlock[];
}

export interface FunnelPage {
  id: string;
  funnelId: string;
  pageType: FunnelPageType;
  name: string;
  slug: string | null;
  sortOrder: number;
  isHomePage: boolean;
  settings: Record<string, any>;
  seoMeta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  blocks: FunnelBlock[];
}

export interface Funnel {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  slug: string | null;
  status: FunnelStatus;
  isPublished: boolean;
  publishedUrl: string | null;
  customDomain: string | null;
  funnelType: FunnelType;
  version: number;
  tags: string[];
  settings: Record<string, any>;
  seoMeta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  pages?: FunnelPage[];
  _count?: {
    pages: number;
    analytics: number;
    formSubmissions: number;
    versions: number;
  };
}

export interface FunnelVersion {
  id: string;
  funnelId: string;
  version: number;
  snapshot: Record<string, any>;
  createdByUserId: string | null;
  changelog: string | null;
  createdAt: string;
}

export interface FunnelForm {
  id: string;
  funnelId: string;
  name: string;
  fields: FormField[];
  settings: Record<string, any>;
  afterSubmission: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  _count?: { submissions: number };
}

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'dropdown' | 'checkbox' | 'radio' | 'date' | 'number' | 'hidden' | 'file' | 'signature' | 'consent';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  defaultValue?: string;
  validation?: Record<string, any>;
}

export interface FunnelFormSubmission {
  id: string;
  funnelId: string;
  formId: string;
  contactId: string | null;
  data: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface FunnelAnalytics {
  id: string;
  funnelId: string;
  pageId: string | null;
  eventType: string;
  visitorId: string | null;
  sessionId: string | null;
  url: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  createdAt: string;
}

export interface FunnelAnalyticsSummary {
  uniqueVisitors: number;
  totalPageViews: number;
  totalConversions: number;
  conversionRate: string;
}
