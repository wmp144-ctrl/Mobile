export interface AccessTokenPayload {
  sub: string;
  sid: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export interface SessionDto {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: import('../users/user.types').PublicUser;
}

export const REFRESH_COOKIE = 'mrb_refresh';
