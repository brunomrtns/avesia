"""Structure-aware text chunker.

Splits text into chunks at heading boundaries, with sliding window
overlap for oversized sections. Attaches heading path metadata.
"""

import re
from dataclasses import dataclass, field


@dataclass
class TextChunk:
    content: str
    index: int
    token_count: int
    section: str | None = None
    heading_path: list[str] = field(default_factory=list)
    page: int | None = None
    char_start: int = 0
    char_end: int = 0
    embedding: list[float] = field(default_factory=list)


# Heuristics
MARKDOWN_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*$")
HEURISTIC_HEADING = re.compile(r"^[A-ZÀ-Ý0-9][A-Za-zÀ-Ý0-9 \-:&/()]{2,80}$")

# Token estimation: ~4 chars per token for Portuguese
CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def chunk_text(
    text: str,
    *,
    target_tokens: int = 400,
    overlap_tokens: int = 50,
    max_tokens: int = 800,
    min_tokens: int = 40,
) -> list[TextChunk]:
    """Split text into structure-aware chunks."""
    sections = _split_into_sections(text)

    chunks: list[TextChunk] = []
    chunk_index = 0

    for section in sections:
        body = section["body"]
        if not body.strip():
            continue

        section_tokens = estimate_tokens(body)

        if section_tokens <= max_tokens:
            # Section fits in one chunk
            if section_tokens >= min_tokens or len(chunks) == 0:
                chunks.append(_make_chunk(
                    body, section, chunk_index,
                    char_offset=0,
                ))
                chunk_index += 1
        else:
            # Sliding window
            sub_chunks = _sliding_window(
                body, section, chunk_index,
                target_tokens, overlap_tokens, min_tokens,
            )
            chunks.extend(sub_chunks)
            chunk_index = len(chunks)

    return chunks


def _split_into_sections(text: str) -> list[dict]:
    """Split text into sections based on heading detection."""
    sections: list[dict] = []
    current_heading_path: list[str] = []
    current_section: str | None = None
    current_body: list[str] = []

    for line in text.split("\n"):
        md_match = MARKDOWN_HEADING.match(line)
        heuristic_match = HEURISTIC_HEADING.match(line)

        is_heading = False
        heading_level = 0
        heading_text = ""

        if md_match:
            is_heading = True
            heading_level = len(md_match.group(1))
            heading_text = md_match.group(2).strip()
        elif heuristic_match and len(line) < 80 and not line.endswith("."):
            # Heuristic: short all-caps or title-case line without period
            is_heading = True
            heading_level = 2  # Default to level 2 for heuristic
            heading_text = line.strip()

        if is_heading:
            # Flush current section
            if current_body:
                sections.append({
                    "heading_path": list(current_heading_path),
                    "section": current_section,
                    "body": "\n".join(current_body),
                })

            # Update heading path
            while len(current_heading_path) >= heading_level:
                current_heading_path.pop()
            current_heading_path.append(heading_text)
            current_section = heading_text
            current_body = []
        else:
            current_body.append(line)

    # Flush last section
    if current_body:
        sections.append({
            "heading_path": list(current_heading_path),
            "section": current_section,
            "body": "\n".join(current_body),
        })

    return sections


def _make_chunk(body: str, section: dict, index: int, *, char_offset: int) -> TextChunk:
    return TextChunk(
        content=body.strip(),
        index=index,
        token_count=estimate_tokens(body),
        section=section.get("section"),
        heading_path=section.get("heading_path", []),
        char_start=char_offset,
        char_end=char_offset + len(body),
    )


def _sliding_window(
    body: str,
    section: dict,
    start_index: int,
    target_tokens: int,
    overlap_tokens: int,
    min_tokens: int,
) -> list[TextChunk]:
    """Split a large section into overlapping chunks at sentence boundaries."""
    target_chars = target_tokens * CHARS_PER_TOKEN
    overlap_chars = overlap_tokens * CHARS_PER_TOKEN

    sentences = re.split(r"(?<=[.!?])\s+", body)
    chunks: list[TextChunk] = []
    current: list[str] = []
    current_len = 0
    chunk_idx = start_index
    char_offset = 0

    for sentence in sentences:
        s_len = len(sentence)
        if current_len + s_len > target_chars and current:
            # Flush
            text = " ".join(current)
            chunks.append(_make_chunk(text, section, chunk_idx, char_offset=char_offset))
            char_offset += len(text) + 1
            chunk_idx += 1

            # Keep overlap: last few sentences
            overlap: list[str] = []
            overlap_len = 0
            for s in reversed(current):
                if overlap_len + len(s) > overlap_chars:
                    break
                overlap.insert(0, s)
                overlap_len += len(s)
            current = overlap
            current_len = overlap_len

        current.append(sentence)
        current_len += s_len

    # Flush remaining
    if current and estimate_tokens(" ".join(current)) >= min_tokens:
        text = " ".join(current)
        chunks.append(_make_chunk(text, section, chunk_idx, char_offset=char_offset))

    return chunks
