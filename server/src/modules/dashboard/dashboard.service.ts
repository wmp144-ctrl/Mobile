import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { APP_VERSION } from '../../config/configuration';
import { CLOSED_STATUS_KEYS, DEVICE_STATUSES } from '../../common/device-status';
import { AuditService, type AuditLogDto } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { DevicesRepository } from '../devices/devices.repository';
import type { DeviceSummaryDto } from '../devices/devices.types';

export interface DashboardOverview {
  stats: {
    usersTotal: number;
    usersActive: number;
    sessionsActive: number;
    rolesTotal: number;
    auditToday: number;
    databaseSize: number;
    devicesTotal: number;
    devicesActive: number;
    devicesReady: number;
    devicesDeliveredToday: number;
    devicesOverdue: number;
    devicesCreatedToday: number;
    customersTotal: number;
  };
  statusBreakdown: { key: string; label: string; tone: string; count: number }[];
  roleDistribution: { roleName: string; roleKey: string; userCount: number }[];
  recentActivity: AuditLogDto[];
  recentDevices: DeviceSummaryDto[];
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
  devices_total: number;
  devices_active: number;
  devices_ready: number;
  devices_delivered_today: number;
  devices_overdue: number;
  devices_created_today: number;
  customers_total: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly devices: DevicesRepository,
  ) {}

  async overview(): Promise<DashboardOverview> {
    const closedList = CLOSED_STATUS_KEYS.map((key) => `'${key}'`).join(', ');
    const stats = await this.db.queryOne<StatsRow>(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users_total,
         (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND is_active) AS users_active,
         (SELECT COUNT(*)::int FROM sessions WHERE revoked_at IS NULL AND expires_at > now()) AS sessions_active,
         (SELECT COUNT(*)::int FROM roles) AS roles_total,
         (SELECT COUNT(*)::int FROM audit_logs WHERE created_at >= date_trunc('day', now())) AS audit_today,
         pg_database_size(current_database())::text AS database_size,
         (SELECT COUNT(*)::int FROM devices) AS devices_total,
         (SELECT COUNT(*)::int FROM devices WHERE status NOT IN (${closedList})) AS devices_active,
         (SELECT COUNT(*)::int FROM devices WHERE status = 'ready_delivery') AS devices_ready,
         (SELECT COUNT(*)::int FROM devices
           WHERE status = 'delivered' AND delivered_at >= date_trunc('day', now())) AS devices_delivered_today,
         (SELECT COUNT(*)::int FROM devices
           WHERE due_at IS NOT NULL AND due_at < now() AND status NOT IN (${closedList})) AS devices_overdue,
         (SELECT COUNT(*)::int FROM devices WHERE created_at >= date_trunc('day', now())) AS devices_created_today,
         (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL) AS customers_total`,
    );
    const distribution = await this.db.query<{ role_name: string; role_key: string; user_count: number }>(
      `SELECT r.name_fa AS role_name, r.key AS role_key, COUNT(u.id)::int AS user_count
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
        GROUP BY r.id
        ORDER BY user_count DESC, r.name_fa ASC`,
    );
    const [recent, settings, statusRows, recentDevices] = await Promise.all([
      this.audit.list({ page: 1, pageSize: 8 }),
      this.settings.getAll(),
      this.devices.countByStatus(),
      this.devices.list({ page: 1, pageSize: 5, sortBy: 'receivedAt', sortDir: 'desc' }),
    ]);
    const counts = new Map(statusRows.map((row) => [row.status, row.count]));

    return {
      stats: {
        usersTotal: stats?.users_total ?? 0,
        usersActive: stats?.users_active ?? 0,
        sessionsActive: stats?.sessions_active ?? 0,
        rolesTotal: stats?.roles_total ?? 0,
        auditToday: stats?.audit_today ?? 0,
        databaseSize: Number(stats?.database_size ?? 0),
        devicesTotal: stats?.devices_total ?? 0,
        devicesActive: stats?.devices_active ?? 0,
        devicesReady: stats?.devices_ready ?? 0,
        devicesDeliveredToday: stats?.devices_delivered_today ?? 0,
        devicesOverdue: stats?.devices_overdue ?? 0,
        devicesCreatedToday: stats?.devices_created_today ?? 0,
        customersTotal: stats?.customers_total ?? 0,
      },
      statusBreakdown: DEVICE_STATUSES.map((status) => ({
        key: status.key,
        label: status.label,
        tone: status.tone,
        count: counts.get(status.key) ?? 0,
      })),
      roleDistribution: distribution.map((row) => ({
        roleName: row.role_name,
        roleKey: row.role_key,
        userCount: row.user_count,
      })),
      recentActivity: recent.items,
      recentDevices: recentDevices.items,
      server: {
        version: APP_VERSION,
        time: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        workshopName: settings.workshop.name,
      },
    };
  }
}
