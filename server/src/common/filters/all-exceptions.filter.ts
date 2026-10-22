import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException, ErrorCodes } from '../errors/app.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodes.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodes.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL;
    let message = 'خطای غیرمنتظره‌ای در سرور رخ داد. لطفاً دوباره تلاش کنید.';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? `HTTP_${status}`;
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as { message?: string | string[]; error?: string };
        if (Array.isArray(record.message)) {
          code = ErrorCodes.VALIDATION_ERROR;
          message = 'اطلاعات ارسالی معتبر نیست.';
          details = record.message;
        } else if (typeof record.message === 'string') {
          message = record.message;
        }
        if (status === HttpStatus.NOT_FOUND && /^Cannot (GET|POST|PUT|PATCH|DELETE)/.test(message)) {
          message = 'مسیر درخواستی در سرور وجود ندارد.';
        }
      }
    } else if (isDatabaseError(exception)) {
      if (exception.code === '23505') {
        status = HttpStatus.CONFLICT;
        code = ErrorCodes.DUPLICATE;
        message = 'رکوردی با همین مقدار یکتا از قبل وجود دارد.';
      } else if (exception.code === '23503') {
        status = HttpStatus.CONFLICT;
        code = ErrorCodes.CONFLICT;
        message = 'این رکورد به رکوردهای دیگر وابسته است و قابل تغییر نیست.';
      } else {
        this.logger.error(`خطای پایگاه داده: ${exception.message}`, exception.stack);
      }
    } else {
      const error = exception as Error;
      this.logger.error(`خطای پیش‌بینی‌نشده: ${error?.message}`, error?.stack);
    }

    const body: ErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request?.originalUrl ?? request?.url ?? '',
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }
}

function isDatabaseError(value: unknown): value is { code: string; message: string; stack?: string } {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value);
}
