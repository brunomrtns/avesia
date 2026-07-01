/**
 * Minimal SSE (Server-Sent Events) parser for decoding streaming chat
 * completions from OpenAI-compatible APIs.
 *
 * Handles chunked UTF-8 boundaries, \r\n and \n line endings, multi-line
 * data: blocks, and comment lines (starting with ':').
 */

const DATA_PREFIX = 'data:';

/** Strip the `data:` prefix and any leading whitespace from a line. */
function extractData(line: string): string | null {
  const trimmed = line.trimStart();
  if (trimmed.toLowerCase().startsWith(DATA_PREFIX)) {
    return trimmed.slice(DATA_PREFIX.length).trimStart();
  }
  // Some servers emit `data:` without a space, or just `data`
  if (trimmed.toLowerCase() === 'data') {
    return '';
  }
  return null;
}

/**
 * Parse a `ReadableStream<Uint8Array>` of SSE data into individual event
 * data payloads.
 *
 * Each yielded string is the concatenated `data:` content of one SSE event.
 * The `[DONE]` sentinel is yielded as-is — the caller decides whether to act
 * on it.
 *
 * @yields Raw data payload strings, one per SSE event.
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dataLines: string[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any remaining buffered event
        if (dataLines.length > 0) {
          yield dataLines.join('\n');
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split into lines and process
      let newlineIndex: number;
      while ((newlineIndex = findEventBoundary(buffer)) !== -1) {
        const rawEvent = buffer.slice(0, newlineIndex);
        // Skip past the boundary (\n, \r\n, \n\n, or \r\n\r\n)
        buffer = buffer.slice(newlineIndex).replace(/^(\r?\n){1,2}/, '');

        const lines = rawEvent.split(/\r?\n/);
        let hasData = false;
        dataLines.length = 0;

        for (const line of lines) {
          // Skip empty lines
          if (line === '') continue;
          // Skip comment lines
          if (line.startsWith(':')) continue;

          const data = extractData(line);
          if (data !== null) {
            dataLines.push(data);
            hasData = true;
          }
        }

        if (hasData && dataLines.length > 0) {
          yield dataLines.join('\n');
          dataLines.length = 0;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Find the index of the next SSE event boundary in the buffer.
 * Boundaries are `\n\n` or `\r\n\r\n`. Returns -1 if none found.
 */
function findEventBoundary(buffer: string): number {
  // Look for double newline (with optional \r)
  const crlf2 = buffer.indexOf('\r\n\r\n');
  const lf2 = buffer.indexOf('\n\n');

  if (crlf2 === -1) return lf2;
  if (lf2 === -1) return crlf2;
  return Math.min(crlf2, lf2);
}
