import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** مسیرهایی که بدون ورود قابل دسترسی هستند */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
