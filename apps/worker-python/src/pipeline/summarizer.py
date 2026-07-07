"""Summarizer — hierarchical TextRank extractive summarization using sumy.

For large documents, the text is split into sections, each section is
summarized independently, then the section summaries are combined and
summarized again (hierarchical). This covers the full document instead
of just the first 12KB.

Deterministic (no LLM). Falls back to simple sentence selection if sumy
is not available.
"""

import re
from dataclasses import dataclass


@dataclass
class SummarizerResult:
    summary: str
    provider: str
    model: str
    tokens_used: int


# Maximum chars per section for TextRank (sumy gets slow on very large inputs)
SECTION_MAX_CHARS = 20_000
# If document is smaller than this, summarize directly (no hierarchy)
DIRECT_THRESHOLD = 15_000

# Patterns that indicate editorial/credit pages (not real content)
EDITORIAL_INDICATORS = {
    "editora chefe", "editora executiva", "assistente editorial",
    "bibliotecária", "projeto gráfico", "diagramação", "revisor técnico",
    "capa", "créditos", "ficha catalográfica", "catalogação",
    "isbn", "copyright", "todos os direitos reservados",
    "atena editora", "open access publication",
}


class Summarizer:
    """Hierarchical TextRank-based extractive summarizer."""

    def summarize(self, content: str) -> SummarizerResult:
        if not content or not content.strip():
            return SummarizerResult(summary="", provider="textrank", model="sumy-textrank-v1", tokens_used=0)

        # For small documents, summarize directly
        if len(content) <= DIRECT_THRESHOLD:
            return self._sumy_textrank(content)

        # For large documents, use hierarchical summarization
        return self._hierarchical_textrank(content)

    def _hierarchical_textrank(self, text: str) -> SummarizerResult:
        """Summarize large text by section, then combine and re-summarize."""
        # Split into sections of ~SECTION_MAX_CHARS at sentence boundaries
        sections = self._split_into_sections(text, SECTION_MAX_CHARS)

        if not sections:
            return self._fallback(text)

        # Summarize each section
        section_summaries: list[str] = []
        for section in sections:
            if len(section.strip()) < 200:
                continue
            # Skip editorial/credit pages
            if self._is_editorial(section):
                continue
            result = self._sumy_textrank(section, sentence_count=2)
            if result.summary.strip():
                section_summaries.append(result.summary)

        if not section_summaries:
            return self._fallback(text)

        # Combine section summaries and summarize again
        combined = " ".join(section_summaries)

        # If combined is still large, just pick from section summaries
        if len(combined) > DIRECT_THRESHOLD:
            # Pick the most informative section summaries (first N)
            final = " ".join(section_summaries[:5])
        else:
            final_result = self._sumy_textrank(combined, sentence_count=5)
            final = final_result.summary.strip() or " ".join(section_summaries[:5])

        if not final.strip():
            return self._fallback(text)

        return SummarizerResult(
            summary=final,
            provider="textrank",
            model="sumy-textrank-hierarchical-v1",
            tokens_used=0,
        )

    def _split_into_sections(self, text: str, max_chars: int) -> list[str]:
        """Split text into sections at sentence boundaries, each ≤ max_chars."""
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])", text)
        sections: list[str] = []
        current: list[str] = []
        current_len = 0

        for sentence in sentences:
            s_len = len(sentence)
            if current_len + s_len > max_chars and current:
                sections.append(" ".join(current))
                current = []
                current_len = 0
            current.append(sentence)
            current_len += s_len

        if current:
            sections.append(" ".join(current))

        return sections

    def _is_editorial(self, text: str) -> bool:
        """Check if a text section is editorial/credit content (not real content)."""
        lower = text[:500].lower()  # check first 500 chars
        return any(indicator in lower for indicator in EDITORIAL_INDICATORS)

    def _sumy_textrank(self, text: str, sentence_count: int | None = None) -> SummarizerResult:
        """Use sumy's TextRank summarizer."""
        from sumy.parsers.plaintext import PlaintextParser
        from sumy.nlp.tokenizers import Tokenizer
        from sumy.summarizers.text_rank import TextRankSummarizer
        from sumy.nlp.stemmers import null_stemmer

        if sentence_count is None:
            sentence_count = 3 if len(text) < 5000 else 5

        try:
            parser = PlaintextParser.from_string(text, Tokenizer("portuguese"))
        except Exception:
            try:
                parser = PlaintextParser.from_string(text, Tokenizer("english"))
            except Exception:
                return self._fallback(text)

        summarizer = TextRankSummarizer(stemmer=null_stemmer)
        summarizer.stop_words = _get_stopwords()

        sentences = summarizer(parser.document, sentence_count)
        summary = " ".join(str(s) for s in sentences)

        if not summary.strip():
            return self._fallback(text)

        return SummarizerResult(
            summary=summary,
            provider="textrank",
            model="sumy-textrank-v1",
            tokens_used=0,
        )

    def _fallback(self, text: str) -> SummarizerResult:
        """Simple fallback: first few meaningful sentences."""
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])", text)
        # Skip very short sentences (likely page artifacts, headers)
        selected = [s.strip() for s in sentences if len(s.strip()) > 40][:5]
        summary = " ".join(selected) if selected else text[:280].rsplit(" ", 1)[0] + "…"

        return SummarizerResult(
            summary=summary,
            provider="textrank",
            model="fallback-v1",
            tokens_used=0,
        )


def _get_stopwords() -> set[str]:
    """Portuguese stopwords for sumy."""
    return {
        "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "ou", "um", "uma",
        "que", "com", "para", "por", "em", "no", "na", "nos", "nas", "se", "sua",
        "seu", "suas", "seus", "ao", "aos", "pelo", "pela", "pelos", "pelas",
        "como", "mais", "menos", "muito", "muita", "muitos", "muitas",
        "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas",
        "ser", "estar", "ter", "haver", "fazer", "ir", "vir", "ver", "dar",
        "dizer", "saber", "poder", "querer", "dever", "precisar",
        "quando", "onde", "porque", "pois", "então", "entao", "assim",
        "também", "tambem", "ainda", "já", "ja", "só", "so", "apenas",
        "sobre", "sob", "entre", "após", "apos", "antes", "depois",
        "durante", "através", "atraves", "sem", "contra", "desde",
        "até", "ate", "mas", "porem", "porém", "contudo", "todavia",
        "não", "nao", "sim", "cada", "todo", "toda", "todos", "todas",
        "outro", "outra", "outros", "outras", "mesmo", "mesma",
        "foi", "foram", "era", "será", "sera", "tem", "tinha", "tendo",
        "são", "sao", "somos", "estão", "estao",
    }
