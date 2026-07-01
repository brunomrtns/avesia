"""Graph builder — persists extracted entities and relations to the database.

Also links documents to topics and concepts.
"""

from sqlalchemy.orm import Session

from ..models import (
    KnowledgeConcept,
    KnowledgeDocument,
    KnowledgeDocumentTopic,
    KnowledgeRelation,
    KnowledgeTopic,
)
from .entity_extractor import ExtractedEntity, ExtractedRelation


def _canonical_key(name: str) -> str:
    return " ".join(name.lower().split())


class GraphBuilder:
    """Builds the knowledge graph from extracted entities and relations."""

    def build(
        self,
        session: Session,
        knowledge_base_id: str,
        document_id: str,
        entities: list[ExtractedEntity],
        relations: list[ExtractedRelation],
        topics: list[str],
    ) -> dict:
        """Persist entities, relations, and topic links to the database."""
        topic_ids: list[str] = []
        concept_ids: list[str] = []

        # Upsert topics and link to document
        for topic_name in topics:
            topic = self._upsert_topic(session, knowledge_base_id, topic_name)
            topic_ids.append(topic.id)
            self._link_document_topic(session, document_id, topic.id)

        # Upsert concepts and link to document
        for entity in entities:
            concept = self._upsert_concept(session, knowledge_base_id, entity, document_id)
            concept_ids.append(concept.id)
            # Create MENTIONS relation: document → concept
            self._upsert_relation(
                session, knowledge_base_id,
                source_type="DOCUMENT", source_id=document_id,
                target_type="CONCEPT", target_id=concept.id,
                relation_type="MENTIONS", strength=1.0,
                source_document_id=document_id,
            )

        # Upsert concept-concept relations
        # Build a name→concept_id map using lemma as canonical key
        concept_map: dict[str, str] = {}
        for entity, concept_id in zip(entities, concept_ids):
            # Use lemma (canonical form) as key, matching _upsert_concept logic
            canonical = entity.lemma if entity.lemma else entity.name
            display = canonical[0].upper() + canonical[1:] if canonical else entity.name
            concept_map[_canonical_key(display)] = concept_id
            # Also map the original name for fuzzy matching
            concept_map[_canonical_key(entity.name)] = concept_id

        for rel in relations:
            source_key = _canonical_key(rel.source_name)
            target_key = _canonical_key(rel.target_name)
            source_id = concept_map.get(source_key)
            target_id = concept_map.get(target_key)
            if not source_id or not target_id:
                continue
            self._upsert_relation(
                session, knowledge_base_id,
                source_type="CONCEPT", source_id=source_id,
                target_type="CONCEPT", target_id=target_id,
                relation_type=rel.relation_type,
                strength=rel.strength,
                source_document_id=document_id,
            )

        session.commit()

        return {
            "concept_ids": concept_ids,
            "topic_ids": topic_ids,
            "relation_count": len(relations),
        }

    def _upsert_topic(self, session: Session, kb_id: str, name: str) -> KnowledgeTopic:
        """Find or create a topic by name within the KB."""
        existing = session.query(KnowledgeTopic).filter_by(
            knowledge_base_id=kb_id, name=name
        ).first()

        if existing:
            return existing

        from ..utils import generate_id as cuid

        topic = KnowledgeTopic(
            id=cuid(),
            knowledge_base_id=kb_id,
            name=name,
            path=f"/{name.lower().replace(' ', '-')}",
            sort_order=0,
        )
        session.add(topic)
        session.flush()
        return topic

    def _upsert_concept(
        self, session: Session, kb_id: str, entity: ExtractedEntity,
        document_id: str,
    ) -> KnowledgeConcept:
        """Find or create a concept by canonical name within the KB.

        Uses lemma (from spaCy lemmatization) as the canonical key when available,
        so that 'ansiedades' and 'ansiedade' map to the same concept node.
        Stores source_document_id and source_chunk_index for traceability.
        """
        # Use lemma as canonical name if available (spaCy lemmatization)
        canonical_name = entity.lemma if entity.lemma else entity.name
        # Capitalize for display
        display_name = canonical_name[0].upper() + canonical_name[1:] if canonical_name else entity.name

        existing = session.query(KnowledgeConcept).filter_by(
            knowledge_base_id=kb_id, name=display_name
        ).first()

        if existing:
            # Update source count and description
            existing.source_count = (existing.source_count or 0) + 1
            if entity.description and (not existing.description or len(entity.description) > len(existing.description)):
                existing.description = entity.description
            session.flush()
            return existing

        from ..utils import generate_id as cuid

        concept = KnowledgeConcept(
            id=cuid(),
            knowledge_base_id=kb_id,
            name=display_name,
            type=entity.type,
            description=entity.description or None,
            source_count=1,
            source_document_id=document_id,
            source_chunk_index=entity.chunk_index,
        )
        session.add(concept)
        session.flush()
        return concept

    def _upsert_relation(
        self, session: Session, kb_id: str,
        *, source_type: str, source_id: str,
        target_type: str, target_id: str,
        relation_type: str, strength: float,
        source_document_id: str | None = None,
    ) -> KnowledgeRelation:
        """Find or create a relation (upsert by unique combination)."""
        existing = session.query(KnowledgeRelation).filter_by(
            knowledge_base_id=kb_id,
            sourceType=source_type, source_id=source_id,
            targetType=target_type, target_id=target_id,
            relationType=relation_type,
        ).first()

        if existing:
            existing.strength = max(existing.strength, strength)
            session.flush()
            return existing

        from ..utils import generate_id as cuid

        relation = KnowledgeRelation(
            id=cuid(),
            knowledge_base_id=kb_id,
            sourceType=source_type, source_id=source_id,
            targetType=target_type, target_id=target_id,
            relationType=relation_type,
            strength=strength,
            source_document_id=source_document_id,
        )
        session.add(relation)
        session.flush()
        return relation

    def _link_document_topic(self, session: Session, document_id: str, topic_id: str):
        """Link a document to a topic (idempotent)."""
        existing = session.query(KnowledgeDocumentTopic).filter_by(
            document_id=document_id, topic_id=topic_id
        ).first()
        if not existing:
            link = KnowledgeDocumentTopic(document_id=document_id, topic_id=topic_id)
            session.add(link)
            session.flush()
