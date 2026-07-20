import { PrismaClient, Workspace, WorkspaceMember } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export class WorkspaceService {
  async createWorkspace(
    organizationId: string,
    name: string,
    slug: string,
    userId: string,
    description?: string
  ): Promise<{ workspace: Workspace; member: WorkspaceMember }> {
    // Verify organization exists and user is a member
    const orgMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });

    if (!orgMember) {
      throw new AppError(403, 'Not a member of this organization');
    }

    // Check if slug already exists in this organization
    const existingWorkspace = await prisma.workspace.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });

    if (existingWorkspace) {
      throw new AppError(409, 'Workspace slug already exists in this organization');
    }

    // Create workspace
    const workspace = await prisma.workspace.create({
      data: {
        organizationId,
        name,
        slug,
        description,
      },
    });

    // Add creator as owner
    const member = await prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId: workspace.id,
        role: 'owner',
      },
    });

    return { workspace, member };
  }

  async getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
  }

  async getOrganizationWorkspaces(organizationId: string): Promise<Workspace[]> {
    return prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const members = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
    });

    return members.map((m) => m.workspace);
  }

  async getWorkspaceMembers(workspaceId: string) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
    });
  }

  async inviteMember(
    workspaceId: string,
    email: string,
    role: string,
    invitedBy: string
  ): Promise<WorkspaceMember> {
    // Get workspace
    const workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new AppError(404, 'Workspace not found');
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId,
        },
      },
    });

    if (existingMember) {
      throw new AppError(409, 'User is already a member of this workspace');
    }

    // Add member
    return prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId,
        role,
        invitedBy,
        invitedAt: new Date(),
      },
    });
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    newRole: string
  ): Promise<WorkspaceMember> {
    return prisma.workspaceMember.update({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      data: { role: newRole },
    });
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await prisma.workspaceMember.delete({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });
  }

  async updateWorkspace(
    workspaceId: string,
    data: { name?: string; description?: string; icon?: string }
  ): Promise<Workspace> {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data,
    });
  }
}

export const workspaceService = new WorkspaceService();
