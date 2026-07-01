import type { PrismaClient } from '@prisma/client';

type SpecialtySeed = {
  name: string;
  slug: string;
  description: string;
  active: boolean;
};

const specialties: SpecialtySeed[] = [
  {
    name: 'Psychology',
    slug: 'psychology',
    description: 'Clinical psychology, psychotherapy, and mental health counseling.',
    active: true,
  },
];

export async function seedSpecialties(prisma: PrismaClient): Promise<void> {
  console.log('📋  Seeding specialties...');

  for (const spec of specialties) {
    await prisma.specialty.upsert({
      where: { slug: spec.slug },
      update: { name: spec.name, description: spec.description, active: spec.active },
      create: spec,
    });
    console.log(`   ✓ ${spec.name} (${spec.slug})`);
  }

  console.log(`   ${specialties.length} specialty(ies) seeded.\n`);
}
