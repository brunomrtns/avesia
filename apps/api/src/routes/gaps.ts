import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { AvesiaAICore } from '@avesia/ai-providers';
import { AvesiaAICoreFacade } from '@avesia/ai-core';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';
import { loadProviderConfigForOrg } from '../lib/org-ai-config.js';

const gapRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /gap-analysis ─────────────────────────────────────────────────
  // Compares KB concepts against topics discussed in sessions to identify
  // knowledge that exists in the clinic's KB but is not being addressed in
  // clinical practice.
  app.get('/gap-analysis', async (request: FastifyRequest, _reply) => {
    const orgId = request.organizationId;

    // 1. Get all KnowledgeBases for the org
    const knowledgeBases = await app.prisma.knowledgeBase.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    const kbIds = knowledgeBases.map((kb) => kb.id);

    if (kbIds.length === 0) {
      return {
        coveredConcepts: [],
        uncoveredConcepts: [],
        coveragePercent: 0,
      };
    }

    // 2. Get all KnowledgeConcepts for the org's KBs
    const concepts = await app.prisma.knowledgeConcept.findMany({
      where: { knowledgeBaseId: { in: kbIds } },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
    });

    if (concepts.length === 0) {
      return {
        coveredConcepts: [],
        uncoveredConcepts: [],
        coveragePercent: 0,
      };
    }

    // 3. Get all AIAnalysis of type TOPICS/KEYWORDS/INSIGHTS for the org's sessions
    const analyses = await app.prisma.aIAnalysis.findMany({
      where: {
        organizationId: orgId,
        type: { in: ['TOPICS', 'KEYWORDS', 'INSIGHTS'] },
        status: 'COMPLETED',
      },
      select: {
        type: true,
        output: true,
      },
    });

    // Build a text summary of what has been discussed in sessions.
    const discussedTopics: string[] = [];
    for (const analysis of analyses) {
      const output = analysis.output as Record<string, unknown> | null;
      if (!output) continue;
      // AIAnalysis.output is a Json field — attempt to extract text-like values.
      const extractText = (value: unknown): string[] => {
        if (typeof value === 'string') return [value];
        if (Array.isArray(value)) {
          return value.flatMap((v) => extractText(v));
        }
        if (value && typeof value === 'object') {
          return Object.values(value).flatMap((v) => extractText(v));
        }
        return [];
      };
      discussedTopics.push(...extractText(output));
    }

    const discussedText = discussedTopics.join('\n');

    // If there are no session analyses, all concepts are uncovered.
    if (!discussedText.trim()) {
      const uncovered = concepts.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        description: c.description ?? '',
      }));
      return {
        coveredConcepts: [],
        uncoveredConcepts: uncovered,
        coveragePercent: 0,
      };
    }

    // 4. Use LLM to identify which KB concepts are NOT being addressed.
    const conceptList = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      description: c.description ?? '',
    }));

    const prompt = `Você é um assistente que analisa a cobertura de conhecimento clínico.
Abaixo está a lista de conceitos da base de conhecimento de uma clínica e um resumo dos tópicos discutidos nas sessões clínicas realizadas.

Sua tarefa é identificar quais conceitos da base de conhecimento NÃO estão sendo abordados nas sessões (lacunas de conhecimento).

Retorne a resposta EXCLUSIVAMENTE em formato JSON puro (sem markdown), com esta estrutura:
{
  "covered": ["id1", "id2"],
  "uncovered": ["id3", "id4"]
}

Conceitos da base de conhecimento:
${JSON.stringify(conceptList, null, 2)}

Tópicos discutidos nas sessões:
${discussedText.slice(0, 8000)}`;

    const providerConfig = await loadProviderConfigForOrg(app.prisma, orgId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    const result = await aiCore.chat(
      [
        { role: 'system', content: 'Você é um assistente de análise de cobertura de conhecimento clínico. Responda apenas em JSON.' },
        { role: 'user', content: prompt },
      ],
      { capability: 'complex', temperature: 0.2 },
    );

    let coveredIds: string[] = [];
    let uncoveredIds: string[] = [];
    try {
      const clean = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean) as { covered?: string[]; uncovered?: string[] };
      coveredIds = Array.isArray(parsed.covered) ? parsed.covered : [];
      uncoveredIds = Array.isArray(parsed.uncovered) ? parsed.uncovered : [];
    } catch {
      // Fallback: mark all as uncovered if LLM output is unparseable.
      uncoveredIds = concepts.map((c) => c.id);
    }

    const coveredSet = new Set(coveredIds);
    const uncoveredSet = new Set(uncoveredIds);

    const coveredConcepts = concepts
      .filter((c) => coveredSet.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }));

    const uncoveredConcepts = concepts
      .filter((c) => uncoveredSet.has(c.id) || (!coveredSet.has(c.id) && !uncoveredSet.has(c.id)))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        description: c.description ?? '',
      }));

    const coveragePercent =
      concepts.length > 0
        ? Math.round((coveredConcepts.length / concepts.length) * 100)
        : 0;

    return {
      coveredConcepts,
      uncoveredConcepts,
      coveragePercent,
    };
  });
};

export default gapRoutes;
