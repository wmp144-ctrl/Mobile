declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    databaseDir?: string;
    user?: string;
    password?: string;
    port?: number;
    persistent?: boolean;
  }

  export default class EmbeddedPostgres {
    constructor(options?: Partial<EmbeddedPostgresOptions>);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
    getPgClient(database?: string, host?: string): unknown;
  }
}
