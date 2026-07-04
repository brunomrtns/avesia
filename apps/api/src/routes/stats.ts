import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { requireAuth } from '../plugins/auth.js';
import { requireTenant } from '../plugins/tenant.js';

const statsRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireTenant);

  // ── GET /stats ────────────────────────────────────────────────────────
  // Aggregated clinical metrics for the dashboard.
  app.get('/stats', async (request: FastifyRequest, _reply) => {
    const orgId = request.organizationId;
    const now = new Date();

    // Date ranges
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday as start
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all counts in parallel for speed.
    const [
      totalPatients,
      activePatients,
      newPatientsThisMonth,
      totalSessions,
      completedSessions,
      scheduledSessions,
      inProgressSessions,
      sessionsToday,
      sessionsThisWeek,
      sessionsThisMonth,
      totalNotes,
      notesThisMonth,
      finalizedNotes,
      aiAnalysesTotal,
      soapNotesGenerated,
      summariesGenerated,
      briefingsGenerated,
      copilotAnalysesTotal,
      recentSessions,
      recentAnalyses,
      sessionsByType,
      last30DaysSessions,
    ] = await Promise.all([
      // Patients
      app.prisma.patient.count({ where: { organizationId: orgId, deletedAt: null } }),
      app.prisma.patient.count({ where: { organizationId: orgId, deletedAt: null, status: 'ACTIVE' } }),
      app.prisma.patient.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
        },
      }),

      // Sessions
      app.prisma.clinicalSession.count({ where: { organizationId: orgId } }),
      app.prisma.clinicalSession.count({ where: { organizationId: orgId, status: 'COMPLETED' } }),
      app.prisma.clinicalSession.count({ where: { organizationId: orgId, status: 'SCHEDULED' } }),
      app.prisma.clinicalSession.count({ where: { organizationId: orgId, status: 'IN_PROGRESS' } }),
      app.prisma.clinicalSession.count({
        where: { organizationId: orgId, scheduledAt: { gte: startOfToday } },
      }),
      app.prisma.clinicalSession.count({
        where: { organizationId: orgId, scheduledAt: { gte: startOfWeek } },
      }),
      app.prisma.clinicalSession.count({
        where: { organizationId: orgId, scheduledAt: { gte: startOfMonth } },
      }),

      // Clinical notes
      app.prisma.clinicalNote.count({ where: { organizationId: orgId } }),
      app.prisma.clinicalNote.count({
        where: { organizationId: orgId, createdAt: { gte: startOfMonth } },
      }),
      app.prisma.clinicalNote.count({ where: { organizationId: orgId, status: 'FINALIZED' } }),

      // AI analyses
      app.prisma.aIAnalysis.count({ where: { organizationId: orgId } }),
      app.prisma.aIAnalysis.count({ where: { organizationId: orgId, type: 'SOAP_NOTE' } }),
      app.prisma.aIAnalysis.count({ where: { organizationId: orgId, type: 'SUMMARY' } }),
      app.prisma.aIAnalysis.count({ where: { organizationId: orgId, type: 'BRIEFING' } }),
      app.prisma.sessionCopilotAnalysis.count({ where: { organizationId: orgId } }),

      // Recent activity (for the dashboard feed)
      app.prisma.clinicalSession.findMany({
        where: { organizationId: orgId },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
        include: {
          patient: { select: { id: true, fullName: true } },
          professional: { select: { id: true, fullName: true } },
        },
      }),
      app.prisma.aIAnalysis.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          provider: true,
          model: true,
          status: true,
          createdAt: true,
          sessionId: true,
        },
      }),

      // Sessions by type (for chart)
      app.prisma.clinicalSession.groupBy({
        by: ['type'],
        where: { organizationId: orgId },
        _count: { type: true },
      }),

      // Last 30 days sessions (for trend chart)
      app.prisma.clinicalSession.findMany({
        where: {
          organizationId: orgId,
          scheduledAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { scheduledAt: true, status: true, type: true },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    // Aggregate token usage from AI analyses (best-effort — tokensUsed is Json).
    const tokenAnalyses = await app.prisma.aIAnalysis.findMany({
      where: { organizationId: orgId },
      select: { tokensUsed: true },
    });
    let totalTokensUsed = 0;
    for (const a of tokenAnalyses) {
      const t = a.tokensUsed as any;
      if (t && typeof t === 'object' && typeof t.total === 'number') {
        totalTokensUsed += t.total;
      } else if (typeof t === 'number') {
        totalTokensUsed += t;
      }
    }

    // Group last 30 days sessions by date for the trend chart.
    const sessionsByDate: Record<string, number> = {};
    for (const s of last30DaysSessions) {
      const dateKey = s.scheduledAt.toISOString().slice(0, 10); // YYYY-MM-DD
      sessionsByDate[dateKey] = (sessionsByDate[dateKey] ?? 0) + 1;
    }
    const trendData = Object.entries(sessionsByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      patients: {
        total: totalPatients,
        active: activePatients,
        newThisMonth: newPatientsThisMonth,
      },
      sessions: {
        total: totalSessions,
        completed: completedSessions,
        scheduled: scheduledSessions,
        inProgress: inProgressSessions,
        today: sessionsToday,
        thisWeek: sessionsThisWeek,
        thisMonth: sessionsThisMonth,
      },
      notes: {
        total: totalNotes,
        thisMonth: notesThisMonth,
        finalized: finalizedNotes,
      },
      aiAnalyses: {
        total: aiAnalysesTotal,
        soapNotesGenerated,
        summariesGenerated,
        briefingsGenerated,
        copilotAnalysesTotal,
        totalTokensUsed,
      },
      sessionsByType: sessionsByType.map((s) => ({
        type: s.type,
        count: s._count.type,
      })),
      trend: trendData,
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        status: s.status,
        type: s.type,
        scheduledAt: s.scheduledAt,
        patientName: s.patient?.fullName ?? '—',
        professionalName: s.professional?.fullName ?? '—',
      })),
      recentAnalyses,
    };
  });
};

export default statsRoutes;
