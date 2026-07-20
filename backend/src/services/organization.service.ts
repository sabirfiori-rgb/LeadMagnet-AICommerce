import { PrismaClient, Organization, OrganizationMember } from '@prisma/client';
import { AppError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export class OrganizationService {
  async createOrganization(
    name: string,
    slug: string,
    userId: string,
    description?: string
  ): Promise<{ organization: Organization; member: OrganizationMember }> {
    // Check if slug already exists
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      throw new AppError(409, 'Organization slug already exists');
    }

    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        description,
      },
    });

    // Add creator as owner
    const member = await prisma.organizationMember.create({
      data: {
        userId,
        organizationId: organization.id,
        role: 'owner',
      },
    });

    return { organization, member };
  }

  async getOrganizationById(organizationId: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id: organizationId },
    });
  }

  async getUserOrganizations(userId: string): Promise<Organization[]> {
    const members = await prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
    });

    return members.map((m) => m.organization);
  }

  async getOrganizationMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
    });
  }

  async inviteMember(
    organizationId: string,
    email: string,
    role: string,
    invitedBy: string
  ): Promise<OrganizationMember> {
    // Get organization
    const org = await this.getOrganizationById(organizationId);
    if (!org) {
      throw new AppError(404, 'Organization not found');
    }

    // Check if user exists (in a real system, you might create an invitation instead)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Check if already a member
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (existingMember) {
      throw new AppError(409, 'User is already a member of this organization');
    }

    // Add member
    return prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId,
        role,
        invitedBy,
        invitedAt: new Date(),
      },
    });
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    newRole: string
  ): Promise<OrganizationMember> {
    return prisma.organizationMember.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: { role: newRole },
    });
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await prisma.organizationMember.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    });
  }

  async updateOrganization(
    organizationId: string,
    data: { name?: string; description?: string; logo?: string }
  ): Promise<Organization> {
    return prisma.organization.update({
      where: { id: organizationId },
      data,
    });
  }
}

export const organizationService = new OrganizationService();
