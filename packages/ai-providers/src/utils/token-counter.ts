/**
 * Rough token estimation for budgeting/limiting.
 * Not suitable for billing — use a proper tokenizer (tiktoken) for that.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
