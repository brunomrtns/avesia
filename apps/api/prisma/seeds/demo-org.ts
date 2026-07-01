import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '@avesia/shared';

const DEMO_ORG_SLUG = 'demo-clinic';
const DEMO_OWNER_EMAIL = 'owner@demo.avesia';
const DEMO_PATIENT_EMAIL = 'patient@example.com';

export async function seedDemoOrg(prisma: PrismaClient): Promise<void> {
  console.log('🏥  Seeding demo organization...');

  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: { name: 'Demo Clinic' },
    create: {
      name: 'Demo Clinic',
      slug: DEMO_ORG_SLUG,
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

  const passwordHash = await hashPassword('password123');

  const owner = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: DEMO_OWNER_EMAIL,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      email: DEMO_OWNER_EMAIL,
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  console.log(`   ✓ Owner user: ${owner.email}`);

  const specialty = await prisma.specialty.findUniqueOrThrow({
    where: { slug: 'psychology' },
  });

  const professional = await prisma.professional.upsert({
    where: { userId: owner.id },
    update: {},
    create: {
      organizationId: org.id,
      userId: owner.id,
      specialtyId: specialty.id,
      fullName: 'Dr. Demo Psychologist',
      documentNumber: 'CRM/SP 000000',
      bio: 'Demo psychologist for development and testing.',
      status: 'ACTIVE',
    },
  });
  console.log(`   ✓ Professional: ${professional.fullName}`);

  // Seed a distinct PROFESSIONAL role user for RBAC testing
  const doctorUser = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'doctor@demo.avesia',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      email: 'doctor@demo.avesia',
      passwordHash,
      role: 'PROFESSIONAL',
      status: 'ACTIVE',
    },
  });
  console.log(`   ✓ Doctor user: ${doctorUser.email}`);

  const doctorProfessional = await prisma.professional.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      organizationId: org.id,
      userId: doctorUser.id,
      specialtyId: specialty.id,
      fullName: 'Dra. Ana Silveira',
      documentNumber: 'CRM/SP 123456',
      bio: 'Dra. Ana Silveira is a psychologist assigned to clinical sessions.',
      status: 'ACTIVE',
    },
  });
  console.log(`   ✓ Doctor Professional profile: ${doctorProfessional.fullName}`);

  const patient = await prisma.patient.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: DEMO_PATIENT_EMAIL,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      fullName: 'Sample Patient',
      email: DEMO_PATIENT_EMAIL,
      phone: '+55 11 99999-0000',
      dateOfBirth: new Date('1990-01-15'),
      gender: 'OTHER',
      address: {
        street: 'Rua Exemplo, 123',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
      },
      notes: 'Demo patient for development and testing.',
      status: 'ACTIVE',
      tags: ['demo', 'initial-assessment'],
    },
  });
  console.log(`   ✓ Patient: ${patient.fullName}`);

  // Link Patient to Doctor
  await prisma.professionalPatient.upsert({
    where: {
      professionalId_patientId: {
        professionalId: doctorProfessional.id,
        patientId: patient.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      professionalId: doctorProfessional.id,
      patientId: patient.id,
    },
  });
  console.log(`   ✓ ProfessionalPatient Association: Dra. Ana Silveira <=> Sample Patient`);

  console.log('\n   ┌──────────────────────────────────────────────┐');
  console.log('   │  Demo logins:                                │');
  console.log('   │  - Owner: owner@demo.avesia / password123    │');
  console.log('   │  - Doctor: doctor@demo.avesia / password123  │');
  console.log('   └──────────────────────────────────────────────┘\n');
}
