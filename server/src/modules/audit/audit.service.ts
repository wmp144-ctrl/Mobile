import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { RequestContext } from '../../common/http/request-context';
import { buildPage, resolvePagination, type PageResult } from '../../common/utils/pagination';
import type { AuditQueryDto } from './audit.dto';
import { auditActionLabel } from './audit.actions';

export interface AuditActor {
  id: string;
  username: string;
}

export interface AuditEntry {
  actor?: AuditActor | null;
  action: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  context?: RequestContext;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * ثبت رویداد هرگز نباید عملیات اصلی را با شکست مواجه کند؛
   * خطای ثبت در لاگ سرور باقی می‌ماند.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_logs
           (user_id, username, action, entity_type, entity_id, description, metadata, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.actor?.id ?? null,
          entry.actor?.username ?? null,
          entry.action,
          entry.entityType ?? null,
          entry.entityId ?? null,
          entry.description,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.context?.ip ?? null,
          entry.context?.userAgent ?? null,
        ],
      );
    } catch (error) {
      this.logger.error(`ثبت تاریخچه تغییرات ناموفق بود: ${(error as Error).message}`);
    }
  }

  async list(query: AuditQueryDto): Promise<PageResult<AuditLogDto>> {
    const request = resolvePagination(query.page, query.pageSize);
    const search = query.search?.trim() || null;
    const action = query.action?.trim() || null;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const where = `
      WHERE ($1::text IS NULL
             OR al.username ILIKE '%' || $1 || '%'
             OR al.description ILIKE '%' || $1 || '%'
             OR al.action ILIKE '%' || $1 || '%'
             OR COALESCE(al.entity_id, '') = $1)
        AND ($2::text IS NULL OR al.action = $2)
        AND ($3::timestamptz IS NULL OR al.created_at >= $3)
        AND ($4::timestamptz IS NULL OR al.created_at < $4)
    `;
    const params = [search, action, from, to];

    const totalRow = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_logs al ${where}`,
      params,
    );
    const rows = await this.db.query<AuditRow>(
      `SELECT al.id::text, al.user_id, al.username, al.action, al.entity_type, al.entity_id,
              al.description, al.metadata, al.ip, al.user_agent, al.created_at
         FROM audit_logs al
         ${where}
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT $5 OFFSET $6`,
      [...params, request.pageSize, request.offset],
    );

    const items = rows.map(mapAuditRow);
    return buildPage(items, Number(totalRow?.count ?? 0), request);
  }

  async actionSummary(): Promise<{ key: string; label: string; count: number }[]> {
    const rows = await this.db.query<{ action: string; count: string }>(
      `SELECT action, COUNT(*)::text AS count FROM audit_logs GROUP BY action ORDER BY action`,
    );
    return rows.map((row) => ({
      key: row.action,
      label: auditActionLabel(row.action),
      count: Number(row.count),
    }));
  }
}

function mapAuditRow(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    actionLabel: auditActionLabel(row.action),
    entityType: row.entity_type,
    entityId: row.entity_id,
    description: row.description,
    metadata: row.metadata,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
  };
}
