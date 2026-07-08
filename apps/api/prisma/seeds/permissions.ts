import type { PrismaClient } from '@prisma/client';

type PermissionSeed = {
  role: string;
  resource: string;
  action: string;
};

const ACTIONS = ['create', 'read', 'update', 'delete'] as const;

const RESOURCES = [
  'organizations',
  'users',
  'professionals',
  'patients',
  'sessions',
  'recordings',
  'transcripts',
  'notes',
  'analyses',
  'attachments',
  'consents',
  'audit_logs',
] as const;

function buildOwnerPermissions(): PermissionSeed[] {
  return RESOURCES.flatMap((resource) =>
    ACTIONS.map((action) => ({ role: 'OWNER', resource, action })),
  );
}

function buildSuperAdminPermissions(): PermissionSeed[] {
  return RESOURCES.flatMap((resource) =>
    ACTIONS.map((action) => ({ role: 'SUPER_ADMIN', resource, action })),
  );
}

function buildAdminPermissions(): PermissionSeed[] {
  const fullAccess: string[] = [
    'users',
    'professionals',
    'patients',
    'sessions',
    'notes',
    'attachments',
    'consents',
  ];
  const readDelete: string[] = ['recordings', 'transcripts'];
  const readOnly: string[] = ['organizations', 'analyses', 'audit_logs'];

  return [
    ...fullAccess.flatMap((r) => ACTIONS.map((a) => ({ role: 'ADMIN', resource: r, action: a }))),
    ...readDelete.flatMap((r) =>
      ['read', 'delete'].map((a) => ({ role: 'ADMIN', resource: r, action: a })),
    ),
    ...readOnly.flatMap((r) =>
      ['read'].map((a) => ({ role: 'ADMIN', resource: r, action: a })),
    ),
  ];
}

function buildProfessionalPermissions(): PermissionSeed[] {
  const crud: string[] = ['sessions', 'notes'];
  const createReadUpdate: string[] = ['patients', 'attachments', 'consents'];
  const readUpdate: string[] = ['transcripts'];
  const readOnly: string[] = ['recordings', 'analyses'];

  return [
    ...crud.flatMap((r) => ACTIONS.map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a }))),
    ...createReadUpdate.flatMap((r) =>
      ['create', 'read', 'update'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a })),
    ),
    ...readUpdate.flatMap((r) =>
      ['read', 'update'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a })),
    ),
    ...readOnly.flatMap((r) =>
      ['read'].map((a) => ({ role: 'PROFESSIONAL', resource: r, action: a })),
    ),
  ];
}

const permissions: PermissionSeed[] = [
  ...buildSuperAdminPermissions(),
  ...buildOwnerPermissions(),
  ...buildAdminPermissions(),
  ...buildProfessionalPermissions(),
];

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  console.log('🔐  Seeding RBAC permissions...');

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: {
        role_resource_action: {
          role: perm.role,
          resource: perm.resource,
          action: perm.action,
        },
      },
      update: {},
      create: perm,
    });
  }

  const counts = permissions.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  for (const [role, count] of Object.entries(counts)) {
    console.log(`   ✓ ${role}: ${count} permissions`);
  }

  console.log(`   ${permissions.length} total permissions seeded.\n`);
}
