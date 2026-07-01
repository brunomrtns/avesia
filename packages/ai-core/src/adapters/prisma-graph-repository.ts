// ============================================================================
//  Avesia AI Core — Prisma Graph Repository (adapter)
//
//  Implements the GraphRepository port against Prisma. The graph evolves
//  incrementally and idempotently:
//  - Concepts deduplicated by (kb, name, type); sourceCount incremented and
//    description merged on re-encounter.
//  - Relations deduplicated by (kb, source, target, type); strength aggregated
//    as the max across sources (explicitness).
//  - Document↔concept links expressed as MENTIONS relations (no extra table).
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type { GraphRepository } from '../ports.js';
import type {
  ConceptRecord,
  ExtractedEntity,
  GraphData,
  GraphEdge,
  GraphNode,
  TopicRecord,
} from '../types.js';

/** Canonical key for entity deduplication (lowercase, collapsed spaces). */
function canonicalKey(name: string, type?: string): string {
  const base = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return type ? `${type}:${base}` : base;
}

export class PrismaGraphRepository implements GraphRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertConcept(knowledgeBaseId: string, entity: ExtractedEntity): Promise<ConceptRecord> {
    const existing = await this.prisma.knowledgeConcept.findFirst({
      where: { knowledgeBaseId, name: entity.name, type: entity.type },
    });

    if (existing) {
      // Merge description: keep the longest (most informative).
      const mergedDescription =
        entity.description.length > (existing.description ?? '').length
          ? entity.description
          : existing.description;
      const updated = await this.prisma.knowledgeConcept.update({
        where: { id: existing.id },
        data: {
          sourceCount: { increment: 1 },
          ...(mergedDescription !== existing.description ? { description: mergedDescription } : {}),
        },
      });
      return {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        description: updated.description,
        sourceCount: updated.sourceCount,
        topicId: updated.topicId,
      };
    }

    const created = await this.prisma.knowledgeConcept.create({
      data: {
        knowledgeBaseId,
        name: entity.name,
        description: entity.description,
        type: entity.type,
        sourceCount: 1,
      },
    });
    return {
      id: created.id,
      name: created.name,
      type: created.type,
      description: created.description,
      sourceCount: created.sourceCount,
      topicId: created.topicId,
    };
  }

  async upsertTopic(knowledgeBaseId: string, name: string, parentName: string | null): Promise<TopicRecord> {
    const existing = await this.prisma.knowledgeTopic.findFirst({
      where: { knowledgeBaseId, name },
    });
    if (existing) {
      return { id: existing.id, name: existing.name, path: existing.path, parentId: existing.parentId };
    }

    let parentId: string | null = null;
    let parentPath = '';
    if (parentName) {
      const parent = await this.prisma.knowledgeTopic.findFirst({
        where: { knowledgeBaseId, name: parentName },
      });
      if (parent) {
        parentId = parent.id;
        parentPath = parent.path;
      }
    }

    const path = parentPath ? `${parentPath}/${name}` : `/${name}`;
    const created = await this.prisma.knowledgeTopic.create({
      data: { knowledgeBaseId, parentId, name, path },
    });
    return { id: created.id, name: created.name, path: created.path, parentId: created.parentId };
  }

  async upsertRelation(
    knowledgeBaseId: string,
    source: { type: string; id: string },
    target: { type: string; id: string },
    relationType: string,
    strength: number,
  ): Promise<void> {
    const existing = await this.prisma.knowledgeRelation.findFirst({
      where: {
        knowledgeBaseId,
        sourceType: source.type,
        sourceId: source.id,
        targetType: target.type,
        targetId: target.id,
        relationType,
      },
    });

    if (existing) {
      // Aggregate strength: keep the max (most explicit observation).
      const newStrength = Math.max(existing.strength, strength);
      if (newStrength !== existing.strength) {
        await this.prisma.knowledgeRelation.update({
          where: { id: existing.id },
          data: { strength: newStrength },
        });
      }
      return;
    }

    await this.prisma.knowledgeRelation.create({
      data: {
        knowledgeBaseId,
        sourceType: source.type,
        sourceId: source.id,
        targetType: target.type,
        targetId: target.id,
        relationType,
        strength,
      },
    });
  }

  async linkDocumentTopic(documentId: string, topicId: string): Promise<void> {
    await this.prisma.knowledgeDocumentTopic.upsert({
      where: { documentId_topicId: { documentId, topicId } },
      update: {},
      create: { documentId, topicId },
    });
  }

  async linkDocumentConcept(documentId: string, conceptId: string): Promise<void> {
    // Express document→concept as a MENTIONS relation so the graph stays in one
    // edge model and the UI can render document↔concept navigation.
    const kbDoc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { knowledgeBaseId: true },
    });
    if (!kbDoc) return;

    const existing = await this.prisma.knowledgeRelation.findFirst({
      where: {
        knowledgeBaseId: kbDoc.knowledgeBaseId,
        sourceType: 'DOCUMENT',
        sourceId: documentId,
        targetType: 'CONCEPT',
        targetId: conceptId,
        relationType: 'MENTIONS',
      },
    });
    if (existing) return;

    await this.prisma.knowledgeRelation.create({
      data: {
        knowledgeBaseId: kbDoc.knowledgeBaseId,
        sourceType: 'DOCUMENT',
        sourceId: documentId,
        targetType: 'CONCEPT',
        targetId: conceptId,
        relationType: 'MENTIONS',
        strength: 1.0,
      },
    });
  }

  async setConceptCommunity(conceptId: string, community: number): Promise<void> {
    await this.prisma.knowledgeConcept.update({
      where: { id: conceptId },
      data: { community },
    });
  }

  async getGraph(knowledgeBaseId: string): Promise<GraphData> {
    const [topics, concepts, documents, relations] = await Promise.all([
      this.prisma.knowledgeTopic.findMany({
        where: { knowledgeBaseId },
        select: { id: true, name: true, path: true, parentId: true },
      }),
      this.prisma.knowledgeConcept.findMany({
        where: { knowledgeBaseId },
        select: { id: true, name: true, type: true, sourceCount: true, community: true },
      }),
      this.prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId, status: 'COMPLETED' },
        select: { id: true, originalFileName: true, fileType: true },
      }),
      this.prisma.knowledgeRelation.findMany({
        where: { knowledgeBaseId },
        select: {
          id: true, sourceType: true, sourceId: true, targetType: true, targetId: true,
          relationType: true, strength: true,
        },
      }),
    ]);

    const nodes: GraphNode[] = [
      ...topics.map((t) => ({
        id: t.id, type: 'TOPIC' as const, label: t.name, group: 'topic',
        parentId: t.parentId, path: t.path, sourceCount: null, fileType: null, community: null,
      })),
      ...concepts.map((c) => ({
        id: c.id, type: 'CONCEPT' as const, label: c.name, group: c.type,
        parentId: null, path: null, sourceCount: c.sourceCount, fileType: null, community: c.community,
      })),
      ...documents.map((d) => ({
        id: d.id, type: 'DOCUMENT' as const, label: d.originalFileName, group: 'document',
        parentId: null, path: null, sourceCount: null, fileType: d.fileType, community: null,
      })),
    ];

    const edges: GraphEdge[] = relations.map((r) => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      sourceType: r.sourceType as GraphEdge['sourceType'],
      targetType: r.targetType as GraphEdge['targetType'],
      type: r.relationType as GraphEdge['type'],
      strength: r.strength,
    }));

    return { nodes, edges };
  }
}

// Re-exported for adapters that need canonical keying.
export { canonicalKey };
