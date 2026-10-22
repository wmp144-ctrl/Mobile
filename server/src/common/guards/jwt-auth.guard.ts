import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import type { AccessTokenPayload } from '../../modules/auth/auth.types';
import {
  toAuthUser,
  USER_SELECT,
  type UserRow,
} from '../../modules/users/user.types';
import { AppException, ErrorCodes } from '../errors/app.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** مسیرهایی که حتی با الزام تغییر رمز هم باید در دسترس باشند */
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/unlock',
  '/api/auth/refresh',
  '/api/auth/sessions',
  '/api/public/info',
]);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new AppException(
        ErrorCodes.UNAUTHENTICATED,
        'برای استفاده از برنامه باید وارد حساب کاربری شوید.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new AppException(
        ErrorCodes.UNAUTHENTICATED,
        'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'توکن دسترسی نامعتبر است.', HttpStatus.UNAUTHORIZED);
    }

    const row = await this.db.queryOne<UserRow>(
      `SELECT ${USER_SELECT}
         FROM users u
         JOIN roles r ON r.id = u.role_id
         JOIN sessions s ON s.id = $2 AND s.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL
          AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [payload.sub, payload.sid],
    );

    if (!row) {
      throw new AppException(
        ErrorCodes.SESSION_INVALID,
        'نشست شما معتبر نیست یا بسته شده است. لطفاً دوباره وارد شوید.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!row.is_active) {
      throw new AppException(
        ErrorCodes.ACCOUNT_INACTIVE,
        'حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.',
        HttpStatus.FORBIDDEN,
      );
    }

    request.user = toAuthUser(row, payload.sid);

    if (row.must_change_password && !PASSWORD_CHANGE_ALLOWED_PATHS.has(request.path)) {
      throw new AppException(
        ErrorCodes.PASSWORD_CHANGE_REQUIRED,
        'برای ادامه باید رمز عبور خود را تغییر دهید.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
