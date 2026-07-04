import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';

const onboardingRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /onboarding/suggestions ───────────────────────────────────────
  // Query the org's KnowledgeBase for top concepts, topics, and documents.
  // Return suggestions for initial setup based on what's in the KB.
  app.get('/onboarding/suggestions', async (request: FastifyRequest, _reply) => {
    const orgId = request.organizationId;

    const knowledgeBases = await app.prisma.knowledgeBase.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    const kbIds = knowledgeBases.map((kb) => kb.id);

    if (kbIds.length === 0) {
      return {
        suggestedTopics: [],
        suggestedSpecialties: [],
        documentCount: 0,
        conceptCount: 0,
        topicCount: 0,
      };
    }

    const [documents, concepts, topics] = await Promise.all([
      app.prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId: { in: kbIds } },
        select: {
          id: true,
          originalFileName: true,
          status: true,
          keywords: true,
          themes: true,
          categories: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.knowledgeConcept.findMany({
        where: { knowledgeBaseId: { in: kbIds } },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          sourceCount: true,
        },
        orderBy: { sourceCount: 'desc' },
        take: 50,
      }),
      app.prisma.knowledgeTopic.findMany({
        where: { knowledgeBaseId: { in: kbIds } },
        select: {
          id: true,
          name: true,
          description: true,
          path: true,
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    // Suggested topics: top-level KB topics (no parent) + concept names.
    const topLevelTopics = topics
      .filter((t) => !t.path.includes('/', 1)) // top-level (path like "/name")
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? '',
      }));

    const suggestedTopics = [
      ...topLevelTopics,
      ...concepts
        .filter((c) => c.type === 'TECHNIQUE' || c.type === 'METHOD')
        .slice(0, 10)
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? '',
        })),
    ];

    // Suggested specialties: derived from disorder/concept types and themes.
    const specialtyTypes = new Set<string>();
    for (const c of concepts) {
      if (c.type === 'DISORDER') specialtyTypes.add(c.name);
    }
    const themeSet = new Set<string>();
    for (const d of documents) {
      for (const theme of d.themes) themeSet.add(theme);
    }
    const suggestedSpecialties = [
      ...Array.from(specialtyTypes),
      ...Array.from(themeSet),
    ].slice(0, 20);

    return {
      suggestedTopics,
      suggestedSpecialties,
      documentCount: documents.length,
      conceptCount: concepts.length,
      topicCount: topics.length,
    };
  });
};

export default onboardingRoutes;
