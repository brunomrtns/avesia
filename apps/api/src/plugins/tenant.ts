import type { FastifyRequest, FastifyReply } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';

import { TenantError, NotFoundError } from '@avesia/shared';
import { Role } from '@avesia/types';

export const tenantPlugin: FastifyPluginAsync = async (): Promise<void> => {
  // no-op decorator; enforcement via preHandlers below
};

export async function requireTenant(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // SUPER_ADMIN can operate without tenant context (cross-org operations)
  if (request.role === Role.SUPER_ADMIN) {
    return;
  }
  if (!request.organizationId) {
    throw new TenantError('Organization context required');
  }
}

export async function requireSuperAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (request.role !== Role.SUPER_ADMIN) {
    throw new TenantError('Super admin access required');
  }
}

interface RequirePermissionOptions {
  resource: string;
  action: string;
}

export function requirePermission(
  opts: RequirePermissionOptions,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const role = request.role;

    if (role === Role.OWNER || role === Role.SUPER_ADMIN) {
      return;
    }

    const prisma = request.server.prisma;
    const permission = await prisma.permission.findUnique({
      where: {
        role_resource_action: {
          role,
          resource: opts.resource,
          action: opts.action,
        },
      },
    });

    if (!permission) {
      throw new TenantError(
        `Insufficient permissions: ${opts.action} on ${opts.resource} requires role elevation`,
      );
    }
  };
}

interface RequireOwnershipOptions {
  resourceType: 'patient' | 'session';
  paramName?: string;
}

export function requireResourceOwnership(
  opts: RequireOwnershipOptions,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (request.role === Role.OWNER || request.role === Role.ADMIN) {
      return;
    }

    const prisma = request.server.prisma;
    const resourceId = (request.params as Record<string, string>)[opts.paramName ?? 'id'];

    if (!resourceId) {
      throw new TenantError('Resource ID required for ownership check');
    }

    const professional = await prisma.professional.findUnique({
      where: { userId: request.userId },
      select: { id: true },
    });

    if (!professional) {
      throw new TenantError('Professional profile required for this operation');
    }

    if (opts.resourceType === 'patient') {
      const relation = await prisma.professionalPatient.findUnique({
        where: {
          professionalId_patientId: {
            professionalId: professional.id,
            patientId: resourceId,
          },
        },
      });

      if (!relation) {
        throw new NotFoundError('Patient', resourceId);
      }
    }

    if (opts.resourceType === 'session') {
      const session = await prisma.clinicalSession.findUnique({
        where: { id: resourceId },
        select: { professionalId: true },
      });

      if (!session) {
        throw new NotFoundError('Session', resourceId);
      }

      if (session.professionalId !== professional.id) {
        throw new NotFoundError('Session', resourceId);
      }
    }
  };
}
