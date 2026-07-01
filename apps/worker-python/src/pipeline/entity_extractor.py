"""Entity & relation extractor — LLM-based, domain-agnostic.

Single LLM call per document extracts:
- Entities (concepts, techniques, disorders, people, organizations)
- Typed relations (TREATS, CAUSES, IS_A, PART_OF, RELATED_TO)

No hardcoded dictionaries. The LLM understands the domain from context.
spaCy is used only for lemmatization (canonical entity names).
"""

import json
import re
from dataclasses import dataclass, field

from .chunker import TextChunk


@dataclass
class ExtractedEntity:
    name: str
    type: str  # CONCEPT | PERSON | DISORDER | TECHNIQUE | ORGANIZATION | PLACE | PROTOCOL | TERM
    description: str = ""
    lemma: str = ""
    chunk_index: int = 0  # which chunk this entity was extracted from


@dataclass
class ExtractedRelation:
    source_name: str
    source_type: str
    target_name: str
    target_type: str
    relation_type: str  # RELATED_TO | TREATS | CAUSES | IS_A | PART_OF
    strength: float = 0.5
    chunk_index: int = 0


@dataclass
class ExtractionResult:
    entities: list[ExtractedEntity] = field(default_factory=list)
    relations: list[ExtractedRelation] = field(default_factory=list)


# ── spaCy for lemmatization only (lazy loaded) ─────────────────────────────

_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("pt_core_news_lg")
        except OSError:
            try:
                import spacy
                _nlp = spacy.load("pt_core_news_sm")
            except OSError:
                _nlp = False
    return _nlp


def _lemmatize(name: str) -> str:
    """Return the lemma (canonical form) of an entity name."""
    nlp = _get_nlp()
    if not nlp:
        return name.lower()
    doc = nlp(name[:200])
    if len(doc) == 0:
        return name.lower()
    # Use the root token's lemma, or the first token's
    root = next((t for t in doc if t.dep_ == "ROOT"), doc[0])
    return root.lemma_.lower()


def _normalize(s: str) -> str:
    return " ".join(s.lower().split())


def _canonical_key(name: str) -> str:
    return _normalize(name)


class EntityExtractor:
    """LLM-based entity and relation extractor. Domain-agnostic."""

    def __init__(self, ai_client=None):
        self._ai_client = ai_client

    def extract(
        self,
        chunks: list[TextChunk],
        *,
        max_chunks: int = 10,
        on_progress=None,
    ) -> ExtractionResult:
        if not self._ai_client:
            return ExtractionResult()

        # Select the most content-rich chunks, keeping original index
        sorted_chunks = sorted(enumerate(chunks), key=lambda x: len(x[1].content), reverse=True)
        selected = sorted_chunks[:max_chunks]
        selected.sort(key=lambda x: x[0])
        # Keep (original_index, chunk) pairs
        selected_with_idx = [(idx, c) for idx, c in selected]

        if on_progress:
            on_progress(1, 2)

        # Single LLM call: extract entities + relations
        raw = self._llm_extract(selected_with_idx)

        if on_progress:
            on_progress(2, 2)

        if not raw:
            return ExtractionResult()

        chunk_map = raw.get("_chunk_map", {})

        # Parse and lemmatize
        entities = self._parse_entities(raw.get("entities", []), chunk_map)
        relations = self._parse_relations(raw.get("relations", []), entities, chunk_map)

        return ExtractionResult(entities=entities, relations=relations)

    def _llm_extract(self, chunks: list[tuple[int, TextChunk]]) -> dict | None:
        """One LLM call to extract entities and relations from text.

        Chunks are passed as (original_index, chunk) pairs so we can track
        which chunk each entity/relation came from.
        """
        # Build text with chunk markers so the LLM can reference them
        parts = []
        chunk_map = {}  # chunk_label → original_index
        for i, (orig_idx, chunk) in enumerate(chunks[:8]):
            label = f"[TRECHO {i}]"
            chunk_map[label] = orig_idx
            parts.append(f"{label}\n{chunk.content[:1000]}")
        text = "\n\n".join(parts)
        text = text[:6000]

        prompt = f"""Analise o texto abaixo (dividido em trechos) e extraia entidades e relações clínicas/acadêmicas relevantes.

IMPORTANTE:
- IGNORE referências bibliográficas, citações, nomes de revistas, sobrenomes de autores de citations
- IGNORE fragmentos como "American", "New", "Arch", "Jama", "Clin", "Med" — são de referências
- Só extraia conceitos, técnicas, transtornos e relações que são parte do CONTEÚDO do texto
- Não extraia nomes de autores de papers (ex: "Beck" como PERSON só se for discutido como teórico, não como citation)

Para cada entidade, forneça:
- name: nome canonical em português (singular)
- type: CONCEPT, DISORDER, TECHNIQUE, PERSON, ORGANIZATION, PLACE, PROTOCOL
- description: descrição curta (máx 10 palavras)
- chunk: o número do trecho onde aparece (ex: 0, 1, 2)

Para cada relação:
- source: nome da entidade de origem
- target: nome da entidade de destino
- type: TREATS, CAUSES, IS_A, PART_OF, RELATED_TO
- chunk: o número do trecho onde a relação aparece

Máximo 20 entidades e 15 relações. Só inclua o que é claramente parte do conteúdo.

Retorne APENAS JSON:
{{"entities":[{{"name":"TCC","type":"TECHNIQUE","description":"Terapia cognitivo-comportamental","chunk":0}}],"relations":[{{"source":"TCC","target":"Depressão","type":"TREATS","chunk":0}}]}}

TEXTO:
{text}"""

        try:
            response = self._ai_client.chat(
                messages=[{"role": "user", "content": prompt}],
                model=None,
                max_tokens=2000,
                temperature=0.1,
            )
            content = response.content.strip()

            # Extract JSON from response
            start = content.find("{")
            end = content.rfind("}")
            if start == -1 or end == -1:
                return None

            parsed = json.loads(content[start:end + 1])
            # Store chunk_map so _parse_entities/_parse_relations can use it
            parsed["_chunk_map"] = chunk_map
            return parsed
        except Exception:
            return None

    def _parse_entities(self, raw_entities: list[dict], chunk_map: dict) -> list[ExtractedEntity]:
        entities: list[ExtractedEntity] = []
        seen: set[str] = set()

        for item in raw_entities:
            name = str(item.get("name", "")).strip()
            entity_type = str(item.get("type", "CONCEPT")).strip().upper()
            description = str(item.get("description", "")).strip()
            chunk_label = str(item.get("chunk", "0")).strip()

            if len(name) < 2:
                continue
            if entity_type not in ("CONCEPT", "DISORDER", "TECHNIQUE", "PERSON",
                                    "ORGANIZATION", "PLACE", "PROTOCOL", "TERM"):
                entity_type = "CONCEPT"

            key = _canonical_key(name)
            if key in seen:
                continue
            seen.add(key)

            # Map chunk label to original chunk index
            orig_chunk = chunk_map.get(f"[TRECHO {chunk_label}]", int(chunk_label) if chunk_label.isdigit() else 0)

            lemma = _lemmatize(name)
            entities.append(ExtractedEntity(
                name=name[0].upper() + name[1:] if name else name,
                type=entity_type,
                description=description,
                lemma=lemma,
                chunk_index=orig_chunk,
            ))

        return entities[:20]

    def _parse_relations(
        self,
        raw_relations: list[dict],
        entities: list[ExtractedEntity],
        chunk_map: dict,
    ) -> list[ExtractedRelation]:
        # Map entity names (case-insensitive) for lookup
        entity_map = {_normalize(e.name): e for e in entities}
        # Also map by lemma for fuzzy matching
        lemma_map = {_normalize(e.lemma): e for e in entities if e.lemma}

        relations: list[ExtractedRelation] = []
        seen: set[str] = set()

        for item in raw_relations:
            src = str(item.get("source", "")).strip()
            tgt = str(item.get("target", "")).strip()
            rel_type = str(item.get("type", "RELATED_TO")).strip().upper()
            chunk_label = str(item.get("chunk", "0")).strip()

            if not src or not tgt:
                continue
            if rel_type not in ("TREATS", "CAUSES", "IS_A", "PART_OF", "RELATED_TO"):
                rel_type = "RELATED_TO"

            # Match source/target to known entities
            src_entity = entity_map.get(_normalize(src)) or lemma_map.get(_normalize(src))
            tgt_entity = entity_map.get(_normalize(tgt)) or lemma_map.get(_normalize(tgt))

            # Fuzzy: substring match
            if not src_entity:
                src_entity = next(
                    (e for e in entities if _normalize(src) in _normalize(e.name)
                     or _normalize(e.name) in _normalize(src)),
                    None,
                )
            if not tgt_entity:
                tgt_entity = next(
                    (e for e in entities if _normalize(tgt) in _normalize(e.name)
                     or _normalize(e.name) in _normalize(tgt)),
                    None,
                )

            if not src_entity or not tgt_entity or src_entity is tgt_entity:
                continue

            key = f"{_canonical_key(src_entity.name)}|{rel_type}|{_canonical_key(tgt_entity.name)}"
            if key in seen:
                continue
            seen.add(key)

            # LLM-extracted typed relations get high confidence.
            # RELATED_TO is the weakest relation type (co-occurrence implied,
            # not semantically typed) so it gets lower strength to avoid
            # flooding the graph with noisy edges.
            strength = 0.9 if rel_type != "RELATED_TO" else 0.3

            # Map chunk label to original chunk index
            orig_chunk = chunk_map.get(f"[TRECHO {chunk_label}]", int(chunk_label) if chunk_label.isdigit() else 0)

            relations.append(ExtractedRelation(
                source_name=src_entity.name,
                source_type="CONCEPT",
                target_name=tgt_entity.name,
                target_type="CONCEPT",
                relation_type=rel_type,
                strength=strength,
                chunk_index=orig_chunk,
            ))

        return relations[:20]
