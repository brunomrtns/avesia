import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, AuthError, generateId } from '@avesia/shared';
import { createSessionSchema, updateSessionSchema, sessionListQuerySchema } from '@avesia/shared';
import { AvesiaAICore } from '@avesia/ai-providers';
import { AvesiaAICoreFacade, DIARIZATION_PROMPT } from '@avesia/ai-core';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';
import { notifySegmentCreated, processManually, getSettings, updateSettings } from '../services/session-copilot-service.js';
import { loadProviderConfigForOrg } from '../lib/org-ai-config.js';

const sessionRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /sessions ─────────────────────────────────────────────────────
  app.get('/sessions', async (request: FastifyRequest, _reply) => {
    const query = sessionListQuerySchema.parse(request.query);
    const { page, pageSize, patientId, professionalId, status, from, to } = query;

    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
    };

    if (patientId) where['patientId'] = patientId;
    if (status) where['status'] = status;

    // Enforce role-based visibility: if PROFESSIONAL, only show their own sessions.
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      where['professionalId'] = professional?.id ?? 'NONE';
    } else if (professionalId) {
      where['professionalId'] = professionalId;
    }

    if (from || to) {
      const scheduledAt: Record<string, unknown> = {};
      if (from) scheduledAt['gte'] = new Date(from);
      if (to) scheduledAt['lte'] = new Date(to);
      where['scheduledAt'] = scheduledAt;
    }

    const [items, total] = await Promise.all([
      app.prisma.clinicalSession.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { scheduledAt: 'desc' },
        include: {
          patient: { select: { id: true, fullName: true } },
          professional: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.clinicalSession.count({ where }),
    ]);

    return { items, page, pageSize, total };
  });

  // ── GET /sessions/:id ─────────────────────────────────────────────────
  app.get('/sessions/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      include: {
        patient: { select: { id: true, fullName: true } },
        professional: { select: { id: true, fullName: true } },
        transcripts: {
          include: {
            segments: {
              orderBy: { sequence: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new NotFoundError('ClinicalSession', id);
    }

    // Enforce role-based detail visibility
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      if (!professional || session.professionalId !== professional.id) {
        throw new AuthError('Você não tem permissão para visualizar esta sessão.');
      }
    }

    return session;
  });

  // ── POST /sessions ────────────────────────────────────────────────────
  app.post(
    '/sessions',
    { preHandler: [requirePermission({ resource: 'sessions', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const body = createSessionSchema.parse(request.body);

      // Verify patient belongs to org
      const patient = await app.prisma.patient.findFirst({
        where: { id: body.patientId, organizationId: request.organizationId, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundError('Patient', body.patientId);
      }

      // Enforce professionalId based on role
      let targetProfessionalId = body.professionalId;
      if (request.role === 'PROFESSIONAL') {
        const professional = await app.prisma.professional.findUnique({
          where: { userId: request.userId },
        });
        if (!professional) {
          throw new AuthError('Perfil de profissional não encontrado para este usuário.');
        }
        targetProfessionalId = professional.id;
      } else {
        // Admin/Owner: verify selected professional belongs to org
        const professional = await app.prisma.professional.findFirst({
          where: { id: body.professionalId, organizationId: request.organizationId, deletedAt: null },
        });
        if (!professional) {
          throw new NotFoundError('Professional', body.professionalId);
        }
      }

      const session = await app.prisma.clinicalSession.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          patientId: body.patientId,
          professionalId: targetProfessionalId,
          scheduledAt: new Date(body.scheduledAt),
          type: body.type,
          location: body.location,
          summary: body.notes ?? null,
          status: 'SCHEDULED',
        },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'clinical_session',
        resourceId: session.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(session);
    },
  );

  // ── PATCH /sessions/:id ───────────────────────────────────────────────
  app.patch(
    '/sessions/:id',
    { preHandler: [requirePermission({ resource: 'sessions', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };
      const body = updateSessionSchema.parse(request.body);

      const existing = await app.prisma.clinicalSession.findFirst({
        where: { id, organizationId: request.organizationId },
      });

      if (!existing) {
        throw new NotFoundError('ClinicalSession', id);
      }

      const data: Record<string, unknown> = {};
      if (body.scheduledAt !== undefined) data['scheduledAt'] = new Date(body.scheduledAt);
      if (body.status !== undefined) data['status'] = body.status;
      if (body.type !== undefined) data['type'] = body.type;
      if (body.location !== undefined) data['location'] = body.location;
      if (body.notes !== undefined) data['summary'] = body.notes;

      const session = await app.prisma.clinicalSession.update({
        where: { id },
        data,
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'clinical_session',
        resourceId: session.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return session;
    },
  );

  // ── GET /sessions/professionals ───────────────────────────────────────
  app.get('/sessions/professionals', async (request: FastifyRequest, _reply) => {
    const items = await app.prisma.professional.findMany({
      where: { organizationId: request.organizationId, deletedAt: null },
      select: { id: true, fullName: true },
    });
    return { items };
  });

  // ── POST /sessions/:id/segments ───────────────────────────────────────
  app.post('/sessions/:id/segments', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { text: string; speaker: string; startTime?: number; endTime?: number };

    const transcript = await getOrCreateActiveTranscript(app.prisma, id, request.organizationId);

    const lastSegment = await app.prisma.transcriptSegment.findFirst({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'desc' },
    });
    const sequence = (lastSegment?.sequence ?? 0) + 1;

    const segment = await app.prisma.transcriptSegment.create({
      data: {
        id: generateId(),
        transcriptId: transcript.id,
        organizationId: request.organizationId,
        sequence,
        startTime: body.startTime ?? sequence * 5,
        endTime: body.endTime ?? (sequence * 5) + 5,
        speaker: body.speaker || 'UNKNOWN',
        text: body.text,
      },
    });

    // Notify the copilot engine (event-driven, non-blocking).
    notifySegmentCreated(app.prisma, process.env.REDIS_URL ?? 'redis://localhost:6380', id, request.organizationId, {
      id: segment.id,
      sequence: segment.sequence,
      speaker: segment.speaker as 'THERAPIST' | 'PATIENT' | 'UNKNOWN',
      text: segment.text,
      startTime: segment.startTime,
      endTime: segment.endTime,
      createdAt: segment.createdAt.getTime(),
    });

    return reply.status(201).send(segment);
  });

  // ── POST /sessions/:id/transcribe-chunk ──────────────────────────────
  app.post('/sessions/:id/transcribe-chunk', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const transcript = await getOrCreateActiveTranscript(app.prisma, id, request.organizationId);

    const existingSegments = await app.prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'asc' },
    });

    const historyText = existingSegments
      .map((s: any) => `[${s.speaker === 'THERAPIST' ? 'Psicólogo' : 'Paciente'}]: ${s.text}`)
      .join('\n');

    const prompt = `Você é um simulador de transcrição de consulta psicológica clínica em português (pt-BR).
O psicólogo (THERAPIST) está conversando com o paciente (PATIENT).
Histórico da conversa até agora:
${historyText || '(Início da consulta)'}

Por favor, gere a próxima frase ou diálogo curto da consulta (apenas 1 ou no máximo 2 falas curtas e naturais).
Você DEVE retornar a resposta EXCLUSIVAMENTE em formato JSON puro, sem markdown, contendo um array de objetos com as chaves "speaker" (valores possíveis: "THERAPIST" ou "PATIENT") e "text" (o texto falado).
Exemplo de formato:
[{"speaker": "PATIENT", "text": "Sim, tenho me sentido muito ansioso ultimamente."}]`;

    // Use the AI facade (provider-agnostic).
    const providerConfig = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    const result = await aiCore.chat(
      [
        { role: 'system', content: 'Você é um simulador de transcrição de consultas psicológicas em português.' },
        { role: 'user', content: prompt },
      ],
      { capability: 'simple', temperature: 0.5 },
    );
    const responseText = result.content;

    let newTurns = [];
    try {
      const cleanContent = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      newTurns = JSON.parse(cleanContent);
    } catch (e) {
      newTurns = [{
        speaker: existingSegments.length % 2 === 0 ? 'THERAPIST' : 'PATIENT',
        text: responseText.trim() || '...',
      }];
    }

    const createdSegments = [];
    let lastSeq = existingSegments.reduce((max: number, s: any) => Math.max(max, s.sequence), 0);

    for (const turn of newTurns) {
      lastSeq++;
      const segment = await app.prisma.transcriptSegment.create({
        data: {
          id: generateId(),
          transcriptId: transcript.id,
          organizationId: request.organizationId,
          sequence: lastSeq,
          startTime: lastSeq * 5,
          endTime: lastSeq * 5 + 5,
          speaker: turn.speaker || 'UNKNOWN',
          text: turn.text || '',
        },
      });
      createdSegments.push(segment);

      // Notify the copilot engine for each new segment.
      notifySegmentCreated(app.prisma, process.env.REDIS_URL ?? 'redis://localhost:6380', id, request.organizationId, {
        id: segment.id,
        sequence: segment.sequence,
        speaker: segment.speaker as 'THERAPIST' | 'PATIENT' | 'UNKNOWN',
        text: segment.text,
        startTime: segment.startTime,
        endTime: segment.endTime,
        createdAt: segment.createdAt.getTime(),
      });
    }

    return reply.status(201).send(createdSegments);
  });

  // ── POST /sessions/:id/insights ───────────────────────────────────────
  // Manual trigger for copilot processing. The real-time copilot runs
  // automatically via the WS stream (event-driven). This endpoint allows
  // the professional to manually request an analysis cycle.
  app.post('/sessions/:id/insights', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };
    const log = request.log;
    log.info({ sessionId: id, orgId: request.organizationId }, '[insights] manual trigger');

    const result = await processManually(
      app.prisma,
      process.env.REDIS_URL ?? 'redis://localhost:6380',
      id,
      request.organizationId,
    );

    if (!result) {
      return {
        content: '*Nenhum diálogo registrado para análise ainda.*',
        sources: [],
        items: [],
      };
    }

    // Format the structured assistance for the response.
    const items = result.assistance.items.map((item) => ({
      type: item.type,
      content: item.content,
      confidence: item.confidence,
      sourceConcepts: item.sourceConcepts ?? [],
      sourceDocuments: item.sourceDocuments ?? [],
    }));

    // Also produce a markdown summary for backward compatibility.
    const markdownSummary = items.length > 0
      ? items.map((item) => `- ${item.content}`).join('\n')
      : '*Sem análises disponíveis no momento.*';

    return {
      content: markdownSummary,
      items,
      conceptIds: result.conceptIds,
      community: result.community,
      tokensUsed: result.tokensUsed,
      segmentSeqStart: result.segmentSeqStart,
      segmentSeqEnd: result.segmentSeqEnd,
    };
  });

  // ── GET /sessions/:id/copilot/settings ────────────────────────────────
  app.get('/sessions/:id/copilot/settings', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };
    const settings = await getSettings(
      app.prisma,
      process.env.REDIS_URL ?? 'redis://localhost:6380',
      id,
    );
    return settings;
  });

  // ── PUT /sessions/:id/copilot/settings ────────────────────────────────
  app.put('/sessions/:id/copilot/settings', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      enabled?: boolean;
      intensity?: 'low' | 'medium' | 'high';
      maxFrequencyMs?: number;
      autoGenerate?: boolean;
    };

    const settings = await updateSettings(
      app.prisma,
      process.env.REDIS_URL ?? 'redis://localhost:6380',
      id,
      body,
    );

    // Also persist to the database (so settings survive Redis TTL).
    await app.prisma.sessionCopilotSettings.upsert({
      where: { sessionId: id },
      create: {
        sessionId: id,
        enabled: settings.enabled,
        intensity: settings.intensity,
        maxFrequencyMs: settings.maxFrequencyMs,
        autoGenerate: settings.autoGenerate,
      },
      update: {
        enabled: settings.enabled,
        intensity: settings.intensity,
        maxFrequencyMs: settings.maxFrequencyMs,
        autoGenerate: settings.autoGenerate,
      },
    });

    return settings;
  });

  // ── GET /sessions/:id/copilot/analyses ────────────────────────────────
  // Retrieve persisted copilot analyses for post-session review.
  app.get('/sessions/:id/copilot/analyses', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const analyses = await app.prisma.sessionCopilotAnalysis.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      orderBy: { segmentSeqEnd: 'asc' },
      take: 100,
    });

    return analyses.map((a) => ({
      id: a.id,
      segmentSeqStart: a.segmentSeqStart,
      segmentSeqEnd: a.segmentSeqEnd,
      assistance: a.assistance,
      conceptIds: a.conceptIds,
      community: a.community,
      tokensUsed: a.tokensUsed,
      durationMs: a.durationMs,
      createdAt: a.createdAt,
    }));
  });

  // ── POST /sessions/:id/diarize ────────────────────────────────────────
  app.post('/sessions/:id/diarize', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };
    const transcript = await getOrCreateActiveTranscript(app.prisma, id, request.organizationId);

    const segments = await app.prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'asc' },
    });

    if (segments.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    const inputData = segments.map((s: any) => ({
      id: s.id,
      speaker: s.speaker,
      text: s.text,
    }));

    // Use the AI facade (provider-agnostic, centralized config).
    const providerConfig = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    const result = await aiCore.chat(
      [
        { role: 'system', content: DIARIZATION_PROMPT },
        { role: 'user', content: JSON.stringify(inputData, null, 2) },
      ],
      { capability: 'simple', temperature: 0.1 },
    );

    let corrections: Record<string, string> = {};
    try {
      const cleanContent = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      corrections = JSON.parse(cleanContent);
    } catch {
      // Ignore parse failures — no corrections applied.
    }

    let updatedCount = 0;
    for (const [segmentId, speaker] of Object.entries(corrections)) {
      if (speaker === 'THERAPIST' || speaker === 'PATIENT') {
        await app.prisma.transcriptSegment.update({
          where: { id: segmentId },
          data: { speaker },
        });
        updatedCount++;
      }
    }

    return { success: true, updatedCount };
  });
};

async function getOrCreateActiveTranscript(prisma: any, sessionId: string, organizationId: string) {
  let transcript = await prisma.transcript.findFirst({
    where: { sessionId, organizationId },
    orderBy: { createdAt: 'desc' },
  });

  if (!transcript) {
    let recording = await prisma.sessionRecording.findFirst({
      where: { sessionId, organizationId },
      orderBy: { createdAt: 'desc' },
    });

    if (!recording) {
      recording = await prisma.sessionRecording.create({
        data: {
          id: generateId(),
          organizationId,
          sessionId,
          storageKey: `live-recordings/${sessionId}`,
          format: 'WAV',
          status: 'COMPLETED',
        },
      });
    }

    transcript = await prisma.transcript.create({
      data: {
        id: generateId(),
        organizationId,
        recordingId: recording.id,
        sessionId,
        status: 'COMPLETED',
        language: 'pt-BR',
      },
    });
  }

  return transcript;
}

export default sessionRoutes;
