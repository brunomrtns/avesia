import { PrismaClient } from '@prisma/client';
import { seedSpecialties } from './specialties.js';
import { seedPermissions } from './permissions.js';
import { seedDemoOrg } from './demo-org.js';
import { seedSuperAdmin } from './super-admin.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('\n🌱  AVESIA — Database Seed Starting...\n');

  await seedSpecialties(prisma);
  await seedPermissions(prisma);
  await seedSuperAdmin(prisma);
  await seedDemoOrg(prisma);

  console.log('\n✅  All seeds completed successfully!\n');
}

main()
  .catch((error: unknown) => {
    console.error('\n❌  Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
