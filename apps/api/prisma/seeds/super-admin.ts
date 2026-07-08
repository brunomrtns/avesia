import type { PrismaClient } from '@prisma/client';

const SUPER_ADMIN_ORG_SLUG = 'bruno-integrations';
const SUPER_ADMIN_EMAIL = 'brunomartinsss@gmail.com';

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

  // Promote existing user to SUPER_ADMIN (do not create new user or change password)
  const existing = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: SUPER_ADMIN_EMAIL,
      },
    },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'SUPER_ADMIN' },
    });
    console.log(`   ✓ Promoted existing user to SUPER_ADMIN: ${existing.email}`);
  } else {
    console.log(`   ⚠ User ${SUPER_ADMIN_EMAIL} not found in org ${org.slug} — skipping promotion.`);
    console.log(`     Create the user first via registration, then re-run seed.`);
  }

  console.log('\n   ┌──────────────────────────────────────────────────────────┐');
  console.log('   │  Super Admin:                                           │');
  console.log('   │  - brunomartinsss@gmail.com (SUPER_ADMIN)               │');
  console.log('   └──────────────────────────────────────────────────────────┘\n');
}
