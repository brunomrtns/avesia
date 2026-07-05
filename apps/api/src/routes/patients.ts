import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { NotFoundError, ConflictError, generateId } from '@avesia/shared';
import {
  createPatientSchema,
  updatePatientSchema,
  patientListQuerySchema,
} from '@avesia/shared';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant, requirePermission } from '../plugins/tenant.js';
import { writeAuditLog } from '../utils/audit-log.js';

/** Parse a single CSV line, handling quoted fields. */
function parseCsvLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === separator) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

const patientRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /patients ─────────────────────────────────────────────────────
  app.get('/patients', async (request: FastifyRequest, _reply) => {
    const query = patientListQuerySchema.parse(request.query);
    const { page, pageSize, search, status } = query;

    const where: Record<string, unknown> = {
      organizationId: request.organizationId,
      deletedAt: null,
    };

    if (search) {
      where['fullName'] = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where['status'] = status;
    }

    // Enforce role-based access control for PROFESSIONALs
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      const professionalId = professional?.id ?? 'NONE';
      where['professionals'] = {
        some: {
          professionalId,
        },
      };
    }

    const [items, total] = await Promise.all([
      app.prisma.patient.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.patient.count({ where }),
    ]);

    return { items, page, pageSize, total };
  });

  // ── GET /patients/:id ─────────────────────────────────────────────────
  app.get('/patients/:id', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    // Enforce role-based access control for PROFESSIONALs
    if (request.role === 'PROFESSIONAL') {
      const professional = await app.prisma.professional.findUnique({
        where: { userId: request.userId },
      });
      const professionalId = professional?.id ?? 'NONE';
      
      const isAssigned = await app.prisma.professionalPatient.findUnique({
        where: {
          professionalId_patientId: {
            professionalId,
            patientId: id,
          },
        },
      });

      if (!isAssigned) {
        throw new NotFoundError('Patient', id); // 404 to avoid leaking existence
      }
    }

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });

    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    return patient;
  });

  // ── POST /patients ────────────────────────────────────────────────────
  app.post(
    '/patients',
    { preHandler: [requirePermission({ resource: 'patients', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const body = createPatientSchema.parse(request.body);

      // Check unique email within org (if provided)
      if (body.email) {
        const existing = await app.prisma.patient.findFirst({
          where: {
            organizationId: request.organizationId,
            email: body.email,
            deletedAt: null,
          },
        });
        if (existing) {
          throw new ConflictError('Patient with this email already exists in this organization');
        }
      }

      const patient = await app.prisma.patient.create({
        data: {
          id: generateId(),
          organizationId: request.organizationId,
          fullName: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          status: 'ACTIVE',
        },
      });

      // If user is a PROFESSIONAL, auto-assign them to this patient
      if (request.role === 'PROFESSIONAL') {
        const professional = await app.prisma.professional.findUnique({
          where: { userId: request.userId },
        });
        if (professional) {
          await app.prisma.professionalPatient.create({
            data: {
              organizationId: request.organizationId,
              professionalId: professional.id,
              patientId: patient.id,
            },
          });
        }
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'CREATE',
        resource: 'patient',
        resourceId: patient.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(201).send(patient);
    },
  );

  // ── PATCH /patients/:id ───────────────────────────────────────────────
  app.patch(
    '/patients/:id',
    { preHandler: [requirePermission({ resource: 'patients', action: 'update' })] },
    async (request: FastifyRequest, _reply) => {
      const { id } = request.params as { id: string };
      const body = updatePatientSchema.parse(request.body);

      const existing = await app.prisma.patient.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundError('Patient', id);
      }

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data['fullName'] = body.name;
      if (body.email !== undefined) data['email'] = body.email;
      if (body.phone !== undefined) data['phone'] = body.phone;
      if (body.dateOfBirth !== undefined) {
        data['dateOfBirth'] = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
      }
      if (body.status !== undefined) data['status'] = body.status;

      const patient = await app.prisma.patient.update({
        where: { id },
        data,
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'UPDATE',
        resource: 'patient',
        resourceId: patient.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return patient;
    },
  );

  // ── DELETE /patients/:id (soft delete) ────────────────────────────────
  app.delete(
    '/patients/:id',
    { preHandler: [requirePermission({ resource: 'patients', action: 'delete' })] },
    async (request: FastifyRequest, reply) => {
      const { id } = request.params as { id: string };

      const existing = await app.prisma.patient.findFirst({
        where: { id, organizationId: request.organizationId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundError('Patient', id);
      }

      await app.prisma.patient.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      });

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'DELETE',
        resource: 'patient',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(204).send();
    },
  );

  // ── GET /patients/:id/timeline ────────────────────────────────────────
  // Returns sessions for the patient ordered by date, with notes and AI
  // analyses summary for each session.
  app.get('/patients/:id/timeline', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    const sessions = await app.prisma.clinicalSession.findMany({
      where: { patientId: id, organizationId: request.organizationId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        professional: { select: { id: true, fullName: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            content: true,
            createdAt: true,
          },
        },
        aiAnalyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            provider: true,
            model: true,
            createdAt: true,
          },
          take: 5,
        },
      },
    });

    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        tags: patient.tags,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        status: s.status,
        type: s.type,
        location: s.location,
        summary: s.summary,
        professionalName: s.professional?.fullName ?? '—',
        notes: s.notes,
        aiAnalyses: s.aiAnalyses,
      })),
    };
  });

  // ── GET /patients/:id/profile ─────────────────────────────────────────
  // Returns patient + memory (PatientMemory) + recent alerts + session stats.
  app.get('/patients/:id/profile', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    const [memory, recentAlerts, totalSessions, completedSessions, lastSession] = await Promise.all([
      app.prisma.patientMemory.findUnique({
        where: { patientId: id },
      }),
      app.prisma.clinicalAlert.findMany({
        where: { patientId: id, organizationId: request.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      app.prisma.clinicalSession.count({
        where: { patientId: id, organizationId: request.organizationId },
      }),
      app.prisma.clinicalSession.count({
        where: { patientId: id, organizationId: request.organizationId, status: 'COMPLETED' },
      }),
      app.prisma.clinicalSession.findFirst({
        where: { patientId: id, organizationId: request.organizationId },
        orderBy: { scheduledAt: 'desc' },
        select: { id: true, scheduledAt: true, type: true, status: true },
      }),
    ]);

    return {
      patient,
      memory,
      recentAlerts,
      sessionStats: {
        total: totalSessions,
        completed: completedSessions,
        lastSession,
      },
    };
  });

  // ── GET /patients/:id/memory ──────────────────────────────────────────
  // Returns PatientMemory for the patient (creates empty if not exists).
  app.get('/patients/:id/memory', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    const memory = await app.prisma.patientMemory.upsert({
      where: { patientId: id },
      create: {
        id: generateId(),
        organizationId: request.organizationId,
        patientId: id,
        summary: '',
        keyThemes: [],
        sessionCount: 0,
      },
      update: {},
    });

    return memory;
  });

  // ── PUT /patients/:id/memory ──────────────────────────────────────────
  // Updates PatientMemory (used internally after session analysis).
  app.put('/patients/:id/memory', async (request: FastifyRequest, _reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      summary?: string;
      keyThemes?: string[];
      sessionCount?: number;
      lastSessionId?: string | null;
    };

    const patient = await app.prisma.patient.findFirst({
      where: { id, organizationId: request.organizationId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundError('Patient', id);
    }

    const data: Record<string, unknown> = { lastUpdatedAt: new Date() };
    if (body.summary !== undefined) data['summary'] = body.summary;
    if (body.keyThemes !== undefined) data['keyThemes'] = body.keyThemes;
    if (body.sessionCount !== undefined) data['sessionCount'] = body.sessionCount;
    if (body.lastSessionId !== undefined) data['lastSessionId'] = body.lastSessionId ?? null;

    const memory = await app.prisma.patientMemory.upsert({
      where: { patientId: id },
      create: {
        id: generateId(),
        organizationId: request.organizationId,
        patientId: id,
        summary: body.summary ?? '',
        keyThemes: body.keyThemes ?? [],
        sessionCount: body.sessionCount ?? 0,
        lastSessionId: body.lastSessionId ?? null,
        lastUpdatedAt: new Date(),
      },
      update: data,
    });

    return memory;
  });

  // ── POST /patients/import ─────────────────────────────────────────────
  // Bulk import patients from CSV. Receives the file + mapping config.
  app.post(
    '/patients/import',
    { preHandler: [requirePermission({ resource: 'patients', action: 'create' })] },
    async (request: FastifyRequest, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ message: 'Nenhum arquivo enviado.' });
      }

      // Mapping config comes from form fields
      const fields = data.fields;
      const getField = (name: string): string | undefined => {
        const f = fields[name];
        if (f && 'value' in f) return String(f.value);
        return undefined;
      };
      const separator = getField('separator') || ',';
      const skipHeader = getField('skipHeader') === 'true';
      const fullNameCol = parseInt(getField('fullNameCol') ?? '', 10);
      const emailCol = getField('emailCol') ? parseInt(getField('emailCol')!, 10) : -1;
      const phoneCol = getField('phoneCol') ? parseInt(getField('phoneCol')!, 10) : -1;
      const dateOfBirthCol = getField('dateOfBirthCol') ? parseInt(getField('dateOfBirthCol')!, 10) : -1;
      const genderCol = getField('genderCol') ? parseInt(getField('genderCol')!, 10) : -1;

      if (isNaN(fullNameCol) || fullNameCol < 0) {
        return reply.status(400).send({ message: 'Coluna de nome é obrigatória.' });
      }

      // Read file content
      const buffer = await data.toBuffer();
      const text = buffer.toString('utf-8');

      // Parse CSV
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const startIdx = skipHeader ? 1 : 0;

      const results = {
        total: 0,
        imported: 0,
        errors: 0,
        duplicates: 0,
        errorDetails: [] as string[],
      };

      const existingEmails = new Set<string>();
      const existingNames = new Set<string>();

      // Pre-load existing patients to check duplicates
      const existing = await app.prisma.patient.findMany({
        where: { organizationId: request.organizationId, deletedAt: null },
        select: { email: true, fullName: true },
      });
      for (const p of existing) {
        if (p.email) existingEmails.add(p.email.toLowerCase());
        existingNames.add(p.fullName.toLowerCase());
      }

      for (let i = startIdx; i < lines.length; i++) {
        results.total++;
        const row = parseCsvLine(lines[i]!, separator);

        const fullName = row[fullNameCol]?.trim();
        if (!fullName) {
          results.errors++;
          results.errorDetails.push(`Linha ${i + 1}: nome vazio`);
          continue;
        }

        const email = emailCol >= 0 ? row[emailCol]?.trim() || null : null;
        const phone = phoneCol >= 0 ? row[phoneCol]?.trim() || null : null;
        const dateOfBirthRaw = dateOfBirthCol >= 0 ? row[dateOfBirthCol]?.trim() || null : null;
        const genderRaw = genderCol >= 0 ? row[genderCol]?.trim() || null : null;

        // Check duplicates
        if (email && existingEmails.has(email.toLowerCase())) {
          results.duplicates++;
          continue;
        }
        if (existingNames.has(fullName.toLowerCase())) {
          results.duplicates++;
          continue;
        }

        // Parse date of birth (accept YYYY-MM-DD, DD/MM/YYYY)
        let dateOfBirth: Date | null = null;
        if (dateOfBirthRaw) {
          const dmy = dateOfBirthRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          const ymd = dateOfBirthRaw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (dmy) {
            dateOfBirth = new Date(`${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`);
          } else if (ymd) {
            dateOfBirth = new Date(`${ymd[1]}-${ymd[2]!.padStart(2, '0')}-${ymd[3]!.padStart(2, '0')}`);
          }
        }

        // Parse gender
        let gender: string | null = null;
        if (genderRaw) {
          const g = genderRaw.toUpperCase();
          if (['M', 'MALE', 'MASCULINO'].includes(g)) gender = 'MALE';
          else if (['F', 'FEMALE', 'FEMININO'].includes(g)) gender = 'FEMALE';
          else if (['O', 'OTHER', 'OUTRO'].includes(g)) gender = 'OTHER';
          else gender = 'UNKNOWN';
        }

        try {
          await app.prisma.patient.create({
            data: {
              id: generateId(),
              organizationId: request.organizationId,
              fullName,
              email,
              phone,
              dateOfBirth,
              gender,
              status: 'ACTIVE',
            },
          });
          results.imported++;
          if (email) existingEmails.add(email.toLowerCase());
          existingNames.add(fullName.toLowerCase());
        } catch (err) {
          results.errors++;
          results.errorDetails.push(`Linha ${i + 1}: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
        }
      }

      void writeAuditLog(app.prisma, {
        organizationId: request.organizationId,
        userId: request.userId,
        action: 'IMPORT',
        resource: 'patient',
        resourceId: 'bulk',
        metadata: { ...results },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });

      return reply.status(200).send(results);
    },
  );
};

export default patientRoutes;
