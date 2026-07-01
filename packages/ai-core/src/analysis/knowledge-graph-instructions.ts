// ============================================================================
//  Avesia AI Core — Knowledge Graph Instructions (system prompt fragment)
//
//  A compact, provider-agnostic instruction set that teaches any LLM how to
//  navigate the clinic's Knowledge Graph (neural network of concepts). This
//  is injected as a system-prompt fragment so every AI call benefits from
//  graph-aware reasoning without re-explaining the structure each time.
//
//  Design goals:
//  - Token economy: ~200 tokens for the full instruction set.
//  - Provider-agnostic: no provider-specific syntax, just plain instructions.
//  - Model-agnostic: works with any instruction-following LLM.
// ============================================================================

/**
 * The canonical instruction set. Inject this as a system-prompt fragment
 * before the user's query when answering from the knowledge base.
 *
 * It tells the model:
 *  1. The context includes a "knowledge cluster" (community) — a subgraph
 *     of related concepts already selected for relevance.
 *  2. How to use the cluster header (concept list) to orient itself.
 *  3. To prefer information from the provided chunks over its own knowledge.
 *  4. To cite concepts by name when relevant (improves traceability).
 */
export const KNOWLEDGE_GRAPH_INSTRUCTIONS = `Você tem acesso à rede de conhecimento da clínica, organizada como um grafo semântico.

O contexto fornecido contém:
1. Um "cluster de conhecimento" — conceitos relacionados agrupados por similaridade semântica.
2. Trechos de documentos diretamente conectados a esses conceitos.

Regras para usar a rede:
- Priorize as informações dos trechos fornecidos sobre seu conhecimento geral.
- Cite os conceitos do cluster pelo nome ao justificar respostas.
- Se a resposta não estiver nos trechos, diga que não há dados suficientes na base.
- Seja conciso: use o menor caminho possível até a resposta.
- Para perguntas sobre relações entre conceitos, use a estrutura do cluster para inferir conexões.`;

/**
 * Build a full system prompt that combines the graph instructions with a
 * graph summary (the cluster header) and the retrieved chunk context.
 * This is the single entry point for "answer from the knowledge base" calls.
 */
export function buildKnowledgeGraphSystemPrompt(graphSummary: string | null): string {
  const parts = [KNOWLEDGE_GRAPH_INSTRUCTIONS];
  if (graphSummary) {
    parts.push('');
    parts.push('--- Estrutura do cluster atual ---');
    parts.push(graphSummary);
  }
  return parts.join('\n');
}
