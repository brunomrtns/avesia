"""Community detector — label propagation clustering on the concept graph.

Uses networkx for graph construction and community detection.
"""

import networkx as nx
from sqlalchemy.orm import Session

from ..models import KnowledgeConcept, KnowledgeRelation


class CommunityDetector:
    """Detects communities in the knowledge graph using label propagation."""

    def detect_and_persist(self, session: Session, knowledge_base_id: str) -> dict:
        """Run community detection and persist community indices to concepts."""
        # Load all concepts
        concepts = session.query(KnowledgeConcept).filter_by(
            knowledge_base_id=knowledge_base_id
        ).all()

        if not concepts:
            return {"communities": 0, "concepts": 0}

        # Load all concept-concept relations
        relations = session.query(KnowledgeRelation).filter_by(
            knowledge_base_id=knowledge_base_id,
            sourceType="CONCEPT",
            targetType="CONCEPT",
        ).all()

        # Build graph
        graph = nx.Graph()
        concept_ids = {c.id for c in concepts}
        for c in concepts:
            graph.add_node(c.id)

        for r in relations:
            if r.source_id in concept_ids and r.target_id in concept_ids:
                graph.add_edge(r.source_id, r.target_id, weight=r.strength)

        # Run label propagation
        try:
            communities = nx.community.label_propagation_communities(graph)
        except Exception:
            # Fallback: each node is its own community
            communities = [{node} for node in graph.nodes]

        # Persist community indices
        community_map: dict[str, int] = {}
        for idx, community in enumerate(communities):
            for node_id in community:
                community_map[node_id] = idx

        for concept in concepts:
            concept.community = community_map.get(concept.id)

        session.commit()

        return {
            "communities": len(communities),
            "concepts": len(concepts),
        }
