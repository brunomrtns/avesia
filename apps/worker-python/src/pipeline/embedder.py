"""Embedder — generates embeddings via AI provider REST API."""

from .chunker import TextChunk


class Embedder:
    """Generates embeddings for text chunks."""

    def __init__(self, ai_client):
        self._ai = ai_client

    def embed_chunks(self, chunks: list[TextChunk], *, on_progress=None) -> None:
        """Generate embeddings for each chunk (mutates chunks in place)."""
        total = len(chunks)
        for i, chunk in enumerate(chunks):
            # Prepend heading path for better retrieval context
            prefix = ""
            if chunk.heading_path:
                prefix = " > ".join(chunk.heading_path) + "\n"

            result = self._ai.embed(prefix + chunk.content, input_type="passage")
            chunk.embedding = result.embedding

            if on_progress:
                on_progress(i + 1, total)

    def embed_query(self, query: str) -> list[float]:
        """Generate embedding for a search query."""
        result = self._ai.embed(query, input_type="query")
        return result.embedding
