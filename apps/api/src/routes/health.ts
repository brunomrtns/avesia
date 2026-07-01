import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/health', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  app.get('/health/ai', async (_request, _reply) => {
    return {
      status: 'ok',
      provider: 'configured',
      timestamp: new Date().toISOString(),
    };
  });
};

export default healthRoutes;
