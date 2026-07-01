"""Summarizer — TextRank extractive summarization using sumy.

Deterministic (no LLM). Falls back to simple sentence selection if sumy
is not available.
"""

from dataclasses import dataclass


@dataclass
class SummarizerResult:
    summary: str
    provider: str
    model: str
    tokens_used: int


class Summarizer:
    """TextRank-based extractive summarizer."""

    def summarize(self, content: str, max_input_chars: int = 12000) -> SummarizerResult:
        truncated = content[:max_input_chars]

        try:
            return self._sumy_textrank(truncated)
        except Exception:
            return self._fallback(truncated)

    def _sumy_textrank(self, text: str) -> SummarizerResult:
        """Use sumy's TextRank summarizer."""
        from sumy.parsers.plaintext import PlaintextParser
        from sumy.nlp.tokenizers import Tokenizer
        from sumy.summarizers.text_rank import TextRankSummarizer
        from sumy.nlp.stemmers import null_stemmer

        # sumy needs a language — we use "portuguese" if available
        try:
            parser = PlaintextParser.from_string(text, Tokenizer("portuguese"))
        except Exception:
            # Fallback: try with empty tokenizer
            parser = PlaintextParser.from_string(text, Tokenizer("english"))

        summarizer = TextRankSummarizer(stemmer=null_stemmer)
        summarizer.stop_words = _get_stopwords()

        # Dynamic sentence count
        sentence_count = 3 if len(text) < 5000 else 5

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
        """Simple fallback: first few sentences."""
        import re

        sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])", text)
        selected = [s.strip() for s in sentences if len(s.strip()) > 20][:3]
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
