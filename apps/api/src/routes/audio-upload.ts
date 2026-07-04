import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

import { NotFoundError, generateId } from '@avesia/shared';
import { QUEUE_NAMES } from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';
import { uploadFile, deleteFile } from '../lib/storage.js';
import { enqueueCeleryTask } from '../lib/celery-bridge.js';

// Allowed audio formats → recording format string
const ALLOWED_AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'mp4', 'webm', 'ogg'];

function extToFormat(ext: string): string {
  const upper = ext.toUpperCase();
  if (upper === 'OGG') return 'WEBM';
  return upper;
}

const audioUploadRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── POST /sessions/:id/audio ──────────────────────────────────────────
  // Multipart file upload. Saves to MinIO, creates a SessionRecording, and
  // enqueues a transcription task to the Python Celery worker.
  app.post(
    '/sessions/:id/audio',
    { preHandler: [requirePermission({ resource: 'sessions', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      // Verify session belongs to org
      const session = await app.prisma.clinicalSession.findFirst({
        where: { id, organizationId: request.organizationId },
      });
      if (!session) {
        throw new NotFoundError('ClinicalSession', id);
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: 'Nenhum arquivo enviado.' });
      }

      const ext = data.filename.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_AUDIO_EXTS.includes(ext)) {
        return reply.status(400).send({
          message: `Formato .${ext} não suportado. Use: ${ALLOWED_AUDIO_EXTS.join(', ')}`,
        });
      }

      const buffer = await data.toBuffer();
      const contentType = data.mimetype || 'application/octet-stream';
      const storageKey = `sessions/${id}/${randomUUID()}.${ext}`;

      await uploadFile(storageKey, buffer, contentType);

      const recording = await app.prisma.sessionRecording.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          sessionId: id,
          storageKey,
          format: extToFormat(ext),
          sizeBytes: BigInt(buffer.length),
          status: 'UPLOADED',
        },
      });

      // Enqueue transcription task to the Python Celery worker.
      try {
        await enqueueCeleryTask('transcription', QUEUE_NAMES.transcription, {
          recordingId: recording.id,
          sessionId: id,
          storageKey,
        });
      } catch (err) {
        request.log.error({ err, recordingId: recording.id }, '[audio-upload] failed to enqueue transcription task');
        // Mark recording as failed but keep the record for retry.
        await app.prisma.sessionRecording.update({
          where: { id: recording.id },
          data: { status: 'FAILED', errorMessage: 'Falha ao enfileirar tarefa de transcrição' },
        });
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'session_recording',
        resourceId: recording.id,
        metadata: { sessionId: id, format: recording.format },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(recording);
    },
  );

  // ── GET /sessions/:id/audio ───────────────────────────────────────────
  // List recordings for a session.
  app.get('/sessions/:id/audio', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
    });
    if (!session) {
      throw new NotFoundError('ClinicalSession', id);
    }

    const recordings = await app.prisma.sessionRecording.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return { items: recordings };
  });

  // ── GET /sessions/:id/audio/:recordingId ──────────────────────────────
  // Get recording status.
  app.get('/sessions/:id/audio/:recordingId', async (request: FastifyRequest, _reply) => {
    const { id, recordingId } = request.params as { id: string; recordingId: string };

    const recording = await app.prisma.sessionRecording.findFirst({
      where: { id: recordingId, sessionId: id, organizationId: request.organizationId },
    });
    if (!recording) {
      throw new NotFoundError('SessionRecording', recordingId);
    }

    return recording;
  });

  // ── DELETE /sessions/:id/audio/:recordingId ───────────────────────────
  // Delete recording + file from MinIO.
  app.delete(
    '/sessions/:id/audio/:recordingId',
    { preHandler: [requirePermission({ resource: 'sessions', action: 'update' })] },
    async (request: FastifyRequest, reply) => {
      const { id, recordingId } = request.params as { id: string; recordingId: string };

      const recording = await app.prisma.sessionRecording.findFirst({
        where: { id: recordingId, sessionId: id, organizationId: request.organizationId },
      });
      if (!recording) {
        throw new NotFoundError('SessionRecording', recordingId);
      }

      // Best-effort delete from MinIO (don't fail the request if the file is gone).
      try {
        await deleteFile(recording.storageKey);
      } catch (err) {
        request.log.warn({ err, storageKey: recording.storageKey }, '[audio-upload] failed to delete file from MinIO');
      }

      await app.prisma.sessionRecording.delete({
        where: { id: recordingId },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'session_recording',
        resourceId: recordingId,
        metadata: { sessionId: id },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );
};

export default audioUploadRoutes;
