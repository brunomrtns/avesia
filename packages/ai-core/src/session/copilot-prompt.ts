// ============================================================================
//  Avesia AI Core — Copilot Prompt Builder
//
//  Builds the system + user prompts for each copilot processing cycle.
//  The prompt is designed for:
//  - Incremental processing: only new segments + memory (not full transcript)
//  - Structured JSON output: assistance items + memory update
//  - Safety: confidence levels, fact vs. hypothesis distinction, no invention
//  - KB grounding: retrieved context is woven into the prompt
//  - Markdown: items use markdown for rich rendering
// ============================================================================

import type {
  SegmentInput,
  SessionMemory,
  CopilotSettings,
  AssistanceType,
  Confidence,
} from './types.js';
import type { IntensityThresholds } from './trigger-detector.js';

/** Build the system prompt for the continuous copilot. */
export function buildCopilotSystemPrompt(
  settings: CopilotSettings,
  config: IntensityThresholds,
  hasKbContext: boolean,
): string {
  const maxItems = config.maxItems;

  return `Você é um co-piloto clínico em tempo real, atuando como um especialista experiente sentado ao lado do profissional durante a consulta.

## Sua função
Você acompanha a sessão continuamente, processa novas falas e produz assistência clínica estruturada. Você NÃO substitui o profissional — você auxilia.

## Princípios de segurança (OBRIGATÓRIOS)
1. **Nunca afirme algo como verdade absoluta.** Use níveis de confiança: high, medium, low.
2. **Distinga fatos observados de hipóteses.** Hipóteses são sempre tentativas.
3. **Se não houver contexto suficiente, diga explicitamente.** Nunca invente informações.
4. **Nunca invente referências.** Só cite documentos que aparecem no contexto fornecido.
5. **LGPD:** não repita dados identificáveis do paciente.

## Formato de saída (JSON estrito)
Retorne APENAS JSON válido (sem markdown, sem comentários) com esta estrutura:
\`\`\`json
{
  "items": [
    {
      "type": "insight" | "hypothesis" | "question" | "attention" | "connection",
      "content": "texto em markdown (conciso, máx 2-3 frases)",
      "confidence": "high" | "medium" | "low",
      "sourceConcepts": ["nome do conceito da KB"],
      "sourceDocuments": ["título do documento da KB"]
    }
  ],
  "memoryUpdate": {
    "newThemes": ["tema identificado"],
    "newSymptoms": ["sintoma observado"],
    "newHypotheses": [
      { "description": "hipótese", "confidence": "medium", "status": "open" }
    ],
    "newOpenQuestions": ["pergunta em aberto"],
    "resolvedQuestions": ["pergunta que foi respondida"],
    "newUsedConcepts": ["conceito do grafo utilizado"],
    "newRelevantDocs": [
      { "documentId": "id", "heading": "título", "score": 0.85 }
    ]
  },
  "sufficientContext": true,
  "contextNote": null
}
\`\`\`

## Tipos de assistência
- **insight**: raciocínio clínico sobre o que está sendo dito (não resumo).
- **hypothesis**: hipótese clínica (SEMPRE como tentativa, nunca diagnóstico).
- **question**: pergunta sugerida para o profissional investigar.
- **attention**: ponto de atenção — risco, inconsistência, lacuna, mudança.
- **connection**: conexão com protocolo/documento da base de conhecimento da clínica.

## Diretrizes
- Produza no máximo ${maxItems} itens por ciclo.
- Seja conciso: cada item deve ter no máximo 2-3 frases.
- Use markdown nos itens: **negrito** para termos-chave, *itálico* para nuances.
- Priorize ${settings.intensity === 'high' ? 'proatividade e detalhe' : settings.intensity === 'low' ? 'conservadorismo e apenas o mais relevante' : 'equilíbrio entre proatividade e concisão'}.
${hasKbContext ? '- **Sempre que possível**, conecte a conversa ao conhecimento da clínica (type: "connection"). Cite o documento fonte.' : '- Não há base de conhecimento disponível. Foque na análise do transcript.'}
- Se o contexto for insuficiente para uma análise útil, retorne "sufficientContext": false e explique em "contextNote".
- Atualize a memória incrementalmente: adicione apenas NOVOS temas, sintomas, hipóteses, perguntas.`;
}

/** Build the user prompt with memory + new segments + KB context. */
export function buildCopilotUserPrompt(
  memory: SessionMemory,
  newSegments: readonly SegmentInput[],
  kbContext: string | null,
  allSegmentsCount: number,
): string {
  const parts: string[] = [];

  // ── Memory section ──────────────────────────────────────────────────
  if (memory.lastProcessedSeq > 0) {
    parts.push('## Memória acumulada da sessão');
    parts.push('');
    if (memory.contextSummary) {
      parts.push(`**Contexto:** ${memory.contextSummary}`);
    }
    if (memory.themes.length > 0) {
      parts.push(`**Temas:** ${memory.themes.join(', ')}`);
    }
    if (memory.symptoms.length > 0) {
      parts.push(`**Sintomas:** ${memory.symptoms.join(', ')}`);
    }
    if (memory.hypotheses.length > 0) {
      parts.push(`**Hipóteses:**`);
      for (const h of memory.hypotheses) {
        parts.push(`  - ${h.description} (confiança: ${h.confidence}, status: ${h.status})`);
      }
    }
    if (memory.openQuestions.length > 0) {
      parts.push(`**Perguntas em aberto:**`);
      for (const q of memory.openQuestions) {
        parts.push(`  - ${q}`);
      }
    }
    parts.push('');
  }

  // ── New segments ────────────────────────────────────────────────────
  parts.push('## Novas falas desde a última análise');
  parts.push('');
  for (const seg of newSegments) {
    const speaker = seg.speaker === 'THERAPIST' ? 'Psicólogo' : seg.speaker === 'PATIENT' ? 'Paciente' : 'Indefinido';
    parts.push(`[${speaker}]: ${seg.text}`);
  }
  parts.push('');

  // ── KB context ──────────────────────────────────────────────────────
  if (kbContext && kbContext.trim()) {
    parts.push('## Contexto da base de conhecimento da clínica');
    parts.push('Use estas informações para fundamentar sua análise. Cite as fontes quando relevante.');
    parts.push('');
    parts.push(kbContext);
    parts.push('');
  }

  // ── Instruction ─────────────────────────────────────────────────────
  parts.push('## Instruução');
  parts.push(`Total de segmentos na sessão: ${allSegmentsCount}.`);
  parts.push('Analise as novas falas acima considerando a memória acumulada e o contexto da base de conhecimento.');
  parts.push('Produza assistência clínica estruturada e atualize a memória.');
  parts.push('Retorne APENAS JSON válido.');

  return parts.join('\n');
}

/** Parse the LLM response into a CopilotAssistance object. */
export function parseCopilotResponse(raw: string): CopilotParsedResponse {
  // Strip markdown fences if present.
  let clean = raw.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  const parsed = JSON.parse(clean) as Record<string, unknown>;
  const memUpdate = (parsed.memoryUpdate ?? {}) as Record<string, unknown>;

  const items = ((parsed.items ?? []) as Array<Record<string, unknown>>).map((item) => {
    const obj: {
      type: AssistanceType;
      content: string;
      confidence: Confidence;
      sourceConcepts?: string[];
      sourceDocuments?: string[];
    } = {
      type: (item.type as AssistanceType) ?? 'insight',
      content: String(item.content ?? ''),
      confidence: (item.confidence as Confidence) ?? 'medium',
    };
    if (Array.isArray(item.sourceConcepts)) obj.sourceConcepts = item.sourceConcepts as string[];
    if (Array.isArray(item.sourceDocuments)) obj.sourceDocuments = item.sourceDocuments as string[];
    return obj;
  });

  const memoryUpdate: MutableMemoryUpdate = {};
  if (Array.isArray(memUpdate.newThemes)) memoryUpdate.newThemes = memUpdate.newThemes as string[];
  if (Array.isArray(memUpdate.newSymptoms)) memoryUpdate.newSymptoms = memUpdate.newSymptoms as string[];
  if (Array.isArray(memUpdate.newHypotheses)) {
    memoryUpdate.newHypotheses = (memUpdate.newHypotheses as Array<Record<string, unknown>>).map((h) => ({
      description: String(h.description ?? ''),
      confidence: (h.confidence as Confidence) ?? 'medium',
      status: (h.status as 'open' | 'refined' | 'discarded') ?? 'open',
    }));
  }
  if (Array.isArray(memUpdate.newOpenQuestions)) memoryUpdate.newOpenQuestions = memUpdate.newOpenQuestions as string[];
  if (Array.isArray(memUpdate.resolvedQuestions)) memoryUpdate.resolvedQuestions = memUpdate.resolvedQuestions as string[];
  if (Array.isArray(memUpdate.newUsedConcepts)) memoryUpdate.newUsedConcepts = memUpdate.newUsedConcepts as string[];
  if (Array.isArray(memUpdate.newRelevantDocs)) {
    memoryUpdate.newRelevantDocs = (memUpdate.newRelevantDocs as Array<Record<string, unknown>>).map((d) => ({
      documentId: String(d.documentId ?? ''),
      heading: String(d.heading ?? ''),
      score: Number(d.score ?? 0),
    }));
  }

  const result: MutableParsedResponse = {
    items,
    memoryUpdate,
    sufficientContext: parsed.sufficientContext !== false,
  };
  if (parsed.contextNote) result.contextNote = String(parsed.contextNote);
  return result;
}

type MutableMemoryUpdate = {
  newThemes?: string[];
  newSymptoms?: string[];
  newHypotheses?: Array<{ description: string; confidence: Confidence; status: 'open' | 'refined' | 'discarded' }>;
  newOpenQuestions?: string[];
  resolvedQuestions?: string[];
  newUsedConcepts?: string[];
  newRelevantDocs?: Array<{ documentId: string; heading: string; score: number }>;
};

type MutableParsedResponse = {
  items: CopilotParsedResponse['items'];
  memoryUpdate: MutableMemoryUpdate;
  sufficientContext: boolean;
  contextNote?: string;
};

export interface CopilotParsedResponse {
  readonly items: ReadonlyArray<{
    readonly type: AssistanceType;
    readonly content: string;
    readonly confidence: Confidence;
    readonly sourceConcepts?: string[];
    readonly sourceDocuments?: string[];
  }>;
  readonly memoryUpdate: {
    readonly newThemes?: string[];
    readonly newSymptoms?: string[];
    readonly newHypotheses?: Array<{ description: string; confidence: Confidence; status: 'open' | 'refined' | 'discarded' }>;
    readonly newOpenQuestions?: string[];
    readonly resolvedQuestions?: string[];
    readonly newUsedConcepts?: string[];
    readonly newRelevantDocs?: Array<{ documentId: string; heading: string; score: number }>;
  };
  readonly sufficientContext: boolean;
  readonly contextNote?: string;
}
