import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

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

const statusUpdateSchema = z.object({
  status: z.enum(['PROCESSING', 'COMPLETED', 'FAILED']),
  errorMessage: z.string().max(2000).optional(),
});

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
    // Set expiresAt to 90 days from now (data retention policy).
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
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
        expiresAt,
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
      await deleteFile(recording.storageKey!);
    } catch (err) {
      request.log.warn(
        { storageKey: recording.storageKey, err },
        '[transcript-receiver] failed to delete audio from MinIO',
      );
    }

    // Null out storageKey — the audio is gone, no point keeping the reference.
    await app.prisma.sessionRecording.update({
      where: { id: recording.id },
      data: { storageKey: null },
    });

    // Enqueue analysis task to the "analysis" queue
    let analysisTaskId: string | null = null;
    try {
      analysisTaskId = await enqueueCeleryTask('analysis', QUEUE_NAMES.analysis, {
        transcript_id: transcript.id,
        session_id: sessionId,
        organization_id: organizationId,
        analysis_type: 'SUMMARY',
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

  // ── POST /recordings/:recordingId/status ──────────────────────────────
  // Update recording status (called by the local Whisper worker).
  app.post('/recordings/:recordingId/status', async (request: FastifyRequest, reply) => {
    const { recordingId } = request.params as { recordingId: string };
    const body = statusUpdateSchema.parse(request.body);

    const recording = await app.prisma.sessionRecording.findFirst({
      where: { id: recordingId, organizationId: request.organizationId },
    });
    if (!recording) {
      throw new NotFoundError('SessionRecording', recordingId);
    }

    await app.prisma.sessionRecording.update({
      where: { id: recordingId },
      data: {
        status: body.status,
        ...(body.errorMessage ? { errorMessage: body.errorMessage } : {}),
      },
    });

    request.log.info(
      { recordingId, status: body.status },
      '[transcript-receiver] recording status updated by worker',
    );

    return reply.status(200).send({ ok: true, recordingId, status: body.status });
  });
};

export default transcriptReceiverRoutes;
