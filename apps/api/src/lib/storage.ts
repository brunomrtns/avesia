import * as Minio from 'minio';
import { env } from '../config/env.js';

let client: Minio.Client | null = null;
let bucketReady = false;

function getClient(): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: false,
      accessKey: env.MINIO_ROOT_USER,
      secretKey: env.MINIO_ROOT_PASSWORD,
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const mc = getClient();
  const exists = await mc.bucketExists(env.MINIO_BUCKET);
  if (!exists) {
    await mc.makeBucket(env.MINIO_BUCKET);
  }
  // Set lifecycle rule: delete objects under sessions/ after 1 day.
  // This is a safety net — the worker deletes audio immediately after
  // transcription, but if the worker crashes, MinIO will clean up.
  try {
    await mc.setBucketLifecycle(env.MINIO_BUCKET, {
      Rule: [
        {
          ID: 'expire-session-audio',
          Status: 'Enabled',
          Filter: { Prefix: 'sessions/' },
          Expiration: { Days: 1 },
        },
      ],
    });
  } catch {
    // Lifecycle rule may already exist or MinIO version doesn't support it.
    // Non-fatal — the worker still deletes audio explicitly.
  }
  bucketReady = true;
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const mc = getClient();
  await ensureBucket();
  await mc.putObject(env.MINIO_BUCKET, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
  return key;
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  const mc = getClient();
  const stream = await mc.getObject(env.MINIO_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function getFileUrl(key: string): string {
  return `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  const mc = getClient();
  await mc.removeObject(env.MINIO_BUCKET, key);
}
