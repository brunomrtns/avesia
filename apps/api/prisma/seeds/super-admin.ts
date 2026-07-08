import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '@avesia/shared';

const SUPER_ADMIN_ORG_SLUG = 'bruno-integrations';
const SUPER_ADMIN_EMAIL = 'admin@brunointegrations.com';

export async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  console.log('🔐  Seeding super admin organization...');

  const org = await prisma.organization.upsert({
    where: { slug: SUPER_ADMIN_ORG_SLUG },
    update: { name: 'Bruno Integrations' },
    create: {
      name: 'Bruno Integrations',
      slug: SUPER_ADMIN_ORG_SLUG,
      status: 'ACTIVE',
      settings: {
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        features: {
          aiAnalysis: true,
          transcription: true,
        },
      },
    },
  });
  console.log(`   ✓ Organization: ${org.name} (${org.slug})`);

  const passwordHash = await hashPassword('Avesia@2025!');

  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: SUPER_ADMIN_EMAIL,
      },
    },
    update: { role: 'SUPER_ADMIN' },
    create: {
      organizationId: org.id,
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  });
  console.log(`   ✓ Super admin user: ${admin.email}`);
  console.log(`   ✓ Temp password: Avesia@2025! (must change on first login)`);

  console.log('\n   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  Super Admin login:                                     │');
  console.log('   │  - admin@brunointegrations.com / Avesia@2025!            │');
  console.log('   │  (will be forced to change password on first login)      │');
  console.log('   └──────────────────────────────────────────────────────────┘\n');
}
