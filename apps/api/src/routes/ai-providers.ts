import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { NotFoundError, TenantError } from '@avesia/shared';
import { Role } from '@avesia/types';
import { createProvider } from '@avesia/ai-providers';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';
import { maskApiKey, loadProviderConfigForOrg, getEmbeddingModelForOrg } from '../lib/org-ai-config.js';
import { writeAuditLog } from '../utils/audit-log.js';

// ── Schemas ──────────────────────────────────────────────────────────────────
const PROVIDER_TYPES = ['nvidia-nim', 'openrouter', 'ollama'] as const;

const createProviderSchema = z.object({
  provider: z.enum(PROVIDER_TYPES),
  label: z.string().min(1).max(100),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).max(200),
  embeddingModel: z.string().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  isFallback: z.boolean().optional(),
});

const updateProviderSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).max(200).optional(),
  embeddingModel: z.string().optional().or(z.literal('')),
});

// ── Admin-only guard ─────────────────────────────────────────────────────────
function requireAdmin(request: FastifyRequest): void {
  if (request.role !== Role.OWNER && request.role !== Role.ADMIN) {
    throw new TenantError('Only OWNER and ADMIN can manage AI providers');
  }
}

// ── Serialize (mask API key) ─────────────────────────────────────────────────
function serialize(cfg: any): any {
  return {
    id: cfg.id,
    provider: cfg.provider,
    label: cfg.label,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    hasApiKey: !!cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    embeddingModel: cfg.embeddingModel,
    isActive: cfg.isActive,
    isFallback: cfg.isFallback,
    lastStatus: cfg.lastStatus,
    lastCheckedAt: cfg.lastCheckedAt,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────
const aiProviderRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);
  // All routes require admin/owner
  app.addHook('preHandler', async (request) => { requireAdmin(request); });

  // ── GET /ai-providers ──────────────────────────────────────────────────────
  app.get('/ai-providers', async (request) => {
    const configs = await app.prisma.aIProviderConfig.findMany({
      where: { organizationId: request.organizationId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return { items: configs.map(serialize) };
  });

  // ── GET /ai-providers/active ───────────────────────────────────────────────
  app.get('/ai-providers/active', async (request) => {
    const active = await app.prisma.aIProviderConfig.findFirst({
      where: { organizationId: request.organizationId, isActive: true },
    });
    if (!active) return { provider: null, config: null };
    const config = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const embeddingModel = await getEmbeddingModelForOrg(app.prisma, request.organizationId);
    return { provider: serialize(active), config: { activeProvider: config.activeProvider, embeddingModel } };
  });

  // ── POST /ai-providers ─────────────────────────────────────────────────────
  app.post('/ai-providers', async (request, reply) => {
    const body = createProviderSchema.parse(request.body);

    // Check if provider type already exists for this org
    const existing = await app.prisma.aIProviderConfig.findUnique({
      where: {
        organizationId_provider: {
          organizationId: request.organizationId,
          provider: body.provider,
        },
      },
    });
    if (existing) {
      throw new TenantError(`Provider "${body.provider}" already exists for this organization`);
    }

    // If isActive, deactivate all others
    if (body.isActive) {
      await app.prisma.aIProviderConfig.updateMany({
        where: { organizationId: request.organizationId, isActive: true },
        data: { isActive: false },
      });
    }

    // If isFallback, unset fallback on all others
    if (body.isFallback) {
      await app.prisma.aIProviderConfig.updateMany({
        where: { organizationId: request.organizationId, isFallback: true },
        data: { isFallback: false },
      });
    }

    const cfg = await app.prisma.aIProviderConfig.create({
      data: {
        organizationId: request.organizationId,
        provider: body.provider,
        label: body.label,
        apiKey: body.apiKey || null,
        baseUrl: body.baseUrl || null,
        model: body.model,
        embeddingModel: body.embeddingModel || null,
        isActive: body.isActive ?? false,
        isFallback: body.isFallback ?? false,
      },
    });

    void writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'CREATE',
      resource: 'ai-provider',
      resourceId: cfg.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return reply.status(201).send(serialize(cfg));
  });

  // ── PUT /ai-providers/:id ──────────────────────────────────────────────────
  app.put('/ai-providers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = updateProviderSchema.parse(request.body);

    const existing = await app.prisma.aIProviderConfig.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!existing) throw new NotFoundError('AIProviderConfig', id);

    // Don't overwrite apiKey with empty string (keep existing)
    const updateData: Record<string, unknown> = {};
    if (body.label !== undefined) updateData.label = body.label;
    if (body.baseUrl !== undefined) updateData.baseUrl = body.baseUrl || null;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.embeddingModel !== undefined) updateData.embeddingModel = body.embeddingModel || null;
    if (body.apiKey !== undefined && body.apiKey !== '') updateData.apiKey = body.apiKey;

    const cfg = await app.prisma.aIProviderConfig.update({
      where: { id },
      data: updateData,
    });

    void writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'UPDATE',
      resource: 'ai-provider',
      resourceId: cfg.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return serialize(cfg);
  });

  // ── DELETE /ai-providers/:id ───────────────────────────────────────────────
  app.delete('/ai-providers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await app.prisma.aIProviderConfig.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!existing) throw new NotFoundError('AIProviderConfig', id);

    await app.prisma.aIProviderConfig.delete({ where: { id } });

    void writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'DELETE',
      resource: 'ai-provider',
      resourceId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return reply.status(204).send();
  });

  // ── PUT /ai-providers/:id/activate ─────────────────────────────────────────
  app.put('/ai-providers/:id/activate', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await app.prisma.aIProviderConfig.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!existing) throw new NotFoundError('AIProviderConfig', id);

    // Deactivate all others
    await app.prisma.aIProviderConfig.updateMany({
      where: { organizationId: request.organizationId, isActive: true },
      data: { isActive: false },
    });

    const cfg = await app.prisma.aIProviderConfig.update({
      where: { id },
      data: { isActive: true },
    });

    void writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'UPDATE',
      resource: 'ai-provider',
      resourceId: cfg.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return serialize(cfg);
  });

  // ── PUT /ai-providers/:id/fallback ─────────────────────────────────────────
  app.put('/ai-providers/:id/fallback', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await app.prisma.aIProviderConfig.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!existing) throw new NotFoundError('AIProviderConfig', id);

    // Unset fallback on all others
    await app.prisma.aIProviderConfig.updateMany({
      where: { organizationId: request.organizationId, isFallback: true },
      data: { isFallback: false },
    });

    const cfg = await app.prisma.aIProviderConfig.update({
      where: { id },
      data: { isFallback: true },
    });

    void writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'UPDATE',
      resource: 'ai-provider',
      resourceId: cfg.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return serialize(cfg);
  });

  // ── POST /ai-providers/:id/test ────────────────────────────────────────────
  app.post('/ai-providers/:id/test', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await app.prisma.aIProviderConfig.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!existing) throw new NotFoundError('AIProviderConfig', id);

    // Build a ProviderConfig from the DB row
    const providerName = existing.provider as 'nvidia-nim' | 'openrouter' | 'ollama';
    let config: any;
    if (providerName === 'nvidia-nim') {
      config = { activeProvider: 'nvidia-nim', nvidiaNim: { apiKey: existing.apiKey ?? '', baseUrl: existing.baseUrl ?? undefined, defaultModel: existing.model } };
    } else if (providerName === 'openrouter') {
      config = { activeProvider: 'openrouter', openrouter: { apiKey: existing.apiKey ?? '', baseUrl: existing.baseUrl ?? undefined, defaultModel: existing.model } };
    } else {
      config = { activeProvider: 'ollama', ollama: { baseUrl: existing.baseUrl ?? undefined, defaultModel: existing.model } };
    }

    try {
      const provider = createProvider(config);
      const health = await provider.healthCheck();
      const status = health.healthy ? 'ok' : 'fail';

      await app.prisma.aIProviderConfig.update({
        where: { id },
        data: { lastStatus: status, lastCheckedAt: new Date() },
      });

      return {
        status,
        provider: providerName,
        model: existing.model,
        message: health.healthy ? 'Connection successful' : (health.error ?? 'Connection failed'),
      };
    } catch (err) {
      await app.prisma.aIProviderConfig.update({
        where: { id },
        data: { lastStatus: 'fail', lastCheckedAt: new Date() },
      });

      return {
        status: 'fail',
        provider: providerName,
        model: existing.model,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  });
};

export default aiProviderRoutes;
