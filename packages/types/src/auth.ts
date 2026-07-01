import type { OrganizationId, UserId } from './common.js';
import type { Role } from './enums.js';

export interface JwtPayload {
  readonly sub: UserId;
  readonly org: OrganizationId;
  readonly role: Role;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface AuthContext {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly role: Role;
}
