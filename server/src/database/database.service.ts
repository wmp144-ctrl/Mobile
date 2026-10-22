import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { runMigrations } from './migration-runner';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      application_name: 'repair-workshop',
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on('error', (error) => {
      this.logger.error(`خطای اتصال پایگاه داده: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.waitForDatabase();
    if (this.config.dbAutoMigrate) {
      const applied = await runMigrations(this.pool);
      if (applied.length > 0) {
        this.logger.log(`مهاجرت‌های اجراشده: ${applied.join(', ')}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  getPool(): Pool {
    return this.pool;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result: QueryResult<T> = await this.pool.query<T>(sql, params as unknown[]);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async waitForDatabase(): Promise<void> {
    const attempts = 30;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.pool.query('SELECT 1');
        this.logger.log('اتصال به پایگاه داده برقرار شد.');
        return;
      } catch (error) {
        if (attempt === attempts) {
          throw new Error(`اتصال به پایگاه داده ممکن نشد: ${(error as Error).message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
}
