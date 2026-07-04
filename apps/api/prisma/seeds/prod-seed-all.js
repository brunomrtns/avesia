/**
 * Full production seed (plain JS) — specialties + permissions + org + owner.
 * Run with: node prisma/seeds/prod-seed-all.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('/app/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs');

const ORG_NAME = 'Bruno Integrations';
const ORG_SLUG = 'bruno-integrations';
const OWNER_EMAIL = 'brunomartinsss@gmail.com';

function generateStrongPassword() {
  const length = 20;
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password;
}

const OWNER_PASSWORD = generateStrongPassword();

const ACTIONS = ['create', 'read', 'update', 'delete'];
const RESOURCES = [
  'organizations', 'users', 'professionals', 'patients',
  'sessions', 'recordings', 'transcripts', 'notes',
  'analyses', 'attachments', 'consents', 'audit_logs',
];

function buildOwnerPermissions() {
  return RESOURCES.flatMap((resource) =>
    ACTIONS.map((action) => ({ role: 'OWNER', resource, action })),
  );
}

function buildAdminPermissions() {
  const fullAccess = ['users', 'professionals', 'patients', 'sessions', 'notes', 'attachments', 'consents'];
  const readDelete = ['recordings', 'transcripts'];
  const readOnly = ['organizations', 'analyses', 'audit_logs'];
  return [
    ...fullAccess.flatMap((r) => ACTIONS.map((a) => ({ role: 'ADMIN', resource: r, action: a }))),
    ...readDelete.flatMap((r) => ['read', 'delete'].map((a) => ({ role: 'ADMIN', resource: r, action: a }))),
    ...readOnly.flatMap((r) => ['read'].map((a) => ({ role: 'ADMIN', resource: r, action: a }))),
  ];
}

function buildProfessionalPermissions() {
  const crud = ['sessions', 'notes'];
  const createReadUpdate = ['patients', 'attachments', 'consents'];
  const readUpdate = ['transcripts'];
  const readOnly = ['recordings', 'analyses'];
  return [
    ...crud.flatMap((r) => ACTIONS.map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a }))),
    ...createReadUpdate.flatMap((r) => ['create', 'read', 'update'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a }))),
    ...readUpdate.flatMap((r) => ['read', 'update'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a }))),
    ...readOnly.flatMap((r) => ['read'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a }))),
  ];
}

const permissions = [
  ...buildOwnerPermissions(),
  ...buildAdminPermissions(),
  ...buildProfessionalPermissions(),
];

async function main() {
  console.log('\n🌱  AVESIA — Production Seed Starting...\n');

  const prisma = new PrismaClient();

  try {
    // 1. Specialties
    console.log('📋  Seeding specialties...');
    const specialties = [
      { name: 'Psychology', slug: 'psychology', description: 'Clinical psychology, psychotherapy, and mental health counseling.', active: true },
    ];
    for (const spec of specialties) {
      await prisma.specialty.upsert({
        where: { slug: spec.slug },
        update: { name: spec.name, description: spec.description, active: spec.active },
        create: spec,
      });
      console.log(`   ✓ ${spec.name} (${spec.slug})`);
    }

    // 2. Permissions
    console.log('\n🔐  Seeding RBAC permissions...');
    for (const perm of permissions) {
      await prisma.permission.upsert({
        where: { role_resource_action: { role: perm.role, resource: perm.resource, action: perm.action } },
        update: {},
        create: perm,
      });
    }
    const counts = permissions.reduce((acc, p) => { acc[p.role] = (acc[p.role] || 0) + 1; return acc; }, {});
    for (const [role, count] of Object.entries(counts)) {
      console.log(`   ✓ ${role}: ${count} permissions`);
    }

    // 3. Organization
    console.log('\n🏥  Seeding organization...');
    const org = await prisma.organization.upsert({
      where: { slug: ORG_SLUG },
      update: { name: ORG_NAME },
      create: {
        name: ORG_NAME,
        slug: ORG_SLUG,
        status: 'ACTIVE',
        settings: {
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          features: { aiAnalysis: true, transcription: true },
        },
      },
    });
    console.log(`   ✓ Organization: ${org.name} (${org.slug})`);

    // 4. Owner user
    console.log('\n👤  Seeding owner user...');
    const passwordHash = bcrypt.hashSync(OWNER_PASSWORD, 12);
    const owner = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: OWNER_EMAIL } },
      update: {},
      create: {
        organizationId: org.id,
        email: OWNER_EMAIL,
        passwordHash,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    console.log(`   ✓ Owner user: ${owner.email}`);

    // 5. Professional profile
    const specialty = await prisma.specialty.findUnique({ where: { slug: 'psychology' } });
    if (specialty) {
      const professional = await prisma.professional.upsert({
        where: { userId: owner.id },
        update: {},
        create: {
          organizationId: org.id,
          userId: owner.id,
          specialtyId: specialty.id,
          fullName: 'Bruno Martins',
          documentNumber: 'CRM/SP 000000',
          bio: 'Owner and professional at Bruno Integrations.',
          status: 'ACTIVE',
        },
      });
      console.log(`   ✓ Professional: ${professional.fullName}`);
    }

    console.log('\n   ┌──────────────────────────────────────────────────────┐');
    console.log('   │  Production login:                                   │');
    console.log(`   │  Email:    ${OWNER_EMAIL.padEnd(40)}│`);
    console.log(`   │  Password: ${OWNER_PASSWORD.padEnd(40)}│`);
    console.log('   │  ⚠  Save this password — it will NOT be shown again. │');
    console.log('   └──────────────────────────────────────────────────────┘\n');

    console.log('✅  All seeds completed successfully!\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌  Seed failed:', error);
  process.exit(1);
});
