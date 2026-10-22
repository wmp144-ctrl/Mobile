import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import * as fs from 'node:fs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TEST_DATABASE_URL } from './constants';

export interface AdminCredentials {
  workshopName: string;
  fullName: string;
  username: string;
  password: string;
}

export const ADMIN: AdminCredentials = {
  workshopName: 'تعمیرگاه تست',
  fullName: 'مدیر سامانه',
  username: 'admin',
  password: 'Admin12345',
};

export async function resetDatabase(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  if (process.env.BACKUP_DIR) {
    fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true });
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export function httpServer(app: INestApplication) {
  return app.getHttpServer();
}

export async function setupAdmin(
  app: INestApplication,
  overrides: Partial<AdminCredentials> = {},
): Promise<void> {
  await request(httpServer(app))
    .post('/api/auth/setup')
    .send({ ...ADMIN, ...overrides })
    .expect(201);
}

export async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<{ accessToken: string; userId: string; setCookie: string[] }> {
  const response = await request(httpServer(app))
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);
  const cookies = response.headers['set-cookie'];
  return {
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
    setCookie: Array.isArray(cookies) ? (cookies as string[]) : [String(cookies ?? '')],
  };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function refreshCookie(setCookie: string[]): string {
  const cookie = setCookie.find((item) => item.startsWith('mrb_refresh='));
  if (!cookie) throw new Error('کوکی تازه‌سازی نشست صادر نشد.');
  return cookie.split(';')[0];
}
