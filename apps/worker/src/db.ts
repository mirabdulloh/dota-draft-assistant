import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export type Db = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  exec: (sql: string) => Promise<void>;
  close: () => Promise<void>;
  kind: 'pglite' | 'postgres';
};

/**
 * DATABASE_URL points at a real Postgres; without it we run PGlite, which is
 * Postgres 16 compiled to WASM, so the SQL below is identical either way.
 */
export async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url });
    return {
      kind: 'postgres',
      query: async (sql, params) => (await pool.query(sql, params as never[])).rows,
      exec: async (sql) => void (await pool.query(sql)),
      close: () => pool.end(),
    };
  }

  const dir = process.env.PGLITE_DIR ?? new URL('../.data/pg', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const pglite = new PGlite(dir);
  await pglite.waitReady;
  return {
    kind: 'pglite',
    query: async (sql, params) => (await pglite.query(sql, params as never[])).rows as never,
    exec: async (sql) => void (await pglite.exec(sql)),
    close: () => pglite.close(),
  };
}
