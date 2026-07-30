// ============================================================================
//  JWT utilities — DEPRECATED
//
//  These functions were used by the old JWT-based auth system.
//  With BI Identity SSO, authentication is handled via cookies and the
//  BI Identity Service. This file is kept for backward compatibility but
//  is no longer imported by any route.
// ============================================================================

import { createHash } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
