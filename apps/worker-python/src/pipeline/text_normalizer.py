"""Text normalization — cleans extracted text before chunking."""

import re


def normalize_text(text: str, *, strip_page_artifacts: bool = True) -> str:
    """Normalize text: fix line endings, remove artifacts, collapse whitespace."""
    # CRLF → LF
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Strip page artifacts (page numbers, headers/footers)
    if strip_page_artifacts:
        # Remove standalone page numbers
        text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)
        # Remove "Page X of Y" patterns
        text = re.sub(r"^\s*P[aá]gina\s+\d+\s*(?:de\s+\d+)?\s*$", "", text, flags=re.MULTILINE | re.IGNORECASE)

    # Remove control characters (keep newlines and tabs)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)

    # Collapse 3+ newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Strip trailing whitespace per line
    lines = [line.rstrip() for line in text.split("\n")]
    text = "\n".join(lines)

    # Collapse multiple spaces
    text = re.sub(r"[ \t]{2,}", " ", text)

    return text.strip()
