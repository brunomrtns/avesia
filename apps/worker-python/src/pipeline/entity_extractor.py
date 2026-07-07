"""Entity & relation extractor — hybrid approach (spaCy NER + LLM relation typing).

Stage 1: spaCy NER + noun phrase extraction across ALL chunks (local, deterministic)
Stage 2: Dedup by lemma, rank by frequency, select top N entities
Stage 3: One LLM call to type relations between top entities (if ai_client available)

This replaces the old approach of sending 8 chunks to the LLM and asking it to
extract everything — which saw <2% of the document and produced generic results.
"""

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .chunker import TextChunk


@dataclass
class ExtractedEntity:
    name: str
    type: str  # CONCEPT | PERSON | DISORDER | TECHNIQUE | ORGANIZATION | PLACE | PROTOCOL | TERM
    description: str = ""
    lemma: str = ""
    chunk_index: int = 0
    source_count: int = 1  # how many chunks mention this entity


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


# ── spaCy for NER + lemmatization (lazy loaded) ──────────────────────────────

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
    root = next((t for t in doc if t.dep_ == "ROOT"), doc[0])
    return root.lemma_.lower()


def _normalize(s: str) -> str:
    return " ".join(s.lower().split())


def _canonical_key(name: str) -> str:
    return _normalize(name)


# ── spaCy label → Avesia type mapping ────────────────────────────────────────

SPACY_LABEL_MAP = {
    "PER": "PERSON",
    "PESSOA": "PERSON",
    "ORG": "ORGANIZATION",
    "ORGANIZACAO": "ORGANIZATION",
    "LOC": "PLACE",
    "LOCAL": "PLACE",
    "MISC": "CONCEPT",
}

# Generic terms to filter out (not meaningful entities)
GENERIC_TERMS = {
    # Articles + common words
    "este", "esta", "esse", "essa", "isso", "isto", "aquilo", "aquele",
    "forma", "caso", "tipo", "parte", "vez", "vezes", "coisa", "modo",
    "maneira", "aspecto", "elemento", "item", "exemplo", "situação",
    "resultado", "informação", "dados", "texto", "conteúdo", "capítulo",
    "figura", "tabela", "quadro", "imagem", "página", "seção", "subseção",
    # Generic academic structure
    "introdução", "conclusão", "referências", "bibliografia", "apêndice",
    "anexo", "resumo", "abstract", "summary", "keywords", "palavras-chave",
    # Numbers/units
    "valor", "número", "quantidade", "total", "média", "porcentagem",
    # Pronouns/conjunctions that slip through
    "outro", "outros", "outra", "outras", "mesmo", "mesma", "cada",
    "todos", "todas", "todo", "toda", "alguns", "algumas",
}

# Leading words to strip from noun phrases
LEADING_STRIP = {
    "o", "a", "os", "as", "um", "uma", "uns", "umas",
    "de", "da", "do", "das", "dos", "d", "na", "no", "nas", "nos",
    "em", "por", "para", "com", "sem", "sob", "sobre",
    "que", "e", "ou", "mas", "pois", "como", "quando",
    "seu", "sua", "seus", "suas", "meu", "minha", "nosso", "nossa",
    "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas",
    "aquele", "aquela", "aqueles", "aquelas",
    "qualquer", "todo", "toda", "cada",
}


class EntityExtractor:
    """Hybrid entity and relation extractor.

    Stage 1: spaCy NER + noun phrases across all chunks (local, free)
    Stage 2: Dedup by lemma, rank by frequency
    Stage 3: One LLM call to type relations (if ai_client and entity_mode=llm)
    """

    def __init__(self, ai_client=None):
        self._ai_client = ai_client

    def extract(
        self,
        chunks: list[TextChunk],
        *,
        max_entities: int = 60,
        max_relations: int = 30,
        min_frequency: int = 2,
        entity_mode: str = "ner",
        on_progress=None,
    ) -> ExtractionResult:
        nlp = _get_nlp()
        if not nlp or not chunks:
            return ExtractionResult()

        # ── Stage 1: spaCy NER + noun phrases across ALL chunks ───────────
        if on_progress:
            on_progress(1, 3)

        raw_entities = self._spacy_extract_all(chunks, nlp)

        # ── Stage 2: Dedup by lemma, rank by frequency ────────────────────
        if on_progress:
            on_progress(2, 3)

        entities = self._dedup_and_rank(raw_entities, max_entities, min_frequency)

        # ── Stage 3: Type relations via LLM (or co-occurrence fallback) ───
        if on_progress:
            on_progress(3, 3)

        if self._ai_client and entity_mode == "llm" and len(entities) >= 2:
            relations = self._llm_type_relations(entities, chunks, max_relations)
        else:
            relations = self._cooccurrence_relations(entities, chunks, max_relations)

        return ExtractionResult(entities=entities, relations=relations)

    # ── Stage 1: spaCy extraction ──────────────────────────────────────────

    def _spacy_extract_all(
        self,
        chunks: list[TextChunk],
        nlp,
    ) -> list[ExtractedEntity]:
        """Run spaCy NER + noun phrase extraction across all chunks."""
        # spaCy has a default max_length of 1,000,000 chars
        # We process each chunk individually (chunks are ~400 tokens = ~1600 chars)
        entities: list[ExtractedEntity] = []

        for idx, chunk in enumerate(chunks):
            text = chunk.content[:5000]  # safety cap per chunk
            if len(text.strip()) < 10:
                continue

            try:
                doc = nlp(text)
            except Exception:
                continue

            # 1. Named entities (PER, ORG, LOC)
            for ent in doc.ents:
                name = ent.text.strip()
                if len(name) < 3 or len(name) > 80:
                    continue

                label = ent.label_.upper()
                entity_type = SPACY_LABEL_MAP.get(label)
                if not entity_type:
                    continue

                # Skip if it's just a number or date
                if name.replace("/", "").replace("-", "").replace(" ", "").isdigit():
                    continue

                entities.append(ExtractedEntity(
                    name=name,
                    type=entity_type,
                    chunk_index=idx,
                ))

            # 2. Noun phrases → medical concepts
            # noun_chunks in spaCy gives us NP boundaries
            for np in doc.noun_chunks:
                name = self._clean_noun_phrase(np.text)
                if not name or len(name) < 3 or len(name) > 60:
                    continue

                # Skip generic terms
                if name.lower() in GENERIC_TERMS:
                    continue

                # Skip if it's mostly stopwords
                words = name.split()
                if all(w.lower() in GENERIC_TERMS for w in words):
                    continue

                # Skip pure numbers
                if name.replace("/", "").replace("-", "").replace(" ", "").isdigit():
                    continue

                entities.append(ExtractedEntity(
                    name=name,
                    type="CONCEPT",
                    chunk_index=idx,
                ))

        return entities

    def _clean_noun_phrase(self, text: str) -> str:
        """Clean a noun phrase: strip leading articles/prepositions, normalize."""
        words = text.strip().split()
        if not words:
            return ""

        # Strip leading articles/prepositions
        while words and words[0].lower() in LEADING_STRIP:
            words.pop(0)

        # Strip trailing prepositions/articles
        while words and words[-1].lower() in LEADING_STRIP:
            words.pop()

        if not words:
            return ""

        name = " ".join(words)

        # Skip if only one short word (likely noise)
        if len(words) == 1 and len(words[0]) < 4:
            return ""

        # Capitalize first letter for display
        name = name[0].upper() + name[1:] if name else name

        return name

    # ── Stage 2: Dedup and rank ────────────────────────────────────────────

    def _dedup_and_rank(
        self,
        raw_entities: list[ExtractedEntity],
        max_entities: int,
        min_frequency: int,
    ) -> list[ExtractedEntity]:
        """Deduplicate by lemma, count frequency, return top N by frequency."""
        # Group by canonical lemma key
        lemma_groups: dict[str, list[ExtractedEntity]] = defaultdict(list)

        for e in raw_entities:
            lemma = _lemmatize(e.name)
            e.lemma = lemma
            key = _canonical_key(lemma)
            lemma_groups[key].append(e)

        # Build merged entities with frequency counts
        merged: list[ExtractedEntity] = []
        for key, group in lemma_groups.items():
            # Pick the longest name as canonical display
            best = max(group, key=lambda e: len(e.name))
            # Count unique chunks
            unique_chunks = set(e.chunk_index for e in group)
            frequency = len(unique_chunks)

            if frequency < min_frequency:
                continue

            # Use the most common type (PERSON/ORG/PLACE win over CONCEPT)
            type_priority = {"PERSON": 3, "ORGANIZATION": 2, "PLACE": 2, "DISORDER": 1, "TECHNIQUE": 1, "PROTOCOL": 1, "CONCEPT": 0, "TERM": 0}
            best_type = max(group, key=lambda e: type_priority.get(e.type, 0)).type

            merged.append(ExtractedEntity(
                name=best.name,
                type=best_type,
                description=best.description,
                lemma=best.lemma,
                chunk_index=best.chunk_index,
                source_count=frequency,
            ))

        # Sort by frequency (desc), then by name length (desc for tie-break)
        merged.sort(key=lambda e: (-e.source_count, -len(e.name)))

        return merged[:max_entities]

    # ── Stage 3a: LLM relation typing ──────────────────────────────────────

    def _llm_type_relations(
        self,
        entities: list[ExtractedEntity],
        chunks: list[TextChunk],
        max_relations: int,
    ) -> list[ExtractedRelation]:
        """One LLM call to type relations between top entities.

        Sends the entity list + representative context samples to the LLM,
        asks it to identify TREATS/CAUSES/IS_A/PART_OF/RELATED_TO relations.
        """
        # Take top 30 entities for the LLM (keep prompt manageable)
        top_entities = entities[:30]

        # Build entity list for prompt
        entity_lines = [f"- {e.name} ({e.type})" for e in top_entities]

        # Sample context: pick chunks spread across the document
        sample_chunks = self._sample_chunks(chunks, n=6, max_chars=600)
        context = "\n\n".join(sample_chunks)

        prompt = f"""Analise as entidades extraídas de um documento médico e identifique as relações semânticas entre elas.

ENTIDADES (extraídas via NER do documento completo):
{chr(10).join(entity_lines)}

CONTEXTO (amostras representativas do documento):
{context[:4000]}

Para cada relação semântica clara entre as entidades listadas:
- source: nome exato da entidade de origem (deve estar na lista acima)
- target: nome exato da entidade de destino (deve estar na lista acima)
- type: TREATS (trata), CAUSES (causa), IS_A (é um/tipo de), PART_OF (parte de), RELATED_TO (relacionado)

IMPORTANTE:
- Só crie relações que fazem sentido clínico/acadêmico óbvio
- Não invente relações entre entidades que não têm conexão clara
- Máximo {max_relations} relações
- Prefira relações tipadas (TREATS, CAUSES, IS_A, PART_OF) sobre RELATED_TO

Retorne APENAS JSON:
{{"relations":[{{"source":"TCC","target":"Depressão","type":"TREATS"}}]}}
"""

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
                return self._cooccurrence_relations(entities, chunks, max_relations)

            parsed = json.loads(content[start:end + 1])
            return self._parse_llm_relations(parsed, entities, max_relations)

        except Exception:
            return self._cooccurrence_relations(entities, chunks, max_relations)

    def _parse_llm_relations(
        self,
        parsed: dict,
        entities: list[ExtractedEntity],
        max_relations: int,
    ) -> list[ExtractedRelation]:
        """Parse LLM response into ExtractedRelation objects."""
        # Build lookup maps
        entity_map = {_normalize(e.name): e for e in entities}
        lemma_map = {_normalize(e.lemma): e for e in entities if e.lemma}

        relations: list[ExtractedRelation] = []
        seen: set[str] = set()

        for item in parsed.get("relations", []):
            src = str(item.get("source", "")).strip()
            tgt = str(item.get("target", "")).strip()
            rel_type = str(item.get("type", "RELATED_TO")).strip().upper()

            if not src or not tgt:
                continue
            if rel_type not in ("TREATS", "CAUSES", "IS_A", "PART_OF", "RELATED_TO"):
                rel_type = "RELATED_TO"

            # Match to known entities
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

            # LLM-typed relations get high confidence; RELATED_TO is weaker
            strength = 0.9 if rel_type != "RELATED_TO" else 0.3

            relations.append(ExtractedRelation(
                source_name=src_entity.name,
                source_type="CONCEPT",
                target_name=tgt_entity.name,
                target_type="CONCEPT",
                relation_type=rel_type,
                strength=strength,
                chunk_index=src_entity.chunk_index,
            ))

        return relations[:max_relations]

    # ── Stage 3b: Co-occurrence fallback ───────────────────────────────────

    def _cooccurrence_relations(
        self,
        entities: list[ExtractedEntity],
        chunks: list[TextChunk],
        max_relations: int,
    ) -> list[ExtractedRelation]:
        """Build co-occurrence relations (entities appearing in the same chunk).

        This is the deterministic fallback when no LLM is available.
        Uses a proximity window and requires co-occurrence in ≥2 chunks.
        """
        if len(entities) < 2:
            return []

        # Build entity → set of chunk indices map
        entity_chunks: dict[str, set[int]] = defaultdict(set)
        for e in entities:
            entity_chunks[e.name].add(e.chunk_index)

        # Find co-occurring pairs
        relations: list[ExtractedRelation] = []
        seen: set[str] = set()

        top_entities = entities[:40]  # limit pairs to check

        for i, e1 in enumerate(top_entities):
            for e2 in top_entities[i + 1:]:
                # Count shared chunks
                shared = entity_chunks[e1.name] & entity_chunks[e2.name]
                if len(shared) < 2:
                    continue

                key = f"{_canonical_key(e1.name)}|{_canonical_key(e2.name)}"
                if key in seen:
                    continue
                seen.add(key)

                # Strength scales with co-occurrence frequency
                strength = min(0.4, 0.15 + len(shared) * 0.05)

                relations.append(ExtractedRelation(
                    source_name=e1.name,
                    source_type="CONCEPT",
                    target_name=e2.name,
                    target_type="CONCEPT",
                    relation_type="RELATED_TO",
                    strength=strength,
                    chunk_index=min(shared),
                ))

        # Sort by strength, take top N
        relations.sort(key=lambda r: r.strength, reverse=True)
        return relations[:max_relations]

    # ── Helpers ────────────────────────────────────────────────────────────

    def _sample_chunks(
        self,
        chunks: list[TextChunk],
        n: int = 6,
        max_chars: int = 800,
    ) -> list[str]:
        """Sample n chunks uniformly across the document for context."""
        if len(chunks) <= n:
            selected = chunks
        else:
            step = len(chunks) / n
            indices = [int(i * step) for i in range(n)]
            selected = [chunks[i] for i in indices if i < len(chunks)]

        return [c.content[:max_chars] for c in selected if c.content.strip()]
