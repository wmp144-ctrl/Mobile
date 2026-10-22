import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import { REFRESH_COOKIE } from './auth.types';
import { ChangePasswordDto, LoginDto, SetupDto, UnlockDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('setup')
  @HttpCode(201)
  async setup(@Body() dto: SetupDto, @Req() req: Request) {
    await this.auth.setup(dto, req);
    return { success: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.login(dto, req);
    this.setRefreshCookie(res, outcome.refreshToken, outcome.sessionDays);
    return outcome.auth;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const outcome = await this.auth.refresh(readRefreshCookie(req), req);
      this.setRefreshCookie(res, outcome.refreshToken, outcome.sessionDays);
      return outcome.auth;
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('unlock')
  @HttpCode(200)
  async unlock(
    @Body() dto: UnlockDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.auth.unlock(dto.password, readRefreshCookie(req), req);
    this.setRefreshCookie(res, outcome.refreshToken, outcome.sessionDays);
    return outcome.auth;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logout(user, req);
    this.clearRefreshCookie(res);
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(user, dto, req);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOthers(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.revokeOtherSessions(user, req);
  }

  @Delete('sessions/:id')
  revokeSession(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.auth.revokeSession(user, id, req);
  }

  private setRefreshCookie(res: Response, token: string, sessionDays: number): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions(sessionDays * 86_400_000));
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions(0));
  }

  private cookieOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge,
    };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}
