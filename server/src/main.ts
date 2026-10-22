import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_NAME, loadConfig } from './config/configuration';

function mountClient(app: INestApplication, clientDist: string): void {
  const indexHtml = path.join(clientDist, 'index.html');
  if (!fs.existsSync(indexHtml)) return;

  app.use(express.static(clientDist, { index: false, maxAge: '1d' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(indexHtml);
  });
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  mountClient(app, config.clientDist);

  await app.listen(config.port, '0.0.0.0');
  logger.log(`${APP_NAME} روی پورت ${config.port} آماده استفاده است.`);
  logger.log('برای اتصال کلاینت‌های شبکه داخلی از آدرس http://<IP-سرور>:' + config.port + ' استفاده کنید.');
}

void bootstrap();
