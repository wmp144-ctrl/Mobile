import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** مقایسه ساختگی برای یکسان‌سازی زمان پاسخ وقتی نام کاربری وجود ندارد */
export async function burnPasswordCheck(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} نویسه باشد.`;
  }
  if (password.length > 128) {
    return 'رمز عبور نمی‌تواند بیش از ۱۲۸ نویسه باشد.';
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'رمز عبور باید حداقل یک حرف انگلیسی داشته باشد.';
  }
  if (!/[0-9]/.test(password)) {
    return 'رمز عبور باید حداقل یک رقم داشته باشد.';
  }
  return null;
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
