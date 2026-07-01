import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { NotFoundError, QUEUE_NAMES } from '@avesia/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';
import { uploadFile } from '../lib/storage.js';
import { enqueueCeleryTask } from '../lib/celery-bridge.js';
import {
  AvesiaAICore,
  loadProviderConfigFromEnv,
} from '@avesia/ai-providers';
import {
  AvesiaAICoreFacade,
  RAGOrchestrator,
} from '@avesia/ai-core';

const knowledgeBaseRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /knowledge-bases ────────────────────────────────────────────
  app.get('/knowledge-bases', async (request: FastifyRequest, _reply) => {
    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
      deletedAt: null,
    };

    if (request.role === 'PROFESSIONAL') {
      where['type'] = 'PROFESSIONAL';
      where['professionalId'] = request.userId;
    }

    const items = await app.prisma.knowledgeBase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { documents: true, topics: true, concepts: true } },
      },
    });

    return { items };
  });

  // ── POST /knowledge-bases ───────────────────────────────────────────
  app.post(
    '/knowledge-bases',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const body = request.body as {
        name: string;
        description?: string;
        type?: string;
      };

      const kb = await app.prisma.knowledgeBase.create({
        data: {
          organizationId: request.organizationId,
          professionalId: request.role === 'PROFESSIONAL' ? request.userId : null,
          type: body.type ?? (request.role === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'ORG'),
          name: body.name,
          description: body.description ?? null,
        },
        include: {
          _count: { select: { documents: true, topics: true, concepts: true } },
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'knowledge-base',
        resourceId: kb.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(kb);
    },
  );

  // ── GET /knowledge-bases/:id ────────────────────────────────────────
  app.get('/knowledge-bases/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const kb = await app.prisma.knowledgeBase.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        topics: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { documents: true } } },
        },
        concepts: {
          orderBy: { sourceCount: 'desc' },
        },
        _count: { select: { documents: true, topics: true, concepts: true, relations: true } },
      },
    });

    if (!kb) throw new NotFoundError('KnowledgeBase', id);
    return kb;
  });

  // ── GET /knowledge-bases/:id/graph ──────────────────────────────────
  app.get('/knowledge-bases/:id/graph', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const kb = await app.prisma.knowledgeBase.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!kb) throw new NotFoundError('KnowledgeBase', id);

    const [topics, concepts, documents, relations] = await Promise.all([
      app.prisma.knowledgeTopic.findMany({
        where: { knowledgeBaseId: id },
        select: { id: true, name: true, path: true, parentId: true },
      }),
      app.prisma.knowledgeConcept.findMany({
        where: { knowledgeBaseId: id },
        select: { id: true, name: true, type: true, sourceCount: true, community: true, description: true, sourceDocumentId: true, sourceChunkIndex: true },
      }),
      app.prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId: id, status: 'COMPLETED' },
        select: { id: true, originalFileName: true, fileType: true, summary: true, keywords: true, themes: true, categories: true, createdAt: true },
      }),
      app.prisma.knowledgeRelation.findMany({
        where: { knowledgeBaseId: id },
        select: { id: true, sourceType: true, sourceId: true, targetType: true, targetId: true, relationType: true, strength: true, sourceDocumentId: true },
      }),
    ]);

    const nodes: Array<{
      id: string; type: string; label: string; group: string;
      parentId?: string | null; path?: string;
      sourceCount?: number; fileType?: string;
      community?: number | null; description?: string | null;
      categories?: unknown; summary?: string | null;
      sourceDocumentId?: string | null; sourceChunkIndex?: number | null;
    }> = [
      ...topics.map((t: { id: string; name: string; path: string; parentId: string | null }) => ({
        id: t.id,
        type: 'topic',
        label: t.name,
        group: 'topic',
        parentId: t.parentId,
        path: t.path,
      })),
      ...concepts.map((c: { id: string; name: string; type: string; sourceCount: number; community: number | null; description: string | null; sourceDocumentId: string | null; sourceChunkIndex: number | null }) => ({
        id: c.id,
        type: 'concept',
        label: c.name,
        group: c.type,
        sourceCount: c.sourceCount,
        community: c.community,
        description: c.description,
        sourceDocumentId: c.sourceDocumentId,
        sourceChunkIndex: c.sourceChunkIndex,
      })),
      ...documents.map((d: { id: string; originalFileName: string; fileType: string; summary: string | null; categories: unknown }) => ({
        id: d.id,
        type: 'document',
        label: d.originalFileName,
        group: 'document',
        fileType: d.fileType,
        summary: d.summary,
        categories: d.categories,
      })),
    ];

    const edges: Array<{
      id: string; source: string; target: string;
      sourceType: string; targetType: string;
      type: string; strength: number;
      sourceDocumentId?: string | null;
    }> = relations.map((r: { id: string; sourceId: string; targetId: string; sourceType: string; targetType: string; relationType: string; strength: number; sourceDocumentId: string | null }) => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      sourceType: r.sourceType,
      targetType: r.targetType,
      type: r.relationType,
      strength: r.strength,
      sourceDocumentId: r.sourceDocumentId,
    }));

    return { nodes, edges };
  });

  // ── PATCH /knowledge-bases/:id ──────────────────────────────────────
  app.patch(
    '/knowledge-bases/:id',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; description?: string };

      const existing = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('KnowledgeBase', id);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data['name'] = body.name;
      if (body.description !== undefined) data['description'] = body.description;

      const kb = await app.prisma.knowledgeBase.update({ where: { id }, data });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'knowledge-base',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return kb;
    },
  );

  // ── DELETE /knowledge-bases/:id ─────────────────────────────────────
  app.delete(
    '/knowledge-bases/:id',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      const existing = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });
      if (!existing) throw new NotFoundError('KnowledgeBase', id);

      await app.prisma.knowledgeBase.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'knowledge-base',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );

  // ── DELETE /knowledge-bases/:id/documents/:docId ──────────────────────
  // Deletes a document AND cleans up its graph contributions:
  //   - removes the file from MinIO
  //   - deletes AIContextDocument + chunks (cascade)
  //   - deletes the KnowledgeDocument
  //   - decrements source_count on concepts; removes concepts that hit 0
  //   - removes relations referencing removed concepts
  //   - removes MENTIONS relations from this document to any concept
  app.delete(
    '/knowledge-bases/:id/documents/:docId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { id, docId } = request.params as { id: string; docId: string };

      const kb = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });
      if (!kb) throw new NotFoundError('KnowledgeBase', id);

      const doc = await app.prisma.knowledgeDocument.findFirst({
        where: { id: docId, knowledgeBaseId: id },
      });
      if (!doc) throw new NotFoundError('KnowledgeDocument', docId);

      // 1. Delete file from MinIO
      if (doc.storageKey) {
        try {
          const { deleteFile } = await import('../lib/storage.js');
          await deleteFile(doc.storageKey);
        } catch {
          // file may already be gone — not critical
        }
      }

      // 2. Find concepts this document contributed to (via MENTIONS relations)
      //    so we can decrement their source_count and remove orphans.
      const mentionsRelations = await app.prisma.knowledgeRelation.findMany({
        where: {
          knowledgeBaseId: id,
          sourceType: 'DOCUMENT',
          sourceId: docId,
          targetType: 'CONCEPT',
        },
        select: { targetId: true },
      });
      const contributedConceptIds = mentionsRelations.map((r) => r.targetId);

      // 3. Delete MENTIONS relations from this document
      await app.prisma.knowledgeRelation.deleteMany({
        where: {
          knowledgeBaseId: id,
          sourceType: 'DOCUMENT',
          sourceId: docId,
        },
      });

      // 4. Delete AIContextDocument + chunks (cascade deletes chunks)
      if (doc.contextDocumentId) {
        await app.prisma.aIContextDocument.delete({
          where: { id: doc.contextDocumentId },
        }).catch(() => {
          // may already be deleted
        });
      }

      // 5. Delete the document itself
      await app.prisma.knowledgeDocument.delete({ where: { id: docId } });

      // 6. Decrement source_count on contributed concepts; remove orphans
      const toRemove: string[] = [];
      for (const conceptId of contributedConceptIds) {
        const concept = await app.prisma.knowledgeConcept.findUnique({
          where: { id: conceptId },
        });
        if (!concept) continue;
        const newCount = (concept.sourceCount ?? 0) - 1;
        if (newCount <= 0) {
          toRemove.push(concept.id);
        } else {
          await app.prisma.knowledgeConcept.update({
            where: { id: concept.id },
            data: { sourceCount: newCount },
          });
        }
      }

      // 7. Delete relations and concepts that are now orphaned
      if (toRemove.length > 0) {
        await app.prisma.knowledgeRelation.deleteMany({
          where: {
            knowledgeBaseId: id,
            OR: [
              { sourceId: { in: toRemove } },
              { targetId: { in: toRemove } },
            ],
          },
        });
        await app.prisma.knowledgeConcept.deleteMany({
          where: { id: { in: toRemove } },
        });
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'knowledge-document',
        resourceId: docId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );

  // ── GET /knowledge-bases/:id/documents/:docId/markdown ───────────────
  // Returns the Markdown version of a document (converted from PDF/DOCX/TXT
  // on import). Used by the UI to show the exact passage a concept came from.
  app.get(
    '/knowledge-bases/:id/documents/:docId/markdown',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'read' })] },
    async (request: FastifyRequest, reply) => {
      const { id, docId } = request.params as { id: string; docId: string };

      const doc = await app.prisma.knowledgeDocument.findFirst({
        where: { id: docId, knowledgeBaseId: id },
        select: { markdownStorageKey: true },
      });
      if (!doc) throw new NotFoundError('KnowledgeDocument', docId);
      if (!doc.markdownStorageKey) {
        return reply.status(404).send({ error: 'Markdown not yet generated' });
      }

      try {
        const { getFileBuffer } = await import('../lib/storage.js');
        const buffer = await getFileBuffer(doc.markdownStorageKey);
        return reply.type('text/markdown; charset=utf-8').send(buffer.toString('utf-8'));
      } catch {
        return reply.status(404).send({ error: 'Markdown file not found in storage' });
      }
    },
  );

  // ── GET /knowledge-bases/:id/documents/:docId/chunks ─────────────────
  // Returns the structured JSON chunks of a document. Each chunk has:
  // {index, content, section, heading_path, char_start, char_end}
  // The UI uses this to show the exact passage a graph node points to
  // (concept.sourceChunkIndex → chunks[sourceChunkIndex].content).
  app.get(
    '/knowledge-bases/:id/documents/:docId/chunks',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'read' })] },
    async (request: FastifyRequest, reply) => {
      const { id, docId } = request.params as { id: string; docId: string };

      const doc = await app.prisma.knowledgeDocument.findFirst({
        where: { id: docId, knowledgeBaseId: id },
        select: { chunksStorageKey: true },
      });
      if (!doc) throw new NotFoundError('KnowledgeDocument', docId);
      if (!doc.chunksStorageKey) {
        return reply.status(404).send({ error: 'Chunks not yet generated' });
      }

      try {
        const { getFileBuffer } = await import('../lib/storage.js');
        const buffer = await getFileBuffer(doc.chunksStorageKey);
        return reply.type('application/json; charset=utf-8').send(buffer.toString('utf-8'));
      } catch {
        return reply.status(404).send({ error: 'Chunks file not found in storage' });
      }
    },
  );

  // ── POST /knowledge-bases/:id/upload ────────────────────────────────
  app.post(
    '/knowledge-bases/:id/upload',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      const kb = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });
      if (!kb) throw new NotFoundError('KnowledgeBase', id);

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: 'Nenhum arquivo enviado.' });
      }

      const ext = data.filename.split('.').pop()?.toLowerCase() ?? 'txt';
      const allowedExts = ['pdf', 'docx', 'txt', 'md'];
      if (!allowedExts.includes(ext)) {
        return reply.status(400).send({
          message: `Formato .${ext} não suportado. Use: ${allowedExts.join(', ')}`,
        });
      }

      const buffer = await data.toBuffer();
      const fileSize = buffer.length;
      const storageKey = `knowledge-bases/${id}/${crypto.randomUUID()}.${ext}`;

      const contentType = data.mimetype || 'application/octet-stream';
      await uploadFile(storageKey, buffer, contentType);

      // Text extraction now happens inside the worker pipeline (AI Core),
      // so the queue only carries a storage reference — keeping Redis memory
      // bounded regardless of document size.
      const contextDocument = await app.prisma.aIContextDocument.create({
        data: {
          organizationId: request.organizationId,
          fileName: data.filename,
          status: 'PENDING',
          progress: 0,
        },
      });

      const knowledgeDocument = await app.prisma.knowledgeDocument.create({
        data: {
          knowledgeBaseId: id,
          contextDocumentId: contextDocument.id,
          originalFileName: data.filename,
          fileType: ext,
          fileSize,
          storageKey,
          status: 'PENDING',
          progress: 0,
          keywords: [],
          themes: [],
        },
      });

      // Enqueue to Python Celery worker via Redis (Celery-compatible format)
      await enqueueCeleryTask('rag-indexing', QUEUE_NAMES.ragIndexing, {
        knowledge_document_id: knowledgeDocument.id,
        organization_id: request.organizationId,
        storage_key: storageKey,
        file_type: ext,
        file_name: data.filename,
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPLOAD',
        resource: 'knowledge-document',
        resourceId: knowledgeDocument.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(knowledgeDocument);
    },
  );

  // ── PATCH /knowledge-bases/:id/topics/:topicId ──────────────────────
  app.patch(
    '/knowledge-bases/:id/topics/:topicId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { topicId } = request.params as { topicId: string };
      const body = request.body as {
        name?: string;
        description?: string;
        parentId?: string | null;
        sortOrder?: number;
      };

      const existing = await app.prisma.knowledgeTopic.findUnique({
        where: { id: topicId },
      });
      if (!existing) throw new NotFoundError('KnowledgeTopic', topicId);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data['name'] = body.name;
      if (body.description !== undefined) data['description'] = body.description;
      if (body.parentId !== undefined) data['parentId'] = body.parentId;
      if (body.sortOrder !== undefined) data['sortOrder'] = body.sortOrder;

      const topic = await app.prisma.knowledgeTopic.update({
        where: { id: topicId },
        data,
      });

      return topic;
    },
  );

  // ── DELETE /knowledge-bases/:id/topics/:topicId ─────────────────────
  app.delete(
    '/knowledge-bases/:id/topics/:topicId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { topicId } = request.params as { topicId: string };
      await app.prisma.knowledgeTopic.delete({ where: { id: topicId } });
      return reply.status(204).send();
    },
  );

  // ── PATCH /knowledge-bases/:id/concepts/:conceptId ──────────────────
  app.patch(
    '/knowledge-bases/:id/concepts/:conceptId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { conceptId } = request.params as { conceptId: string };
      const body = request.body as {
        name?: string;
        description?: string;
        topicId?: string | null;
      };

      const existing = await app.prisma.knowledgeConcept.findUnique({
        where: { id: conceptId },
      });
      if (!existing) throw new NotFoundError('KnowledgeConcept', conceptId);

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data['name'] = body.name;
      if (body.description !== undefined) data['description'] = body.description;
      if (body.topicId !== undefined) data['topicId'] = body.topicId;

      const concept = await app.prisma.knowledgeConcept.update({
        where: { id: conceptId },
        data,
      });

      return concept;
    },
  );

  // ── DELETE /knowledge-bases/:id/concepts/:conceptId ─────────────────
  app.delete(
    '/knowledge-bases/:id/concepts/:conceptId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { conceptId } = request.params as { conceptId: string };
      await app.prisma.knowledgeConcept.delete({ where: { id: conceptId } });
      return reply.status(204).send();
    },
  );

  // ── POST /knowledge-bases/:id/relations ─────────────────────────────
  app.post(
    '/knowledge-bases/:id/relations',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        sourceType: string;
        sourceId: string;
        targetType: string;
        targetId: string;
        relationType: string;
      };

      const relation = await app.prisma.knowledgeRelation.create({
        data: {
          knowledgeBaseId: id,
          sourceType: body.sourceType,
          sourceId: body.sourceId,
          targetType: body.targetType,
          targetId: body.targetId,
          relationType: body.relationType,
          strength: 1.0,
        },
      });

      return reply.status(201).send(relation);
    },
  );

  // ── DELETE /knowledge-bases/:id/relations/:relationId ───────────────
  app.delete(
    '/knowledge-bases/:id/relations/:relationId',
    { preHandler: [requirePermission({ resource: 'knowledge-base', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { relationId } = request.params as { relationId: string };
      await app.prisma.knowledgeRelation.delete({ where: { id: relationId } });
      return reply.status(204).send();
    },
  );

  // ── POST /knowledge-bases/:id/query ─────────────────────────────────
  // GraphRAG query endpoint: uses the Knowledge Graph to find the shortest
  // path to an answer (community-scoped retrieval → LLM generation).
  // Token-economical: only the relevant cluster's chunks are sent to the LLM.
  app.post(
    '/knowledge-bases/:id/query',
    { preHandler: [requireTenant] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { query: string };
      if (!body?.query || body.query.trim().length === 0) {
        return reply.status(400).send({ error: 'query is required' });
      }

      // Verify the KB belongs to the caller's organization.
      const kb = await app.prisma.knowledgeBase.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!kb) throw new NotFoundError('KnowledgeBase', id);

      // Wire the AI facade + RAG orchestrator (provider-agnostic).
      const providerConfig = loadProviderConfigFromEnv();
      const providerCore = new AvesiaAICore(providerConfig);
      const embeddingModel = process.env.EMBEDDING_MODEL;
      const aiCore = new AvesiaAICoreFacade(providerCore, {
        ...(embeddingModel ? { embedModel: embeddingModel } : {}),
        embedProviderConfig: providerConfig,
      });
      const orchestrator = new RAGOrchestrator(aiCore, app.prisma);

      // Run the full RAG flow: query rewrite → graph retrieve → generate → sources.
      const result = await orchestrator.query(
        request.organizationId,
        body.query,
        {
          knowledgeBaseId: id,
          limit: 6,
          maxTokens: 1500,
          rewriteQuery: true,
          capability: 'complex',
        },
      );

      if (result.sources.length === 0) {
        return {
          answer: 'Não há documentos indexados nesta base de conhecimento para responder a esta pergunta.',
          sources: [],
          conceptIds: [],
          community: null,
          tokensUsed: result.generation.tokensUsed,
        };
      }

      return {
        answer: result.answer,
        sources: result.sources,
        conceptIds: result.conceptIds,
        community: result.community,
        tokensUsed: result.generation.tokensUsed,
      };
    },
  );
};

export default knowledgeBaseRoutes;
