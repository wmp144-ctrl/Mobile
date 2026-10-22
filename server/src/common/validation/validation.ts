import { BadRequestException, ValidationError } from '@nestjs/common';
import { Transform } from 'class-transformer';

/** رشته خالی (فیلد اختیاری که کاربر پر نکرده) را ناموجود در نظر می‌گیرد */
export function EmptyToUndefined(): PropertyDecorator {
  return Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        messages.push(localizeMessage(field, message));
      }
    }
    if (error.children && error.children.length > 0) {
      messages.push(...flattenValidationErrors(error.children, field));
    }
  }
  return [...new Set(messages)];
}

function localizeMessage(field: string, message: string): string {
  if (/should not exist/i.test(message)) return `فیلد «${field}» در این درخواست مجاز نیست.`;
  if (/must be (a|an) |must be one of/i.test(message)) return `مقدار فیلد «${field}» معتبر نیست.`;
  return message;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = flattenValidationErrors(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: messages.length > 0 ? messages : ['اطلاعات ارسالی معتبر نیست.'],
  });
}
