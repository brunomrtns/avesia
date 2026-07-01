/**
 * Celery bridge — enqueues tasks in Celery-compatible Redis format.
 *
 * Celery/Kombu expects messages on a Redis list keyed by the queue name.
 * Each message is a JSON string with this structure:
 *   {
 *     body: base64(JSON([args, kwargs, embed])),
 *     "content-encoding": "utf-8",
 *     "content-type": "application/json",
 *     headers: { task, id, ... },
 *     properties: { correlation_id, delivery_info, ... }
 *   }
 *
 * The message is pushed via LPUSH to the queue key.
 */

import { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6380';

// Reuse a single Redis connection for all Celery queue pushes
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return _redis;
}

interface CeleryTaskPayload {
  [key: string]: unknown;
}

/**
 * Enqueue a Celery task by name with keyword arguments.
 *
 * @param taskName - The Celery task name (e.g. 'rag-indexing')
 * @param queueName - The Redis queue name (e.g. 'rag-indexing')
 * @param kwargs - Keyword arguments passed to the task
 * @returns The task ID (UUID)
 */
export async function enqueueCeleryTask(
  taskName: string,
  queueName: string,
  kwargs: CeleryTaskPayload,
): Promise<string> {
  const taskId = randomUUID();

  // Celery body: [args, kwargs, embed]
  const body = JSON.stringify([[], kwargs, {}]);
  const bodyBase64 = Buffer.from(body, 'utf-8').toString('base64');

  const message = {
    body: bodyBase64,
    'content-encoding': 'utf-8',
    'content-type': 'application/json',
    headers: {
      task: taskName,
      id: taskId,
      argsrepr: '[]',
      kwargsrepr: JSON.stringify(kwargs),
      origin: `api@${process.env['HOSTNAME'] ?? 'localhost'}`,
      lang: 'py',
      retries: 0,
      eta: null,
      expires: null,
      group: null,
      group_id: null,
      root_id: taskId,
      parent_id: null,
      args: [],
      kwargs: kwargs,
    },
    properties: {
      correlation_id: taskId,
      reply_to: taskId,
      delivery_mode: 2,
      delivery_info: {
        exchange: '',
        routing_key: queueName,
      },
      priority: 0,
      body_encoding: 'base64',
      delivery_tag: createHash('sha1').update(taskId).digest('hex'),
    },
  };

  const redis = getRedis();
  // Celery uses LPUSH to push messages to the queue
  await redis.lpush(queueName, JSON.stringify(message));

  return taskId;
}

/**
 * Close the Redis connection (for graceful shutdown).
 */
export async function closeCeleryBridge(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
