import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create a test user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      passwordHash: await hashPassword('Test123!@#'),
      isEmailVerified: true,
    },
  });

  console.log('✅ Test user created:', user.email);

  // Create an organization
  const org = await prisma.organization.create({
    data: {
      name: 'Test Organization',
      slug: 'test-org',
      description: 'A test organization',
    },
  });

  console.log('✅ Organization created:', org.slug);

  // Add user to organization
  const orgMember = await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
    },
  });

  console.log('✅ User added to organization as owner');

  // Create a workspace
  const workspace = await prisma.workspace.create({
    data: {
      organizationId: org.id,
      name: 'Default Workspace',
      slug: 'default',
      description: 'Default workspace',
    },
  });

  console.log('✅ Workspace created:', workspace.slug);

  // Add user to workspace
  const workspaceMember = await prisma.workspaceMember.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: 'owner',
    },
  });

  console.log('✅ User added to workspace as owner');

  console.log('\n🎉 Seeding completed!');
  console.log('\n📝 Test credentials:');
  console.log('Email: test@example.com');
  console.log('Password: Test123!@#');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
