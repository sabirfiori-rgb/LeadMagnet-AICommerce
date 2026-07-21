import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

type JsonRecord = Record<string, unknown>;

export type FunnelType = 'sales' | 'landing' | 'webinar' | 'survey';
export type FunnelPageType = 'landing' | 'sales' | 'checkout' | 'thank_you' | 'upsell' | 'downsell' | 'order_confirmation';
export type BlockType =
  | 'section' | 'container' | 'columns' | 'grid'
  | 'heading' | 'paragraph' | 'image' | 'gallery' | 'button' | 'video'
  | 'form' | 'countdown' | 'testimonials' | 'faq' | 'pricing' | 'features' | 'team'
  | 'navigation' | 'footer' | 'divider' | 'spacer' | 'progress_bar'
  | 'icons' | 'social_icons' | 'maps' | 'html_block' | 'embed_block'
  | 'popup' | 'sticky_bar';

export interface CreateFunnelInput {
  name: string;
  description?: string;
  funnelType?: FunnelType;
  tags?: string[];
  settings?: JsonRecord;
  seoMeta?: JsonRecord;
}

export interface UpdateFunnelInput {
  name?: string;
  description?: string;
  slug?: string;
  funnelType?: FunnelType;
  tags?: string[];
  settings?: JsonRecord;
  seoMeta?: JsonRecord;
  customDomain?: string;
}

export interface CreatePageInput {
  pageType: FunnelPageType;
  name: string;
  slug?: string;
  sortOrder?: number;
  isHomePage?: boolean;
  settings?: JsonRecord;
  seoMeta?: JsonRecord;
}

export interface CreateBlockInput {
  blockType: BlockType;
  blockName?: string;
  parentId?: string;
  content?: JsonRecord;
  styles?: JsonRecord;
  responsiveStyles?: JsonRecord;
  animation?: JsonRecord;
  visibility?: JsonRecord;
  sortOrder?: number;
}

export interface UpdateBlockInput {
  blockName?: string;
  content?: JsonRecord;
  styles?: JsonRecord;
  responsiveStyles?: JsonRecord;
  animation?: JsonRecord;
  visibility?: JsonRecord;
  sortOrder?: number;
  isHidden?: boolean;
}

export class FunnelService {
  async create(workspaceId: string, userId: string, input: CreateFunnelInput) {
    if (!input.name?.trim()) throw new AppError(400, 'Funnel name is required');

    const funnel = await prisma.funnel.create({
      data: {
        workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        slug: `funnel-${randomUUID().slice(0, 12)}`,
        funnelType: input.funnelType || 'sales',
        tags: input.tags || [],
        settings: (input.settings || {}) as Prisma.InputJsonValue,
        seoMeta: (input.seoMeta || {}) as Prisma.InputJsonValue,
      },
    });

    await prisma.funnelPage.create({
      data: {
        funnelId: funnel.id,
        pageType: 'landing',
        name: 'Home',
        slug: 'home',
        sortOrder: 0,
        isHomePage: true,
      },
    });

    await this.createVersion(funnel.id, userId, 'Initial version');
    return this.get(workspaceId, funnel.id);
  }

  async list(workspaceId: string, options: { status?: string; search?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = { workspaceId, deletedAt: null };
    if (options.status) where.status = options.status;
    if (options.search) where.name = { contains: options.search, mode: 'insensitive' };

    const [funnels, total] = await Promise.all([
      prisma.funnel.findMany({
        where, skip, take: limit, orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { pages: true, analytics: true, formSubmissions: true } },
          pages: { select: { id: true, name: true, pageType: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.funnel.count({ where }),
    ]);

    return { funnels, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async get(workspaceId: string, funnelId: string) {
    const funnel = await prisma.funnel.findFirst({
      where: { id: funnelId, workspaceId, deletedAt: null },
      include: {
        pages: {
          include: { blocks: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { analytics: true, formSubmissions: true, versions: true } },
      },
    });
    if (!funnel) throw new AppError(404, 'Funnel not found');
    return funnel;
  }

  async update(workspaceId: string, funnelId: string, input: UpdateFunnelInput) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.funnelType !== undefined) data.funnelType = input.funnelType;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
    if (input.seoMeta !== undefined) data.seoMeta = input.seoMeta as Prisma.InputJsonValue;
    if (input.customDomain !== undefined) data.customDomain = input.customDomain || null;

    return prisma.funnel.update({ where: { id: funnel.id }, data });
  }

  async delete(workspaceId: string, funnelId: string) {
    const result = await prisma.funnel.updateMany({
      where: { id: funnelId, workspaceId, deletedAt: null },
      data: { deletedAt: new Date(), status: 'archived', isPublished: false },
    });
    if (!result.count) throw new AppError(404, 'Funnel not found');
  }

  async duplicate(workspaceId: string, funnelId: string, userId: string) {
    const funnel = await this.get(workspaceId, funnelId);
    const newFunnel = await this.create(workspaceId, userId, {
      name: `${funnel.name} (Copy)`,
      description: funnel.description,
      funnelType: funnel.funnelType as FunnelType,
      tags: funnel.tags,
      settings: funnel.settings as JsonRecord,
      seoMeta: funnel.seoMeta as JsonRecord,
    });

    for (const page of funnel.pages) {
      const newPage = await prisma.funnelPage.create({
        data: {
          funnelId: newFunnel!.id,
          pageType: page.pageType,
          name: page.name,
          slug: page.slug || undefined,
          sortOrder: page.sortOrder,
          isHomePage: page.isHomePage,
          settings: (page.settings || {}) as Prisma.InputJsonValue,
          seoMeta: (page.seoMeta || {}) as Prisma.InputJsonValue,
        },
      });

      for (const block of page.blocks) {
        await prisma.funnelBlock.create({
          data: {
            pageId: newPage.id,
            parentId: null,
            blockType: block.blockType,
            blockName: block.blockName,
            content: (block.content || {}) as Prisma.InputJsonValue,
            styles: (block.styles || {}) as Prisma.InputJsonValue,
            responsiveStyles: (block.responsiveStyles || {}) as Prisma.InputJsonValue,
            animation: (block.animation || {}) as Prisma.InputJsonValue,
            visibility: (block.visibility || {}) as Prisma.InputJsonValue,
            sortOrder: block.sortOrder,
            isHidden: block.isHidden,
          },
        });
      }
    }

    return this.get(workspaceId, newFunnel!.id);
  }

  async publish(workspaceId: string, funnelId: string, userId: string) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');
    if (funnel.isPublished) throw new AppError(400, 'Funnel is already published');

    const baseUrl = process.env.FUNNEL_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5000';
    const publishedUrl = `${baseUrl}/f/${funnel.slug}`;

    const updated = await prisma.funnel.update({
      where: { id: funnel.id },
      data: { status: 'published', isPublished: true, publishedUrl, version: { increment: 1 } },
    });

    await this.createVersion(funnel.id, userId, 'Published');
    return updated;
  }

  async unpublish(workspaceId: string, funnelId: string) {
    const result = await prisma.funnel.updateMany({
      where: { id: funnelId, workspaceId, deletedAt: null, isPublished: true },
      data: { status: 'draft', isPublished: false, publishedUrl: null },
    });
    if (!result.count) throw new AppError(404, 'Funnel not found or not published');
  }

  async archive(workspaceId: string, funnelId: string) {
    const result = await prisma.funnel.updateMany({
      where: { id: funnelId, workspaceId, deletedAt: null },
      data: { status: 'archived', isPublished: false },
    });
    if (!result.count) throw new AppError(404, 'Funnel not found');
  }

  async createVersion(funnelId: string, userId?: string, changelog?: string) {
    const funnel = await prisma.funnel.findUnique({
      where: { id: funnelId },
      include: { pages: { include: { blocks: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!funnel) throw new AppError(404, 'Funnel not found');

    const maxVersion = await prisma.funnelVersion.findFirst({
      where: { funnelId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return prisma.funnelVersion.create({
      data: {
        funnelId,
        version: (maxVersion?.version || 0) + 1,
        snapshot: JSON.parse(JSON.stringify({ funnel })) as Prisma.InputJsonValue,
        createdByUserId: userId || null,
        changelog: changelog || null,
      },
    });
  }

  async listVersions(workspaceId: string, funnelId: string) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');
    return prisma.funnelVersion.findMany({ where: { funnelId }, orderBy: { version: 'desc' }, take: 50 });
  }

  async restoreVersion(workspaceId: string, funnelId: string, versionId: string, userId: string) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');

    const version = await prisma.funnelVersion.findFirst({ where: { id: versionId, funnelId } });
    if (!version) throw new AppError(404, 'Version not found');

    const snapshot = version.snapshot as any;
    if (!snapshot?.funnel) throw new AppError(400, 'Invalid version snapshot');

    const restoredPages = snapshot.funnel.pages || [];
    await prisma.$transaction(async (tx) => {
      const existingPages = await tx.funnelPage.findMany({ where: { funnelId }, select: { id: true } });
      for (const page of existingPages) {
        await tx.funnelBlock.deleteMany({ where: { pageId: page.id } });
      }
      await tx.funnelPage.deleteMany({ where: { funnelId } });

      for (const page of restoredPages) {
        const newPage = await tx.funnelPage.create({
          data: {
            funnelId,
            pageType: page.pageType,
            name: page.name,
            slug: page.slug || undefined,
            sortOrder: page.sortOrder || 0,
            isHomePage: page.isHomePage || false,
            settings: page.settings || undefined,
            seoMeta: page.seoMeta || undefined,
          },
        });

        const blocks = page.blocks || [];
        for (const block of blocks) {
          await tx.funnelBlock.create({
            data: {
              pageId: newPage.id,
              parentId: block.parentId || null,
              blockType: block.blockType,
              blockName: block.blockName,
              content: block.content || undefined,
              styles: block.styles || undefined,
              responsiveStyles: block.responsiveStyles || undefined,
              animation: block.animation || undefined,
              visibility: block.visibility || undefined,
              sortOrder: block.sortOrder || 0,
              isHidden: block.isHidden || false,
            },
          });
        }
      }

      await tx.funnel.update({ where: { id: funnelId }, data: { version: { increment: 1 } } });
    });

    await this.createVersion(funnelId, userId, `Restored from version ${version.version}`);
    return this.get(workspaceId, funnelId);
  }

  async createPage(workspaceId: string, funnelId: string, input: CreatePageInput) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');

    const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `page-${Date.now()}`;

    return prisma.funnelPage.create({
      data: {
        funnelId,
        pageType: input.pageType,
        name: input.name.trim(),
        slug,
        sortOrder: input.sortOrder || 0,
        isHomePage: input.isHomePage || false,
        settings: (input.settings || {}) as Prisma.InputJsonValue,
        seoMeta: (input.seoMeta || {}) as Prisma.InputJsonValue,
      },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updatePage(workspaceId: string, funnelId: string, pageId: string, input: Partial<CreatePageInput>) {
    const page = await prisma.funnelPage.findFirst({
      where: { id: pageId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!page) throw new AppError(404, 'Page not found');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.pageType !== undefined) data.pageType = input.pageType;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isHomePage !== undefined) data.isHomePage = input.isHomePage;
    if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
    if (input.seoMeta !== undefined) data.seoMeta = input.seoMeta as Prisma.InputJsonValue;

    return prisma.funnelPage.update({ where: { id: page.id }, data });
  }

  async deletePage(workspaceId: string, funnelId: string, pageId: string) {
    const page = await prisma.funnelPage.findFirst({
      where: { id: pageId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!page) throw new AppError(404, 'Page not found');
    await prisma.funnelBlock.deleteMany({ where: { pageId: page.id } });
    await prisma.funnelPage.delete({ where: { id: page.id } });
  }

  async createBlock(workspaceId: string, funnelId: string, pageId: string, input: CreateBlockInput) {
    const page = await prisma.funnelPage.findFirst({
      where: { id: pageId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!page) throw new AppError(404, 'Page not found');

    return prisma.funnelBlock.create({
      data: {
        pageId: page.id,
        parentId: input.parentId || null,
        blockType: input.blockType,
        blockName: input.blockName || null,
        content: (input.content || {}) as Prisma.InputJsonValue,
        styles: (input.styles || {}) as Prisma.InputJsonValue,
        responsiveStyles: (input.responsiveStyles || {}) as Prisma.InputJsonValue,
        animation: (input.animation || {}) as Prisma.InputJsonValue,
        visibility: (input.visibility || {}) as Prisma.InputJsonValue,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async updateBlock(workspaceId: string, funnelId: string, pageId: string, blockId: string, input: UpdateBlockInput) {
    const block = await prisma.funnelBlock.findFirst({
      where: { id: blockId, pageId, page: { funnel: { workspaceId, id: funnelId, deletedAt: null } } },
    });
    if (!block) throw new AppError(404, 'Block not found');

    const data: any = {};
    if (input.blockName !== undefined) data.blockName = input.blockName;
    if (input.content !== undefined) data.content = input.content as Prisma.InputJsonValue;
    if (input.styles !== undefined) data.styles = input.styles as Prisma.InputJsonValue;
    if (input.responsiveStyles !== undefined) data.responsiveStyles = input.responsiveStyles as Prisma.InputJsonValue;
    if (input.animation !== undefined) data.animation = input.animation as Prisma.InputJsonValue;
    if (input.visibility !== undefined) data.visibility = input.visibility as Prisma.InputJsonValue;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isHidden !== undefined) data.isHidden = input.isHidden;

    return prisma.funnelBlock.update({ where: { id: block.id }, data });
  }

  async deleteBlock(workspaceId: string, funnelId: string, pageId: string, blockId: string) {
    const block = await prisma.funnelBlock.findFirst({
      where: { id: blockId, pageId, page: { funnel: { workspaceId, id: funnelId, deletedAt: null } } },
    });
    if (!block) throw new AppError(404, 'Block not found');
    await prisma.funnelBlock.deleteMany({ where: { parentId: block.id } });
    await prisma.funnelBlock.delete({ where: { id: block.id } });
  }

  async reorderBlocks(workspaceId: string, funnelId: string, pageId: string, blockOrder: { id: string; sortOrder: number }[]) {
    const page = await prisma.funnelPage.findFirst({
      where: { id: pageId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!page) throw new AppError(404, 'Page not found');

    await prisma.$transaction(
      blockOrder.map(({ id, sortOrder }) =>
        prisma.funnelBlock.updateMany({ where: { id, pageId: page.id }, data: { sortOrder } })
      )
    );
  }

  async exportFunnel(workspaceId: string, funnelId: string) {
    const funnel = await this.get(workspaceId, funnelId);
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      funnel: {
        name: funnel.name,
        description: funnel.description,
        funnelType: funnel.funnelType,
        tags: funnel.tags,
        settings: funnel.settings,
        seoMeta: funnel.seoMeta,
        pages: funnel.pages.map((page: any) => ({
          pageType: page.pageType,
          name: page.name,
          slug: page.slug,
          sortOrder: page.sortOrder,
          isHomePage: page.isHomePage,
          settings: page.settings,
          seoMeta: page.seoMeta,
          blocks: page.blocks?.map((block: any) => ({
            blockType: block.blockType,
            blockName: block.blockName,
            content: block.content,
            styles: block.styles,
            responsiveStyles: block.responsiveStyles,
            animation: block.animation,
            visibility: block.visibility,
            sortOrder: block.sortOrder,
          })),
        })),
      },
    };
  }

  async importFunnel(workspaceId: string, userId: string, exportData: any) {
    if (!exportData?.funnel?.name) throw new AppError(400, 'Invalid funnel export data');

    const funnel = await this.create(workspaceId, userId, {
      name: exportData.funnel.name,
      description: exportData.funnel.description,
      funnelType: exportData.funnel.funnelType,
      tags: exportData.funnel.tags,
      settings: exportData.funnel.settings,
      seoMeta: exportData.funnel.seoMeta,
    });

    const pages = exportData.funnel.pages || [];
    for (const pageData of pages) {
      await this.createPage(workspaceId, funnel!.id, {
        pageType: pageData.pageType || 'landing',
        name: pageData.name || 'Untitled',
        slug: pageData.slug,
        sortOrder: pageData.sortOrder,
        isHomePage: pageData.isHomePage,
        settings: pageData.settings,
        seoMeta: pageData.seoMeta,
      });

      const pagesList = await prisma.funnelPage.findMany({ where: { funnelId: funnel!.id }, orderBy: { sortOrder: 'asc' } });
      const newPage = pagesList[pagesList.length - 1];

      const blocks = pageData.blocks || [];
      for (const blockData of blocks) {
        await this.createBlock(workspaceId, funnel!.id, newPage.id, {
          blockType: blockData.blockType || 'section',
          blockName: blockData.blockName,
          content: blockData.content,
          styles: blockData.styles,
          responsiveStyles: blockData.responsiveStyles,
          animation: blockData.animation,
          visibility: blockData.visibility,
          sortOrder: blockData.sortOrder,
        });
      }
    }

    return this.get(workspaceId, funnel!.id);
  }

  async createForm(workspaceId: string, funnelId: string, input: { name: string; fields?: any; settings?: any; afterSubmission?: any }) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');
    return prisma.funnelForm.create({
      data: {
        funnelId,
        name: input.name.trim(),
        fields: (input.fields || []) as Prisma.InputJsonValue,
        settings: (input.settings || {}) as Prisma.InputJsonValue,
        afterSubmission: (input.afterSubmission || {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateForm(workspaceId: string, funnelId: string, formId: string, input: any) {
    const form = await prisma.funnelForm.findFirst({
      where: { id: formId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!form) throw new AppError(404, 'Form not found');
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.fields !== undefined) data.fields = input.fields as Prisma.InputJsonValue;
    if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
    if (input.afterSubmission !== undefined) data.afterSubmission = input.afterSubmission as Prisma.InputJsonValue;
    return prisma.funnelForm.update({ where: { id: form.id }, data });
  }

  async listForms(workspaceId: string, funnelId: string) {
    const funnel = await prisma.funnel.findFirst({ where: { id: funnelId, workspaceId, deletedAt: null } });
    if (!funnel) throw new AppError(404, 'Funnel not found');
    return prisma.funnelForm.findMany({ where: { funnelId }, include: { _count: { select: { submissions: true } } } });
  }

  async deleteForm(workspaceId: string, funnelId: string, formId: string) {
    const form = await prisma.funnelForm.findFirst({
      where: { id: formId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!form) throw new AppError(404, 'Form not found');
    await prisma.funnelFormSubmission.deleteMany({ where: { formId: form.id } });
    await prisma.funnelForm.delete({ where: { id: form.id } });
  }

  async submitForm(workspaceId: string, funnelId: string, formId: string, data: JsonRecord, metadata?: JsonRecord, contactId?: string) {
    const form = await prisma.funnelForm.findFirst({
      where: { id: formId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
    });
    if (!form) throw new AppError(404, 'Form not found');

    return prisma.funnelFormSubmission.create({
      data: {
        funnelId,
        formId: form.id,
        contactId: contactId || null,
        data: data as Prisma.InputJsonValue,
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
    });
  }

  async listSubmissions(workspaceId: string, funnelId: string, formId: string, options: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 25));
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      prisma.funnelFormSubmission.findMany({
        where: { formId, funnel: { workspaceId, id: funnelId, deletedAt: null } },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.funnelFormSubmission.count({ where: { formId, funnel: { workspaceId, id: funnelId, deletedAt: null } } }),
    ]);

    return { submissions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}

export const funnelService = new FunnelService();
