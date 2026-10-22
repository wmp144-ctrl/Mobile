import type { Request } from 'express';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export function requestContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.ip ??
    req.socket?.remoteAddress ??
    null;
  const userAgent = (req.headers['user-agent'] ?? '').slice(0, 400) || null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent };
}
