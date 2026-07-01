// ============================================================================
//  Avesia AI Core — Context Builder
//
//  Assembles retrieved chunks into a grounded prompt context for generation.
//  Deduplicates, orders by relevance, prepends heading breadcrumbs, and
//  respects a token budget so the final prompt never overflows the model.
// ============================================================================

import type { SearchResult } from '../types.js';

export interface BuildContextOptions {
  readonly maxTokens?: number;
  /** Rough chars-per-token estimate (default 4). */
  readonly charsPerToken?: number;
}

export interface BuiltContext {
  readonly text: string;
  readonly chunkCount: number;
  readonly estimatedTokens: number;
}

export function buildContext(results: readonly SearchResult[], options?: BuildContextOptions): BuiltContext {
  if (results.length === 0) {
    return { text: '', chunkCount: 0, estimatedTokens: 0 };
  }

  const maxTokens = options?.maxTokens ?? 2000;
  const charsPerToken = options?.charsPerToken ?? 4;
  const maxChars = Math.floor(maxTokens * charsPerToken);

  const seen = new Set<string>();
  const parts: string[] = [];
  let totalChars = 0;
  let count = 0;

  for (const result of results) {
    if (seen.has(result.chunkId)) continue;
    seen.add(result.chunkId);

    const heading = result.metadata?.headingPath;
    const breadcrumb = heading && heading.length > 0 ? `[${heading.join(' > ')}]\n` : '';
    const snippet = `${breadcrumb}[Relevância: ${(result.score * 100).toFixed(0)}%]\n${result.content}`;

    if (totalChars + snippet.length > maxChars) break;

    parts.push(snippet);
    totalChars += snippet.length;
    count += 1;
  }

  const text = parts.join('\n\n---\n\n');
  return {
    text,
    chunkCount: count,
    estimatedTokens: Math.ceil(totalChars / charsPerToken),
  };
}
