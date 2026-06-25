declare module 'better-sqlite3' {
  namespace Database {
    interface Statement { run(params?: unknown): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; }
    interface Database { prepare(sql: string): Statement; pragma(source: string, options?: { simple?: boolean }): unknown; transaction<T extends (...args: never[]) => unknown>(fn: T): T; close(): void; }
  }
  interface DatabaseConstructor { new(path: string): Database.Database; (path: string): Database.Database; }
  const Database: DatabaseConstructor;
  export = Database;
}
