import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';

/**
 * Escape a value for CSV output (RFC 4180).
 * Wraps the value in double quotes if it contains a comma, quote, or newline,
 * and doubles any embedded double quotes.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

function setCsvHeaders(reply: FastifyReply, filename: string): void {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
}

const reportRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  // All routes require auth + tenant
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /reports/sessions.csv ─────────────────────────────────────────
  // Export sessions as CSV (patient name, type, date, status, summary).
  app.get('/reports/sessions.csv', async (request: FastifyRequest, reply) => {
    const sessions = await app.prisma.clinicalSession.findMany({
      where: { organizationId: request.organizationId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        patient: { select: { fullName: true } },
      },
    });

    setCsvHeaders(reply, 'sessions.csv');
    const lines = ['patient_name,type,date,status,summary'];
    for (const s of sessions) {
      lines.push(csvRow([
        s.patient?.fullName ?? '',
        s.type,
        s.scheduledAt.toISOString(),
        s.status,
        s.summary ?? '',
      ]));
    }
    return reply.send(lines.join('\n'));
  });

  // ── GET /reports/patients.csv ─────────────────────────────────────────
  // Export patients as CSV.
  app.get('/reports/patients.csv', async (request: FastifyRequest, reply) => {
    const patients = await app.prisma.patient.findMany({
      where: { organizationId: request.organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    setCsvHeaders(reply, 'patients.csv');
    const lines = ['name,email,phone,date_of_birth,status,created_at'];
    for (const p of patients) {
      lines.push(csvRow([
        p.fullName,
        p.email ?? '',
        p.phone ?? '',
        p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
        p.status,
        p.createdAt.toISOString(),
      ]));
    }
    return reply.send(lines.join('\n'));
  });

  // ── GET /reports/clinical-notes.csv ───────────────────────────────────
  // Export clinical notes as CSV.
  app.get('/reports/clinical-notes.csv', async (request: FastifyRequest, reply) => {
    const notes = await app.prisma.clinicalNote.findMany({
      where: { organizationId: request.organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { fullName: true } },
      },
    });

    setCsvHeaders(reply, 'clinical-notes.csv');
    const lines = ['patient_name,session_id,version,status,created_at,content'];
    for (const n of notes) {
      // content is a Json (SOAP) object — serialize to a single CSV cell.
      const contentStr = JSON.stringify(n.content);
      lines.push(csvRow([
        n.patient?.fullName ?? '',
        n.sessionId,
        n.version,
        n.status,
        n.createdAt.toISOString(),
        contentStr,
      ]));
    }
    return reply.send(lines.join('\n'));
  });
};

export default reportRoutes;
