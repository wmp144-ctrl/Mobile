import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException, ErrorCodes } from '../errors/app.exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * درخواست‌های تغییردهنده باید از همان مبدأ برنامه باشند.
 * این لایه در کنار کوکی SameSite=Strict از حملات CSRF جلوگیری می‌کند.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (!origin) return true;

    const host = request.headers.host;
    try {
      const parsed = new URL(origin);
      if (host && parsed.host === host) return true;
    } catch {
      /* مبدأ نامعتبر */
    }

    throw new AppException(
      ErrorCodes.FORBIDDEN,
      'درخواست از یک مبدأ غیرمجاز ارسال شده است.',
      HttpStatus.FORBIDDEN,
    );
  }
}
