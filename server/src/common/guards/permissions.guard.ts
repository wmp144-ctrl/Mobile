import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppException, ErrorCodes } from '../errors/app.exception';
import { hasPermission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        ErrorCodes.UNAUTHENTICATED,
        'برای این عملیات باید وارد حساب کاربری شوید.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const permitted = required.every((permission) => hasPermission(user.permissions, permission));
    if (!permitted) {
      throw new AppException(
        ErrorCodes.FORBIDDEN,
        'شما مجوز لازم برای انجام این عملیات را ندارید.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
