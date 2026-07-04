/**
 * Production seed (plain JS) — creates organization + OWNER user.
 * Run with: node prisma/seeds/prod-seed.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

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

async function main() {
  console.log('\n🌱  AVESIA — Production Seed Starting...\n');

  const prisma = new PrismaClient();

  try {
    // Create organization
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
          features: {
            aiAnalysis: true,
            transcription: true,
          },
        },
      },
    });
    console.log(`   ✓ Organization: ${org.name} (${org.slug})`);

    // Create OWNER user
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
    const owner = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: OWNER_EMAIL,
        },
      },
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

    // Link to psychology specialty (if it exists from base seed)
    const specialty = await prisma.specialty.findUnique({
      where: { slug: 'psychology' },
    });

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
    } else {
      console.log('   ⚠  Psychology specialty not found — skipping professional profile.');
    }

    console.log('\n   ┌──────────────────────────────────────────────────────┐');
    console.log('   │  Production login:                                   │');
    console.log(`   │  Email:    ${OWNER_EMAIL.padEnd(40)}│`);
    console.log(`   │  Password: ${OWNER_PASSWORD.padEnd(40)}│`);
    console.log('   │  ⚠  Save this password — it will NOT be shown again. │');
    console.log('   └──────────────────────────────────────────────────────┘\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\n❌  Seed failed:', error);
  process.exit(1);
});
