import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcryptjs';

import type { ISODateString } from '@avesia/types';

const BCRYPT_ROUNDS = 12;

export function generateId(): string {
  return createId();
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function formatISODate(date: Date): ISODateString {
  return date.toISOString() as ISODateString;
}

export function safeJSONParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
