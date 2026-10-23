import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AuditActor } from '../audit/audit.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import type { UpdateSettingsDto } from './settings.dto';

export interface WorkshopSettings {
  name: string;
  address: string;
  phone: string;
  logo: string;
}

export interface SecuritySettings {
  idleTimeoutMinutes: number;
  maxFailedLogins: number;
  lockoutMinutes: number;
  sessionDays: number;
}

export interface BackupSettings {
  retentionCount: number;
}

export interface DeviceSettings {
  intakePrefix: string;
  defaultDueDays: number;
}

export interface StorageSettings {
  folderLayout: string;
  subfolders: string[];
  lowSpaceGb: number;
}

export interface FullSettings {
  workshop: WorkshopSettings;
  security: SecuritySettings;
  backup: BackupSettings;
  devices: DeviceSettings;
  storage: StorageSettings;
}

const DEFAULT_WORKSHOP: WorkshopSettings = { name: '', address: '', phone: '', logo: '' };
const DEFAULT_SECURITY: SecuritySettings = {
  idleTimeoutMinutes: 10,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
  sessionDays: 7,
};
const DEFAULT_BACKUP: BackupSettings = { retentionCount: 14 };
const DEFAULT_DEVICES: DeviceSettings = { intakePrefix: 'MR', defaultDueDays: 3 };
const DEFAULT_SUBFOLDERS = ['Original', 'Backup', 'Recovered', 'Reports', 'Images', 'Documents'];
const DEFAULT_STORAGE: StorageSettings = {
  folderLayout: '{year}/{intakeCode}',
  subfolders: DEFAULT_SUBFOLDERS,
  lowSpaceGb: 5,
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getAll(): Promise<FullSettings> {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM app_settings',
    );
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const num = (key: string, fallback: number): number => {
      const value = map.get(key);
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };
    const str = (key: string, fallback: string): string => {
      const value = map.get(key);
      return typeof value === 'string' ? value : fallback;
    };

    return {
      workshop: {
        name: str('workshop.name', DEFAULT_WORKSHOP.name),
        address: str('workshop.address', DEFAULT_WORKSHOP.address),
        phone: str('workshop.phone', DEFAULT_WORKSHOP.phone),
        logo: str('workshop.logo', DEFAULT_WORKSHOP.logo),
      },
      security: {
        idleTimeoutMinutes: num('security.idleTimeoutMinutes', DEFAULT_SECURITY.idleTimeoutMinutes),
        maxFailedLogins: num('security.maxFailedLogins', DEFAULT_SECURITY.maxFailedLogins),
        lockoutMinutes: num('security.lockoutMinutes', DEFAULT_SECURITY.lockoutMinutes),
        sessionDays: num('security.sessionDays', DEFAULT_SECURITY.sessionDays),
      },
      backup: {
        retentionCount: num('backup.retentionCount', DEFAULT_BACKUP.retentionCount),
      },
      devices: {
        intakePrefix: str('devices.intakePrefix', DEFAULT_DEVICES.intakePrefix) || DEFAULT_DEVICES.intakePrefix,
        defaultDueDays: num('devices.defaultDueDays', DEFAULT_DEVICES.defaultDueDays),
      },
      storage: {
        folderLayout: str('storage.folderLayout', DEFAULT_STORAGE.folderLayout) || DEFAULT_STORAGE.folderLayout,
        subfolders: Array.isArray(map.get('storage.subfolders'))
          ? (map.get('storage.subfolders') as unknown[]).filter(
              (item): item is string => typeof item === 'string' && item.trim().length > 0,
            )
          : DEFAULT_STORAGE.subfolders,
        lowSpaceGb: num('storage.lowSpaceGb', DEFAULT_STORAGE.lowSpaceGb),
      },
    };
  }

  async getSecurity(): Promise<SecuritySettings> {
    const settings = await this.getAll();
    return settings.security;
  }

  async update(dto: UpdateSettingsDto, actor: AuditActor): Promise<FullSettings> {
    const entries: Array<[string, unknown]> = [];
    if (dto.workshopName !== undefined) entries.push(['workshop.name', dto.workshopName.trim()]);
    if (dto.workshopAddress !== undefined) entries.push(['workshop.address', dto.workshopAddress.trim()]);
    if (dto.workshopPhone !== undefined) entries.push(['workshop.phone', dto.workshopPhone.trim()]);
    if (dto.workshopLogo !== undefined) entries.push(['workshop.logo', dto.workshopLogo.trim()]);
    if (dto.idleTimeoutMinutes !== undefined) entries.push(['security.idleTimeoutMinutes', dto.idleTimeoutMinutes]);
    if (dto.maxFailedLogins !== undefined) entries.push(['security.maxFailedLogins', dto.maxFailedLogins]);
    if (dto.lockoutMinutes !== undefined) entries.push(['security.lockoutMinutes', dto.lockoutMinutes]);
    if (dto.sessionDays !== undefined) entries.push(['security.sessionDays', dto.sessionDays]);
    if (dto.backupRetentionCount !== undefined) entries.push(['backup.retentionCount', dto.backupRetentionCount]);
    if (dto.intakePrefix !== undefined) {
      entries.push(['devices.intakePrefix', dto.intakePrefix.trim().toUpperCase()]);
    }
    if (dto.defaultDueDays !== undefined) entries.push(['devices.defaultDueDays', dto.defaultDueDays]);
    if (dto.storageFolderLayout !== undefined) {
      entries.push(['storage.folderLayout', dto.storageFolderLayout.trim()]);
    }
    if (dto.storageSubfolders !== undefined) {
      entries.push(['storage.subfolders', dto.storageSubfolders.map((item) => item.trim())]);
    }
    if (dto.storageLowSpaceGb !== undefined) entries.push(['storage.lowSpaceGb', dto.storageLowSpaceGb]);

    if (entries.length > 0) {
      await this.db.withTransaction(async (client) => {
        for (const [key, value] of entries) {
          await client.query(
            `INSERT INTO app_settings (key, value, updated_at, updated_by)
             VALUES ($1, $2::jsonb, now(), $3)
             ON CONFLICT (key) DO UPDATE
               SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [key, JSON.stringify(value), actor.id],
          );
        }
      });

      await this.audit.log({
        actor,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'settings',
        description: 'تنظیمات سامانه تغییر کرد.',
        metadata: { changedKeys: entries.map(([key]) => key) },
      });
    }

    return this.getAll();
  }

  async setDefaultWorkshopNameIfEmpty(name: string, actor: AuditActor): Promise<void> {
    const current = await this.getAll();
    if (current.workshop.name.trim()) return;
    await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ('workshop.name', $1::jsonb, now(), $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(name), actor.id],
    );
  }
}
