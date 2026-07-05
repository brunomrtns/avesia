import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, AuthError, generateId } from '@avesia/shared';
import { createSessionSchema, updateSessionSchema, sessionListQuerySchema } from '@avesia/shared';
import { AvesiaAICore } from '@avesia/ai-providers';
import {
  AvesiaAICoreFacade,
  DIARIZATION_PROMPT,
  SOAP_NOTE_PROMPT,
  SESSION_SUMMARY_PROMPT,
  CLINICAL_ANALYSIS_PROMPT,
  SESSION_BRIEFING_PROMPT,
} from '@avesia/ai-core';

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

  // ── GET /sessions/:id/analyses ────────────────────────────────────────
  // Retrieve AI analyses (post-session reports) for a session.
  app.get('/sessions/:id/analyses', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const analyses = await app.prisma.aIAnalysis.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { items: analyses };
  });

  // ── POST /sessions/:id/briefing ──────────────────────────────────────
  // Pre-session briefing: summarizes previous sessions + patient history.
  app.post('/sessions/:id/briefing', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      include: {
        patient: { select: { id: true, fullName: true, notes: true, tags: true } },
      },
    });

    if (!session) {
      throw new NotFoundError('Sessão não encontrada');
    }

    // Fetch previous completed sessions for this patient (most recent 5).
    const previousSessions = await app.prisma.clinicalSession.findMany({
      where: {
        patientId: session.patientId,
        organizationId: request.organizationId,
        status: 'COMPLETED',
        id: { not: id },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 5,
      select: {
        id: true,
        scheduledAt: true,
        type: true,
        summary: true,
      },
    });

    // Fetch latest clinical notes for this patient (most recent 3).
    const previousNotes = await app.prisma.clinicalNote.findMany({
      where: {
        patientId: session.patientId,
        organizationId: request.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        content: true,
        createdAt: true,
      },
    });

    if (previousSessions.length === 0 && previousNotes.length === 0) {
      return {
        content: '*Sem histórico anterior para este paciente. Esta é a primeira sessão registrada.*',
        generatedAt: new Date().toISOString(),
        hasHistory: false,
      };
    }

    // Build context for the LLM.
    const context = {
      patient: {
        name: session.patient.fullName,
        tags: session.patient.tags,
        notes: session.patient.notes,
      },
      upcomingSession: {
        type: session.type,
        scheduledAt: session.scheduledAt,
        location: session.location,
      },
      previousSessions: previousSessions.map((s) => ({
        date: s.scheduledAt,
        type: s.type,
        summary: s.summary,
      })),
      previousNotes: previousNotes.map((n) => ({
        date: n.createdAt,
        content: n.content,
      })),
    };

    const providerConfig = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    const result = await aiCore.chat(
      [
        { role: 'system', content: SESSION_BRIEFING_PROMPT },
        { role: 'user', content: JSON.stringify(context, null, 2) },
      ],
      { capability: 'complex', temperature: 0.3 },
    );

    // Persist as AIAnalysis for audit/retrieval.
    await app.prisma.aIAnalysis.create({
      data: {
        id: generateId(),
        organizationId: request.organizationId,
        sessionId: id,
        type: 'BRIEFING',
        provider: result.provider,
        model: result.model,
        input: context as any,
        output: { content: result.content } as any,
        tokensUsed: { total: result.tokensUsed } as any,
        status: 'COMPLETED',
        durationMs: result.latencyMs ?? null,
      },
    });

    await writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'SESSION_BRIEFING_GENERATED',
      resource: 'clinical_session',
      resourceId: id,
      metadata: { tokensUsed: result.tokensUsed },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return {
      content: result.content,
      generatedAt: new Date().toISOString(),
      hasHistory: true,
      tokensUsed: result.tokensUsed,
    };
  });

  // ── POST /sessions/:id/soap ──────────────────────────────────────────
  // Auto-generate a SOAP clinical note from the session transcript.
  app.post('/sessions/:id/soap', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      include: {
        patient: { select: { id: true, fullName: true } },
        transcripts: {
          include: {
            segments: { orderBy: { sequence: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new NotFoundError('Sessão não encontrada');
    }

    const transcript = session.transcripts[0];
    if (!transcript || transcript.segments.length === 0) {
      return reply.code(400).send({
        error: 'NO_TRANSCRIPT',
        message: 'Não há transcrição disponível para gerar a nota SOAP.',
      });
    }

    const transcriptText = transcript.segments
      .map((s: any) => `[${s.speaker}]: ${s.text}`)
      .join('\n');

    const providerConfig = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    const result = await aiCore.chat(
      [
        { role: 'system', content: SOAP_NOTE_PROMPT },
        {
          role: 'user',
          content: `Paciente: ${session.patient.fullName}\nTipo de sessão: ${session.type}\n\nTranscrição:\n${transcriptText}`,
        },
      ],
      { capability: 'complex', temperature: 0.2 },
    );

    // Parse the JSON SOAP note from the LLM response.
    let soapContent: Record<string, unknown>;
    try {
      const cleanContent = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      soapContent = JSON.parse(cleanContent);
    } catch {
      // If parsing fails, store the raw content as subjective.
      soapContent = {
        subjective: result.content,
        objective: '',
        assessment: '',
        plan: '',
        observations: 'Erro ao parsear resposta do LLM — conteúdo bruto armazenado em subjective.',
        tasks: [],
      };
    }

    // Create a new ClinicalNote (DRAFT) — professional can review and finalize.
    const note = await app.prisma.clinicalNote.create({
      data: {
        id: generateId(),
        organizationId: request.organizationId,
        sessionId: id,
        patientId: session.patientId,
        authorId: request.userId,
        version: 1,
        content: soapContent as any,
        status: 'DRAFT',
      },
    });

    // Persist the AI analysis record for audit.
    await app.prisma.aIAnalysis.create({
      data: {
        id: generateId(),
        organizationId: request.organizationId,
        sessionId: id,
        transcriptId: transcript.id,
        type: 'SOAP_NOTE',
        provider: result.provider,
        model: result.model,
        input: { transcriptLength: transcript.segments.length } as any,
        output: { noteId: note.id, content: soapContent } as any,
        tokensUsed: { total: result.tokensUsed } as any,
        status: 'COMPLETED',
        durationMs: result.latencyMs ?? null,
      },
    });

    await writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'SOAP_NOTE_GENERATED',
      resource: 'clinical_session',
      resourceId: id,
      metadata: { noteId: note.id, tokensUsed: result.tokensUsed },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return {
      noteId: note.id,
      content: soapContent,
      status: 'DRAFT',
      tokensUsed: result.tokensUsed,
      generatedAt: new Date().toISOString(),
    };
  });

  // ── POST /sessions/:id/analyze ───────────────────────────────────────
  // Post-session analysis: summary + clinical analysis (mood, risk, patterns).
  app.post('/sessions/:id/analyze', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };

    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      include: {
        patient: { select: { id: true, fullName: true } },
        transcripts: {
          include: {
            segments: { orderBy: { sequence: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new NotFoundError('Sessão não encontrada');
    }

    const transcript = session.transcripts[0];
    if (!transcript || transcript.segments.length === 0) {
      return reply.code(400).send({
        error: 'NO_TRANSCRIPT',
        message: 'Não há transcrição disponível para análise pós-sessão.',
      });
    }

    const transcriptText = transcript.segments
      .map((s: any) => `[${s.speaker}]: ${s.text}`)
      .join('\n');

    const providerConfig = await loadProviderConfigForOrg(app.prisma, request.organizationId);
    const providerCore = new AvesiaAICore(providerConfig);
    const aiCore = new AvesiaAICoreFacade(providerCore, {
      embedProviderConfig: providerConfig,
    });

    // Run summary and clinical analysis in parallel.
    const [summaryResult, analysisResult] = await Promise.all([
      aiCore.chat(
        [
          { role: 'system', content: SESSION_SUMMARY_PROMPT },
          {
            role: 'user',
            content: `Paciente: ${session.patient.fullName}\nTipo de sessão: ${session.type}\n\nTranscrição:\n${transcriptText}`,
          },
        ],
        { capability: 'complex', temperature: 0.3 },
      ),
      aiCore.chat(
        [
          { role: 'system', content: CLINICAL_ANALYSIS_PROMPT },
          {
            role: 'user',
            content: `Paciente: ${session.patient.fullName}\nTipo de sessão: ${session.type}\n\nTranscrição:\n${transcriptText}`,
          },
        ],
        { capability: 'complex', temperature: 0.3 },
      ),
    ]);

    // Update session summary.
    await app.prisma.clinicalSession.update({
      where: { id },
      data: { summary: summaryResult.content },
    });

    // Persist both AIAnalysis records.
    const [summaryAnalysis, clinicalAnalysis] = await Promise.all([
      app.prisma.aIAnalysis.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          sessionId: id,
          transcriptId: transcript.id,
          type: 'SUMMARY',
          provider: summaryResult.provider,
          model: summaryResult.model,
          input: { transcriptLength: transcript.segments.length } as any,
          output: { content: summaryResult.content } as any,
          tokensUsed: { total: summaryResult.tokensUsed } as any,
          status: 'COMPLETED',
          durationMs: summaryResult.latencyMs ?? null,
        },
      }),
      app.prisma.aIAnalysis.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          sessionId: id,
          transcriptId: transcript.id,
          type: 'INSIGHTS',
          provider: analysisResult.provider,
          model: analysisResult.model,
          input: { transcriptLength: transcript.segments.length } as any,
          output: { content: analysisResult.content } as any,
          tokensUsed: { total: analysisResult.tokensUsed } as any,
          status: 'COMPLETED',
          durationMs: analysisResult.latencyMs ?? null,
        },
      }),
    ]);

    await writeAuditLog(app.prisma, {
      organizationId: request.organizationId,
      userId: request.userId,
      action: 'POST_SESSION_ANALYSIS_GENERATED',
      resource: 'clinical_session',
      resourceId: id,
      metadata: {
        summaryAnalysisId: summaryAnalysis.id,
        clinicalAnalysisId: clinicalAnalysis.id,
        totalTokensUsed: {
          summary: summaryResult.tokensUsed,
          analysis: analysisResult.tokensUsed,
        },
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return {
      summary: summaryResult.content,
      analysis: analysisResult.content,
      summaryAnalysisId: summaryAnalysis.id,
      clinicalAnalysisId: clinicalAnalysis.id,
      tokensUsed: {
        summary: summaryResult.tokensUsed,
        analysis: analysisResult.tokensUsed,
      },
      generatedAt: new Date().toISOString(),
    };
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

    // Persist diarization as an AIAnalysis for token tracking
    await app.prisma.aIAnalysis.create({
      data: {
        id: generateId(),
        organizationId: request.organizationId,
        sessionId: id,
        transcriptId: transcript.id,
        type: 'DIARIZATION',
        provider: result.provider,
        model: result.model,
        input: { segmentCount: segments.length } as any,
        output: { updatedCount } as any,
        tokensUsed: { total: result.tokensUsed } as any,
        status: 'COMPLETED',
        durationMs: result.latencyMs,
      },
    });

    return { success: true, updatedCount, tokensUsed: result.tokensUsed };
  });

  // ── GET /sessions/:id/tokens ─────────────────────────────────────────
  // Aggregate all token usage for a session, broken down by source.
  app.get('/sessions/:id/tokens', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    // Verify session belongs to org
    const session = await app.prisma.clinicalSession.findFirst({
      where: { id, organizationId: request.organizationId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundError('Sessão não encontrada');
    }

    // 1. AI Analyses (briefing, SOAP, summary, clinical analysis, diarization)
    const aiAnalyses = await app.prisma.aIAnalysis.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      select: { type: true, tokensUsed: true, provider: true, model: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const aiBreakdown: Record<string, number> = {};
    const providerBreakdown: Record<string, number> = {};
    const entries: Array<{ type: string; tokens: number; provider: string; model: string; createdAt: string }> = [];

    for (const a of aiAnalyses) {
      const t = a.tokensUsed as any;
      const tokens = (t && typeof t === 'object' && typeof t.total === 'number')
        ? t.total
        : (typeof t === 'number' ? t : 0);

      if (tokens > 0) {
        aiBreakdown[a.type] = (aiBreakdown[a.type] ?? 0) + tokens;
        providerBreakdown[a.provider] = (providerBreakdown[a.provider] ?? 0) + tokens;
        entries.push({ type: a.type, tokens, provider: a.provider, model: a.model, createdAt: a.createdAt.toISOString() });
      }
    }

    // 2. Copilot analyses (real-time insights)
    const copilotAnalyses = await app.prisma.sessionCopilotAnalysis.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      select: { tokensUsed: true, durationMs: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    let copilotTokens = 0;
    let copilotCount = 0;
    for (const c of copilotAnalyses) {
      copilotTokens += c.tokensUsed;
      if (c.tokensUsed > 0) copilotCount++;
      entries.push({ type: 'COPILOT', tokens: c.tokensUsed, provider: 'copilot', model: 'realtime', createdAt: c.createdAt.toISOString() });
    }

    // 3. Transcripts (token count from transcription)
    const transcripts = await app.prisma.transcript.findMany({
      where: { sessionId: id, organizationId: request.organizationId },
      select: { tokenCount: true, provider: true },
    });

    let transcriptTokens = 0;
    for (const t of transcripts) {
      if (t.tokenCount) {
        transcriptTokens += t.tokenCount;
        if (t.provider) {
          providerBreakdown[t.provider] = (providerBreakdown[t.provider] ?? 0) + t.tokenCount;
        }
        entries.push({ type: 'TRANSCRIPTION', tokens: t.tokenCount, provider: t.provider ?? 'unknown', model: 'whisper', createdAt: new Date().toISOString() });
      }
    }

    const total = Object.values(aiBreakdown).reduce((a, b) => a + b, 0) + copilotTokens + transcriptTokens;

    return {
      total,
      byType: {
        briefing: aiBreakdown['BRIEFING'] ?? 0,
        soap: aiBreakdown['SOAP'] ?? 0,
        summary: aiBreakdown['SUMMARY'] ?? 0,
        clinicalAnalysis: aiBreakdown['CLINICAL_ANALYSIS'] ?? 0,
        insights: aiBreakdown['INSIGHTS'] ?? 0,
        diarization: aiBreakdown['DIARIZATION'] ?? 0,
        copilot: copilotTokens,
        transcription: transcriptTokens,
      },
      byProvider: providerBreakdown,
      copilotCount,
      entries,
    };
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
