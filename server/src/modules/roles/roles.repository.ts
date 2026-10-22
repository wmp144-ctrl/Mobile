import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface RoleRow {
  id: string;
  key: string;
  name_fa: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
  user_count: number;
}

const ROLE_SELECT = `
  r.id, r.key, r.name_fa, r.description, r.permissions, r.is_system,
  r.version, r.created_at, r.updated_at,
  (SELECT COUNT(*)::int FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
`;

@Injectable()
export class RolesRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<RoleRow[]> {
    return this.db.query<RoleRow>(
      `SELECT ${ROLE_SELECT} FROM roles r ORDER BY r.is_system DESC, r.created_at ASC`,
    );
  }

  async findById(id: string): Promise<RoleRow | null> {
    return this.db.queryOne<RoleRow>(`SELECT ${ROLE_SELECT} FROM roles r WHERE r.id = $1`, [id]);
  }

  async findByKey(key: string): Promise<RoleRow | null> {
    return this.db.queryOne<RoleRow>(`SELECT ${ROLE_SELECT} FROM roles r WHERE r.key = $1`, [key]);
  }

  async insert(input: {
    key: string;
    nameFa: string;
    description: string | null;
    permissions: string[];
  }): Promise<RoleRow> {
    const row = await this.db.queryOne<{ id: string }>(
      `INSERT INTO roles (key, name_fa, description, permissions, is_system)
       VALUES ($1, $2, $3, $4::jsonb, false)
       RETURNING id`,
      [input.key, input.nameFa, input.description, JSON.stringify(input.permissions)],
    );
    const created = row ? await this.findById(row.id) : null;
    if (!created) throw new Error('ایجاد نقش ناموفق بود.');
    return created;
  }

  async update(
    id: string,
    version: number,
    changes: { nameFa?: string; description?: string | null; permissions?: string[] },
  ): Promise<RoleRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (changes.nameFa !== undefined) set('name_fa', changes.nameFa);
    if (changes.description !== undefined) set('description', changes.description);
    if (changes.permissions !== undefined) {
      params.push(JSON.stringify(changes.permissions));
      sets.push(`permissions = $${params.length}::jsonb`);
    }

    if (sets.length === 0) return this.findById(id);
    sets.push('version = version + 1', 'updated_at = now()');
    params.push(id, version);
    const updated = await this.db.query<{ id: string }>(
      `UPDATE roles SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND version = $${params.length} AND is_system = false
        RETURNING id`,
      params,
    );
    if (updated.length === 0) return null;
    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM roles WHERE id = $1 AND is_system = false RETURNING id`,
      [id],
    );
    return rows.length > 0;
  }
}
