import type { PrismaClient, Prisma } from '@prisma/client';

interface AuditEntry {
  organizationId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress: string;
  userAgent: string;
}

export function writeAuditLog(prisma: PrismaClient, entry: AuditEntry): Promise<unknown> {
  return prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    },
  });
}
