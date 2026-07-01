"""Text extraction → Markdown conversion.

Every document (PDF, DOCX, TXT, MD) is converted to structured Markdown
on import. This gives the pipeline a single, clean format to work with:
- Headings preserved as # / ## / ###
- Paragraphs separated by blank lines
- Lists preserved with - or 1.
- Page breaks from PDFs removed
- Reference sections detected and marked

The Markdown is stored in MinIO as a .md file alongside the original,
so the AI can always reference the exact passage.
"""

import io
import re
from dataclasses import dataclass


@dataclass
class ExtractedText:
    """Raw text extracted from a file, before Markdown conversion."""
    text: str
    page_count: int


@dataclass
class MarkdownResult:
    """Structured Markdown extracted from a document."""
    markdown: str
    page_count: int


def extract_text(file_bytes: bytes, file_type: str) -> ExtractedText:
    """Extract raw text from a file based on its type."""
    ft = file_type.lower().lstrip(".")
    if ft == "pdf":
        return _extract_from_pdf(file_bytes)
    elif ft == "docx":
        return _extract_from_docx(file_bytes)
    elif ft in ("txt", "md"):
        return _extract_from_txt(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def extract_markdown(file_bytes: bytes, file_type: str) -> MarkdownResult:
    """Extract text from any file type and convert to structured Markdown.

    This is the main entry point for the pipeline's extract stage.
    Every document becomes Markdown regardless of original format.
    """
    ft = file_type.lower().lstrip(".")
    if ft == "pdf":
        raw = _extract_from_pdf(file_bytes)
        md = _pdf_text_to_markdown(raw.text)
        return MarkdownResult(markdown=md, page_count=raw.page_count)
    elif ft == "docx":
        raw = _extract_from_docx(file_bytes)
        md = _docx_text_to_markdown(file_bytes, raw.text)
        return MarkdownResult(markdown=md, page_count=raw.page_count)
    elif ft == "md":
        text = file_bytes.decode("utf-8", errors="replace")
        return MarkdownResult(markdown=text, page_count=1)
    elif ft == "txt":
        text = file_bytes.decode("utf-8", errors="replace")
        md = _plain_text_to_markdown(text)
        return MarkdownResult(markdown=md, page_count=1)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


# ── PDF → Markdown ──────────────────────────────────────────────────────

def _extract_from_pdf(file_bytes: bytes) -> ExtractedText:
    import pdfplumber

    pages_text: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)

    return ExtractedText(text="\n\n".join(pages_text), page_count=len(pages_text))


def _pdf_text_to_markdown(text: str) -> str:
    """Convert raw PDF text to structured Markdown.

    PDFs from academic papers have recognizable patterns:
    - ALL CAPS lines or Title Case lines → headings
    - Numbered sections (1. Introduction, 2. Methods) → ## headings
    - Lines that are just numbers → page numbers (remove)
    - Reference section → marked with --- separator
    """
    lines = text.split("\n")
    output: list[str] = []
    in_references = False

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Skip empty lines (preserve paragraph breaks)
        if not stripped:
            if output and output[-1] != "":
                output.append("")
            continue

        # Skip standalone page numbers
        if re.match(r"^\d{1,4}$", stripped):
            continue

        # Skip "Page X of Y"
        if re.match(r"^P[aá]gina\s+\d+", stripped, re.IGNORECASE):
            continue

        # Detect references section
        if re.match(r"^(References|Referências|Bibliografia|REFERENCES|REFERÊNCIAS)\s*$", stripped):
            in_references = True
            output.append("")
            output.append("---")
            output.append("")
            output.append("# Referências")
            output.append("")
            continue

        # Detect numbered section headings: "1. Introduction" or "2.1. Methods"
        if re.match(r"^\d{1,2}(\.\d{1,2})*\.?\s+[A-ZÀ-Ú]", stripped) and len(stripped) < 80:
            # Remove the number prefix for cleaner heading
            heading = re.sub(r"^\d{1,2}(\.\d{1,2})*\.?\s+", "", stripped)
            output.append("")
            output.append(f"## {heading}")
            output.append("")
            continue

        # Detect ALL CAPS headings (common in papers)
        if (len(stripped) > 3 and len(stripped) < 80
                and stripped == stripped.upper()
                and re.match(r"^[A-ZÀ-Ú\s]+$", stripped)
                and not stripped.endswith(".")):
            output.append("")
            output.append(f"## {stripped.title()}")
            output.append("")
            continue

        # Detect Title Case headings (short lines, no ending punctuation)
        if (len(stripped) > 3 and len(stripped) < 60
                and not stripped.endswith((".", ",", ";", ":", "!", "?"))
                and _is_title_case(stripped)
                and i > 0 and not lines[i - 1].strip()):
            # Only treat as heading if previous line was blank
            output.append("")
            output.append(f"### {stripped}")
            output.append("")
            continue

        # Regular paragraph text
        output.append(stripped)

    # Clean up: collapse 3+ blank lines to 2
    result = "\n".join(output)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ── DOCX → Markdown ─────────────────────────────────────────────────────

def _extract_from_docx(file_bytes: bytes) -> ExtractedText:
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return ExtractedText(text="\n\n".join(paragraphs), page_count=1)


def _docx_text_to_markdown(file_bytes: bytes, text: str) -> str:
    """Convert DOCX to Markdown, preserving heading styles if available."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))

        lines: list[str] = []
        for para in doc.paragraphs:
            if not para.text.strip():
                if lines and lines[-1] != "":
                    lines.append("")
                continue

            style = para.style.name.lower() if para.style else ""
            if "heading 1" in style:
                lines.append("")
                lines.append(f"# {para.text.strip()}")
                lines.append("")
            elif "heading 2" in style:
                lines.append("")
                lines.append(f"## {para.text.strip()}")
                lines.append("")
            elif "heading 3" in style:
                lines.append("")
                lines.append(f"### {para.text.strip()}")
                lines.append("")
            elif "title" in style:
                lines.append("")
                lines.append(f"# {para.text.strip()}")
                lines.append("")
            elif "list" in style:
                lines.append(f"- {para.text.strip()}")
            else:
                lines.append(para.text.strip())

        result = "\n".join(lines)
        result = re.sub(r"\n{3,}", "\n\n", result)
        return result.strip()
    except Exception:
        # Fallback: treat as plain text
        return _plain_text_to_markdown(text)


# ── TXT → Markdown ──────────────────────────────────────────────────────

def _extract_from_txt(file_bytes: bytes) -> ExtractedText:
    text = file_bytes.decode("utf-8", errors="replace")
    return ExtractedText(text=text, page_count=1)


def _plain_text_to_markdown(text: str) -> str:
    """Convert plain text to Markdown.

    Heuristics:
    - Lines in ALL CAPS or Title Case (short, no punctuation) → headings
    - Lines starting with numbers → potential list items
    - Everything else → paragraphs
    """
    lines = text.split("\n")
    output: list[str] = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if output and output[-1] != "":
                output.append("")
            continue

        # ALL CAPS heading
        if (len(stripped) > 3 and len(stripped) < 80
                and stripped == stripped.upper()
                and re.match(r"^[A-ZÀ-Ú\s]+$", stripped)
                and not stripped.endswith(".")):
            output.append("")
            output.append(f"# {stripped.title()}")
            output.append("")
            continue

        # Numbered heading: "1. Introduction"
        if re.match(r"^\d{1,2}(\.\d{1,2})*\.?\s+[A-ZÀ-Ú]", stripped) and len(stripped) < 80:
            heading = re.sub(r"^\d{1,2}(\.\d{1,2})*\.?\s+", "", stripped)
            output.append("")
            output.append(f"## {heading}")
            output.append("")
            continue

        output.append(stripped)

    result = "\n".join(output)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ── Helpers ─────────────────────────────────────────────────────────────

def _is_title_case(s: str) -> bool:
    """Check if a string is in Title Case."""
    words = s.split()
    if not words:
        return False
    # At least 60% of words should start with uppercase
    upper_count = sum(1 for w in words if w[0].isupper())
    return upper_count / len(words) >= 0.6
