import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { APP_VERSION } from '../../config/configuration';
import { toPublicUser } from '../users/user.types';
import { AuditService, type AuditLogDto } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

export interface DashboardOverview {
  stats: {
    usersTotal: number;
    usersActive: number;
    sessionsActive: number;
    rolesTotal: number;
    auditToday: number;
    databaseSize: number;
  };
  roleDistribution: { roleName: string; roleKey: string; userCount: number }[];
  recentActivity: AuditLogDto[];
  server: {
    version: string;
    time: string;
    uptimeSeconds: number;
    workshopName: string;
  };
}

interface StatsRow {
  users_total: number;
  users_active: number;
  sessions_active: number;
  roles_total: number;
  audit_today: number;
  database_size: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async overview(): Promise<DashboardOverview> {
    const stats = await this.db.queryOne<StatsRow>(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users_total,
         (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND is_active) AS users_active,
         (SELECT COUNT(*)::int FROM sessions WHERE revoked_at IS NULL AND expires_at > now()) AS sessions_active,
         (SELECT COUNT(*)::int FROM roles) AS roles_total,
         (SELECT COUNT(*)::int FROM audit_logs WHERE created_at >= date_trunc('day', now())) AS audit_today,
         pg_database_size(current_database())::text AS database_size`,
    );
    const distribution = await this.db.query<{ role_name: string; role_key: string; user_count: number }>(
      `SELECT r.name_fa AS role_name, r.key AS role_key, COUNT(u.id)::int AS user_count
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
        GROUP BY r.id
        ORDER BY user_count DESC, r.name_fa ASC`,
    );
    const recent = await this.audit.list({ page: 1, pageSize: 8 });
    const settings = await this.settings.getAll();

    return {
      stats: {
        usersTotal: stats?.users_total ?? 0,
        usersActive: stats?.users_active ?? 0,
        sessionsActive: stats?.sessions_active ?? 0,
        rolesTotal: stats?.roles_total ?? 0,
        auditToday: stats?.audit_today ?? 0,
        databaseSize: Number(stats?.database_size ?? 0),
      },
      roleDistribution: distribution.map((row) => ({
        roleName: row.role_name,
        roleKey: row.role_key,
        userCount: row.user_count,
      })),
      recentActivity: recent.items,
      server: {
        version: APP_VERSION,
        time: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        workshopName: settings.workshop.name,
      },
    };
  }
}
