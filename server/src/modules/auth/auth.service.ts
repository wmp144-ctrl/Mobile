import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import type { RequestContext } from '../../common/http/request-context';
import { requestContext } from '../../common/http/request-context';
import {
  burnPasswordCheck,
  generateRefreshToken,
  hashPassword,
  hashToken,
  passwordPolicyError,
  USERNAME_PATTERN,
  verifyPassword,
} from '../../common/utils/security';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { Inject } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { RolesRepository } from '../roles/roles.repository';
import { SettingsService } from '../settings/settings.service';
import { UsersRepository } from '../users/users.repository';
import { USER_SELECT, toPublicUser, type AuthUser, type PublicUser, type UserRow } from '../users/user.types';
import type { AuthResult, SessionDto, SessionRow } from './auth.types';
import { ChangePasswordDto, LoginDto, SetupDto } from './auth.dto';

export interface LoginOutcome {
  auth: AuthResult;
  refreshToken: string;
  sessionDays: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async needsSetup(): Promise<boolean> {
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL',
    );
    return Number(row?.count ?? 0) === 0;
  }

  /**
   * ایجاد مدیر کل فقط در اولین راه‌اندازی.
   * قفل advisory از ثبت هم‌زمان دو مدیر جلوگیری می‌کند.
   */
  async setup(dto: SetupDto, req: Request): Promise<void> {
    const context = requestContext(req);
    if (!USERNAME_PATTERN.test(dto.username)) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حروف انگلیسی، رقم، نقطه، خط تیره یا زیرخط باشد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const policyError = passwordPolicyError(dto.password);
    if (policyError) {
      throw new AppException(ErrorCodes.WEAK_PASSWORD, policyError, HttpStatus.BAD_REQUEST);
    }

    const adminRole = await this.rolesRepo.findByKey('admin');
    if (!adminRole) {
      throw new AppException(ErrorCodes.INTERNAL, 'نقش مدیر در پایگاه داده تعریف نشده است.', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const passwordHash = await hashPassword(dto.password);
    const username = dto.username.trim().toLowerCase();

    const created = await this.db.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [74012002]);
      const count = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL',
      );
      if ((count.rows[0]?.count ?? 0) > 0) {
        throw new AppException(
          ErrorCodes.SETUP_COMPLETED,
          'راه‌اندازی اولیه قبلاً انجام شده است.',
          HttpStatus.FORBIDDEN,
        );
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users
           (username, full_name, role_id, password_hash, is_active, must_change_password, password_changed_at)
         VALUES ($1, $2, $3, $4, true, false, now())
         RETURNING id`,
        [username, dto.fullName.trim(), adminRole.id, passwordHash],
      );
      return { id: inserted.rows[0].id };
    });

    await this.settings.setDefaultWorkshopNameIfEmpty(dto.workshopName, {
      id: created.id,
      username,
    });
    await this.audit.log({
      actor: { id: created.id, username },
      action: AUDIT_ACTIONS.SETUP_COMPLETED,
      entityType: 'user',
      entityId: created.id,
      description: `راه‌اندازی اولیه انجام شد و مدیر کل «${dto.fullName.trim()}» ایجاد شد.`,
      context,
    });
  }

  async login(dto: LoginDto, req: Request): Promise<LoginOutcome> {
    const context = requestContext(req);
    const security = await this.settings.getSecurity();
    const row = await this.usersRepo.findByUsername(dto.username.trim());

    if (!row) {
      await burnPasswordCheck(dto.password);
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        description: `تلاش ناموفق ورود با نام کاربری «${dto.username.trim()}» (کاربر ناشناس).`,
        entityType: 'user',
        entityId: dto.username.trim(),
        context,
      });
      throw new AppException(
        ErrorCodes.INVALID_CREDENTIALS,
        'نام کاربری یا رمز عبور اشتباه است.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((row.locked_until.getTime() - Date.now()) / 60_000));
      await this.audit.log({
        actor: { id: row.id, username: row.username },
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        description: `تلاش ورود به حساب قفل‌شده «${row.username}».`,
        entityType: 'user',
        entityId: row.id,
        metadata: { reason: 'locked', remainingMinutes: minutes },
        context,
      });
      throw new AppException(
        ErrorCodes.ACCOUNT_LOCKED,
        `حساب کاربری به دلیل تلاش‌های ناموفق تا ${minutes} دقیقه دیگر قفل است.`,
        HttpStatus.LOCKED,
      );
    }

    if (!row.is_active) {
      await this.audit.log({
        actor: { id: row.id, username: row.username },
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        description: `تلاش ورود به حساب غیرفعال «${row.username}».`,
        entityType: 'user',
        entityId: row.id,
        metadata: { reason: 'inactive' },
        context,
      });
      throw new AppException(
        ErrorCodes.ACCOUNT_INACTIVE,
        'حساب کاربری شما غیرفعال است. با مدیر سامانه تماس بگیرید.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (row.locked_until) {
      await this.usersRepo.resetExpiredLock(row.id);
    }

    const valid = await verifyPassword(dto.password, row.password_hash);
    if (!valid) {
      const failure = await this.usersRepo.recordLoginFailure(
        row.id,
        security.maxFailedLogins,
        security.lockoutMinutes,
      );
      const locked = Boolean(failure.lockedUntil && failure.lockedUntil.getTime() > Date.now());
      await this.audit.log({
        actor: { id: row.id, username: row.username },
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        description: `رمز عبور اشتباه برای کاربر «${row.username}» (تلاش ${failure.attempts}).`,
        entityType: 'user',
        entityId: row.id,
        metadata: { attempts: failure.attempts, locked },
        context,
      });
      if (locked) {
        await this.audit.log({
          actor: { id: row.id, username: row.username },
          action: AUDIT_ACTIONS.AUTH_LOGIN_LOCKED,
          description: `حساب «${row.username}» پس از ${security.maxFailedLogins} تلاش ناموفق قفل شد.`,
          entityType: 'user',
          entityId: row.id,
          context,
        });
        throw new AppException(
          ErrorCodes.ACCOUNT_LOCKED,
          `تعداد تلاش‌های ناموفق بیش از حد مجاز است. حساب کاربری برای ${security.lockoutMinutes} دقیقه قفل شد.`,
          HttpStatus.LOCKED,
        );
      }
      throw new AppException(
        ErrorCodes.INVALID_CREDENTIALS,
        'نام کاربری یا رمز عبور اشتباه است.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.usersRepo.recordLoginSuccess(row.id);
    const session = await this.createSession(row.id, security.sessionDays, context);
    const accessToken = await this.signAccessToken(row.id, session.sessionId);
    await this.audit.log({
      actor: { id: row.id, username: row.username },
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      description: `کاربر «${row.full_name}» وارد سامانه شد.`,
      entityType: 'user',
      entityId: row.id,
      context,
    });

    return {
      auth: {
        accessToken,
        expiresIn: this.config.accessTokenMinutes * 60,
        user: toPublicUser({ ...row, last_login_at: new Date() }),
      },
      refreshToken: session.refreshToken,
      sessionDays: security.sessionDays,
    };
  }

  async refresh(refreshToken: string | undefined, req: Request): Promise<LoginOutcome> {
    const context = requestContext(req);
    if (!refreshToken) {
      throw new AppException(ErrorCodes.UNAUTHENTICATED, 'نشست شما یافت نشد. دوباره وارد شوید.', HttpStatus.UNAUTHORIZED);
    }
    const tokenHash = hashToken(refreshToken);
    const security = await this.settings.getSecurity();

    const outcome = await this.db.withTransaction(async (client) => {
      const result = await client.query<SessionRow & { password_hash: string }>(
        `SELECT s.*, u.password_hash
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.refresh_token_hash = $1
          FOR UPDATE OF s`,
        [tokenHash],
      );
      const session = result.rows[0];
      if (!session || session.revoked_at || session.expires_at.getTime() <= Date.now()) {
        return null;
      }
      // اعمال سمت سرورِ سیاست بی‌کاری: پس از مدت تعیین‌شده، ادامه نشست بدون
      // رمز عبور ممکن نیست (بازکردن قفل صفحه با رمز، نشست را زنده می‌کند).
      const idleMs = security.idleTimeoutMinutes * 60_000;
      if (Date.now() - session.last_used_at.getTime() > idleMs) {
        return null;
      }
      const userResult = await client.query<UserRow>(
        `SELECT ${USER_SELECT}
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [session.user_id],
      );
      const user = userResult.rows[0];
      if (!user || !user.is_active) return null;

      await client.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'rotated' WHERE id = $1`,
        [session.id],
      );
      const nextToken = generateRefreshToken();
      const expiresAt = new Date(Date.now() + security.sessionDays * 86_400_000);
      const newSession = await client.query<{ id: string }>(
        `INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [user.id, hashToken(nextToken), context.ip, context.userAgent, expiresAt],
      );
      return {
        user,
        refreshToken: nextToken,
        sessionId: newSession.rows[0].id,
      };
    });

    if (!outcome) {
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_REFRESH_REJECTED,
        description: 'درخواست تازه‌سازی نشست با توکن نامعتبر یا منقضی رد شد.',
        context,
      });
      throw new AppException(
        ErrorCodes.SESSION_INVALID,
        'نشست شما منقضی شده است. دوباره وارد شوید.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      auth: {
        accessToken: await this.signAccessToken(outcome.user.id, outcome.sessionId),
        expiresIn: this.config.accessTokenMinutes * 60,
        user: toPublicUser(outcome.user),
      },
      refreshToken: outcome.refreshToken,
      sessionDays: security.sessionDays,
    };
  }

  async logout(user: AuthUser, req: Request): Promise<{ success: true }> {
    await this.db.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout'
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [user.sessionId, user.id],
    );
    await this.audit.log({
      actor: { id: user.id, username: user.username },
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      description: `کاربر «${user.fullName}» از سامانه خارج شد.`,
      entityType: 'user',
      entityId: user.id,
      context: requestContext(req),
    });
    return { success: true };
  }

  async me(userId: string): Promise<{ user: PublicUser; security: { idleTimeoutMinutes: number } }> {
    const row = await this.usersRepo.findById(userId);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const security = await this.settings.getSecurity();
    return { user: toPublicUser(row), security: { idleTimeoutMinutes: security.idleTimeoutMinutes } };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, req: Request): Promise<{ success: true }> {
    const row = await this.usersRepo.findById(user.id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'کاربر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const currentValid = await verifyPassword(dto.currentPassword, row.password_hash);
    if (!currentValid) {
      throw new AppException(
        ErrorCodes.INVALID_PASSWORD,
        'رمز عبور فعلی اشتباه است.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new AppException(
        ErrorCodes.WEAK_PASSWORD,
        'رمز عبور جدید نباید با رمز فعلی یکسان باشد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const policyError = passwordPolicyError(dto.newPassword);
    if (policyError) {
      throw new AppException(ErrorCodes.WEAK_PASSWORD, policyError, HttpStatus.BAD_REQUEST);
    }

    await this.usersRepo.setPassword(user.id, await hashPassword(dto.newPassword), false);
    const revoked = await this.usersRepo.revokeSessions(user.id, 'password_changed', user.sessionId);
    await this.audit.log({
      actor: { id: user.id, username: user.username },
      action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
      description: `کاربر «${user.fullName}» رمز عبور خود را تغییر داد.`,
      entityType: 'user',
      entityId: user.id,
      metadata: { otherSessionsRevoked: revoked },
      context: requestContext(req),
    });
    return { success: true };
  }

  /** بازکردن قفل صفحه پس از بی‌کاری؛ نیازمند رمز عبور و نشست معتبر است */
  async unlock(password: string, refreshToken: string | undefined, req: Request): Promise<LoginOutcome> {
    const context = requestContext(req);
    if (!refreshToken) {
      throw new AppException(ErrorCodes.SESSION_INVALID, 'نشست شما معتبر نیست. دوباره وارد شوید.', HttpStatus.UNAUTHORIZED);
    }
    const session = await this.db.queryOne<SessionRow>(
      `SELECT * FROM sessions
        WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hashToken(refreshToken)],
    );
    if (!session) {
      throw new AppException(ErrorCodes.SESSION_INVALID, 'نشست شما معتبر نیست. دوباره وارد شوید.', HttpStatus.UNAUTHORIZED);
    }
    const row = await this.usersRepo.findById(session.user_id);
    if (!row || !row.is_active) {
      await this.audit.log({
        action: AUDIT_ACTIONS.AUTH_UNLOCK_FAILED,
        description: 'تلاش بازکردن قفل صفحه برای حساب غیرفعال یا حذف‌شده.',
        entityType: 'user',
        entityId: session.user_id,
        context,
      });
      throw new AppException(ErrorCodes.ACCOUNT_INACTIVE, 'حساب کاربری در دسترس نیست.', HttpStatus.FORBIDDEN);
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      await this.audit.log({
        actor: { id: row.id, username: row.username },
        action: AUDIT_ACTIONS.AUTH_UNLOCK_FAILED,
        description: `تلاش ناموفق بازکردن قفل صفحه کاربر «${row.username}».`,
        entityType: 'user',
        entityId: row.id,
        context,
      });
      throw new AppException(ErrorCodes.INVALID_CREDENTIALS, 'رمز عبور اشتباه است.', HttpStatus.UNAUTHORIZED);
    }

    await this.db.query('UPDATE sessions SET last_used_at = now() WHERE id = $1', [session.id]);
    const security = await this.settings.getSecurity();
    await this.audit.log({
      actor: { id: row.id, username: row.username },
      action: AUDIT_ACTIONS.AUTH_UNLOCKED,
      description: `قفل صفحه کاربر «${row.full_name}» باز شد.`,
      entityType: 'user',
      entityId: row.id,
      context,
    });

    return {
      auth: {
        accessToken: await this.signAccessToken(row.id, session.id),
        expiresIn: this.config.accessTokenMinutes * 60,
        user: toPublicUser(row),
      },
      refreshToken,
      sessionDays: security.sessionDays,
    };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const rows = await this.db.query<SessionRow>(
      `SELECT * FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_used_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(user: AuthUser, sessionId: string, req: Request): Promise<{ success: true }> {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = 'revoked_by_user'
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [sessionId, user.id],
    );
    if (rows.length === 0) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'نشست مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    await this.audit.log({
      actor: { id: user.id, username: user.username },
      action: AUDIT_ACTIONS.AUTH_SESSION_REVOKED,
      description: `کاربر «${user.fullName}» یکی از نشست‌های خود را بست.`,
      entityType: 'session',
      entityId: sessionId,
      context: requestContext(req),
    });
    return { success: true };
  }

  async revokeOtherSessions(user: AuthUser, req: Request): Promise<{ revoked: number }> {
    const revoked = await this.usersRepo.revokeSessions(user.id, 'revoked_by_user', user.sessionId);
    await this.audit.log({
      actor: { id: user.id, username: user.username },
      action: AUDIT_ACTIONS.AUTH_SESSION_REVOKED,
      description: `کاربر «${user.fullName}» سایر نشست‌های خود را بست.`,
      entityType: 'user',
      entityId: user.id,
      metadata: { revoked },
      context: requestContext(req),
    });
    return { revoked };
  }

  private async createSession(
    userId: string,
    sessionDays: number,
    context: RequestContext,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + sessionDays * 86_400_000);
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO sessions (user_id, refresh_token_hash, ip, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, hashToken(refreshToken), context.ip, context.userAgent, expiresAt],
    );
    if (!row) throw new AppException(ErrorCodes.INTERNAL, 'ایجاد نشست ناموفق بود.', HttpStatus.INTERNAL_SERVER_ERROR);
    return { sessionId: row.id, refreshToken };
  }

  private async signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'access' },
      { expiresIn: `${this.config.accessTokenMinutes}m` },
    );
  }

  /** پاک‌سازی نشست‌های منقضی؛ در زمان‌بندی روزانه فراخوانی می‌شود */
  async purgeExpiredSessions(): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM sessions
        WHERE expires_at < now() - interval '30 days'
           OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')
        RETURNING id`,
    );
    if (rows.length > 0) this.logger.log(`${rows.length} نشست قدیمی پاک‌سازی شد.`);
    return rows.length;
  }
}
