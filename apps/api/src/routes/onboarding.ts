import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';

const onboardingRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /onboarding/suggestions ───────────────────────────────────────
  // Returns onboarding progress + AI-derived suggestions based on KB content.
  app.get('/onboarding/suggestions', async (request: FastifyRequest, _reply) => {
    const orgId = request.organizationId;

    const knowledgeBases = await app.prisma.knowledgeBase.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    const kbIds = knowledgeBases.map((kb) => kb.id);

    const [documents, concepts, topics, patientsCount, sessionsCount] = await Promise.all([
      kbIds.length > 0
        ? app.prisma.knowledgeDocument.findMany({
            where: { knowledgeBaseId: { in: kbIds } },
            select: { id: true, originalFileName: true, status: true, keywords: true, themes: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      kbIds.length > 0
        ? app.prisma.knowledgeConcept.findMany({
            where: { knowledgeBaseId: { in: kbIds } },
            select: { id: true, name: true, type: true, description: true, sourceCount: true },
            orderBy: { sourceCount: 'desc' },
            take: 50,
          })
        : Promise.resolve([]),
      kbIds.length > 0
        ? app.prisma.knowledgeTopic.findMany({
            where: { knowledgeBaseId: { in: kbIds } },
            select: { id: true, name: true, description: true, path: true },
            orderBy: { sortOrder: 'asc' },
          })
        : Promise.resolve([]),
      app.prisma.patient.count({ where: { organizationId: orgId, deletedAt: null } }),
      app.prisma.clinicalSession.count({ where: { organizationId: orgId } }),
    ]);

    const documentCount = documents.length;
    const conceptCount = concepts.length;
    const topicCount = topics.length;

    // Build progress object
    const progress = {
      documentsUploaded: documentCount,
      conceptsExtracted: conceptCount,
      topicsCreated: topicCount,
      sessionsCreated: sessionsCount,
      patientsCreated: patientsCount,
    };

    // Build completed/pending steps
    const completedSteps: string[] = [];
    const pendingSteps: string[] = [];

    if (patientsCount > 0) completedSteps.push('Cadastrar pacientes'); else pendingSteps.push('Cadastrar pacientes');
    if (documentCount > 0) completedSteps.push('Enviar documentos para a base de conhecimento'); else pendingSteps.push('Enviar documentos para a base de conhecimento');
    if (conceptCount > 0) completedSteps.push('Extrair conceitos da base de conhecimento'); else pendingSteps.push('Extrair conceitos da base de conhecimento');
    if (sessionsCount > 0) completedSteps.push('Criar sessões'); else pendingSteps.push('Criar sessões');
    if (sessionsCount > 0 && documentCount > 0) completedSteps.push('Configurar co-piloto clínico'); else pendingSteps.push('Configurar co-piloto clínico');

    // Build suggestions
    const suggestions: Array<{
      type: 'topic' | 'specialty' | 'document' | 'action';
      label: string;
      description?: string | undefined;
      priority: 'high' | 'medium' | 'low';
    }> = [];

    if (documentCount === 0) {
      suggestions.push({
        type: 'document',
        label: 'Envie seu primeiro documento',
        description: 'Adicione PDFs, DOCX ou TXT sobre técnicas, protocolos ou teorias clínicas para construir sua base de conhecimento.',
        priority: 'high',
      });
    }

    if (conceptCount > 0 && conceptCount < 20) {
      suggestions.push({
        type: 'document',
        label: 'Expanda sua base de conhecimento',
        description: `Você tem ${conceptCount} conceitos extraídos. Envie mais documentos para enriquecer o grafo de conhecimento.`,
        priority: 'medium',
      });
    }

    // Suggest top-level topics
    const topLevelTopics = topics
      .filter((t) => !t.path.includes('/', 1))
      .slice(0, 5);

    for (const t of topLevelTopics) {
      suggestions.push({
        type: 'topic',
        label: `Tópico detectado: ${t.name}`,
        description: t.description ?? undefined,
        priority: 'low',
      });
    }

    // Suggest specialties based on disorder concepts
    const disorders = concepts
      .filter((c) => c.type === 'DISORDER')
      .slice(0, 5);

    for (const c of disorders) {
      suggestions.push({
        type: 'specialty',
        label: `Especialidade sugerida: ${c.name}`,
        description: c.description ?? undefined,
        priority: 'medium',
      });
    }

    // Suggest techniques
    const techniques = concepts
      .filter((c) => c.type === 'TECHNIQUE' || c.type === 'METHOD')
      .slice(0, 5);

    for (const c of techniques) {
      suggestions.push({
        type: 'topic',
        label: `Técnica disponível: ${c.name}`,
        description: c.description ?? undefined,
        priority: 'low',
      });
    }

    if (patientsCount === 0) {
      suggestions.push({
        type: 'action',
        label: 'Cadastre seu primeiro paciente',
        description: 'Comece registrando um paciente para ativar o acompanhamento clínico.',
        priority: 'high',
      });
    }

    if (patientsCount > 0 && sessionsCount === 0) {
      suggestions.push({
        type: 'action',
        label: 'Agende a primeira sessão',
        description: 'Você tem pacientes cadastrados. Crie a primeira sessão para começar a usar o co-piloto clínico.',
        priority: 'high',
      });
    }

    return {
      suggestions,
      progress,
      completedSteps,
      pendingSteps,
    };
  });
};

export default onboardingRoutes;
