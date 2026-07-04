import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { generateId, NotFoundError } from '@avesia/shared';
import { QUEUE_NAMES } from '@avesia/shared';
import { requireWorkerAuth } from '../plugins/worker-auth.js';
import { deleteFile } from '../lib/storage.js';
import { enqueueCeleryTask } from '../lib/celery-bridge.js';

interface TranscriptSegmentInput {
  sequence: number;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
  confidence?: number;
}

interface TranscriptPayload {
  recordingId: string;
  segments: TranscriptSegmentInput[];
  provider?: string;
  tokenCount?: number;
  language?: string;
}

const transcriptReceiverRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes accept JWT OR API key
  app.addHook('onRequest', requireWorkerAuth);

  // ── POST /sessions/:sessionId/transcript ──────────────────────────────
  app.post('/sessions/:sessionId/transcript', async (request: FastifyRequest, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as TranscriptPayload;

    if (!body?.recordingId) {
      return reply.status(400).send({ error: 'recordingId is required' });
    }
    if (!Array.isArray(body.segments)) {
      return reply.status(400).send({ error: 'segments must be an array' });
    }

    const organizationId = request.organizationId;

    // Verify the recording exists and belongs to the org
    const recording = await app.prisma.sessionRecording.findFirst({
      where: { id: body.recordingId, organizationId },
    });
    if (!recording) {
      throw new NotFoundError('SessionRecording', body.recordingId);
    }

    // Verify the session exists and belongs to the org
    const session = await app.prisma.clinicalSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    if (!session) {
      throw new NotFoundError('ClinicalSession', sessionId);
    }

    // Create the Transcript record (status COMPLETED)
    const transcript = await app.prisma.transcript.create({
      data: {
        id: generateId(),
        organizationId,
        recordingId: recording.id,
        sessionId,
        status: 'COMPLETED',
        language: body.language ?? 'pt-BR',
        provider: body.provider ?? 'whisper-local',
        tokenCount: body.tokenCount ?? null,
      },
    });

    // Create transcript segments
    if (body.segments.length > 0) {
      await app.prisma.transcriptSegment.createMany({
        data: body.segments.map((seg) => ({
          id: generateId(),
          transcriptId: transcript.id,
          organizationId,
          sequence: seg.sequence,
          startTime: seg.startTime,
          endTime: seg.endTime,
          speaker: seg.speaker || 'UNKNOWN',
          text: seg.text,
          confidence: seg.confidence ?? null,
        })),
      });
    }

    // Update the recording status to COMPLETED
    await app.prisma.sessionRecording.update({
      where: { id: recording.id },
      data: { status: 'COMPLETED' },
    });

    // Delete the audio file from MinIO
    try {
      await deleteFile(recording.storageKey);
    } catch (err) {
      request.log.warn(
        { storageKey: recording.storageKey, err },
        '[transcript-receiver] failed to delete audio from MinIO',
      );
    }

    // Enqueue analysis task to the "analysis" queue
    let analysisTaskId: string | null = null;
    try {
      analysisTaskId = await enqueueCeleryTask('analysis', QUEUE_NAMES.analysis, {
        transcript_id: transcript.id,
        session_id: sessionId,
        organization_id: organizationId,
        analysis_type: 'CLINICAL_ANALYSIS',
      });
    } catch (err) {
      request.log.error(
        { err, transcriptId: transcript.id },
        '[transcript-receiver] failed to enqueue analysis task',
      );
    }

    return reply.status(201).send({
      ok: true,
      transcriptId: transcript.id,
      recordingId: recording.id,
      segmentCount: body.segments.length,
      analysisTaskId,
    });
  });
};

export default transcriptReceiverRoutes;
