import * as crypto from 'node:crypto';

/**
 * رمزنگاری متقارن رمز/الگوی دستگاه با AES-256-GCM.
 * کلید از راز سرور مشتق می‌شود و هر مقدار IV تصادفی خود را دارد.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = crypto.createHash('sha256').update(`device-secret:${secret}`).digest();
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(
      '.',
    );
  }

  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const parts = payload.split('.');
    if (parts.length !== 3) return null;
    try {
      const iv = Buffer.from(parts[0], 'base64url');
      const tag = Buffer.from(parts[1], 'base64url');
      const data = Buffer.from(parts[2], 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
