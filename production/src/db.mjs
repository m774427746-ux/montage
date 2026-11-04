import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function database(url) {
  if (!url) throw Error('DATABASE_URL is required; configure a local environment file');
  return new pg.Pool({ connectionString: url, max: 12, options: '-c search_path=production,public', connectionTimeoutMillis: 5000 });
}
export async function transaction(pool, fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
export async function migrate(pool) {
  await transaction(pool, async c => {
    await c.query('SELECT pg_advisory_xact_lock(712731)');
    await c.query(await readFile(new URL('../migrations/001.sql',import.meta.url),'utf8'));
  });
}
