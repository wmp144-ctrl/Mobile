import { Injectable } from '@nestjs/common';
import { APP_NAME, APP_VERSION } from '../../config/configuration';
import { DatabaseService } from '../../database/database.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SystemService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  async publicInfo() {
    const userCount = await this.db.queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users WHERE deleted_at IS NULL',
    );
    const settings = await this.settings.getAll();
    return {
      needsSetup: Number(userCount?.count ?? 0) === 0,
      appName: APP_NAME,
      version: APP_VERSION,
      workshopName: settings.workshop.name,
      workshopLogo: settings.workshop.logo,
      appearance: settings.appearance,
      serverTime: new Date().toISOString(),
    };
  }

  async health() {
    let database = 'down';
    try {
      await this.db.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  }
}
