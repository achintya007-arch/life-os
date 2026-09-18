/**
 * Runs the real Supabase migration inside PGlite (in-process Postgres) with a
 * minimal emulation of Supabase's auth schema and roles. This lets the test
 * suite prove the Row-Level Security and grants — not just the client code —
 * isolate users from each other.
 *
 * The shim deliberately reproduces Supabase's *broad default privileges*
 * (anon/authenticated get ALL on new tables and EXECUTE on new functions), so
 * the tests only pass if the migration explicitly locks everything down.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text unique);

-- Same contract as Supabase: the user id comes from the verified JWT claims.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase's defaults: everything in public is granted to the API roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export async function createTestDatabase(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_SHIM);
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260918000000_accounts_sync.sql'), 'utf8');
  await pg.exec(sql);
  return new TestDb(pg);
}

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** Creates an auth user the way GoTrue would (fires the signup trigger). */
  async createUser(id: string, email: string) {
    await this.pg.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  }

  /** Run `fn` as an API request from `userId` (or anonymously when null). */
  async as<T>(userId: string | null, fn: (q: Querier) => Promise<T>): Promise<T> {
    const role = userId ? 'authenticated' : 'anon';
    const claims = userId ? JSON.stringify({ sub: userId, role }) : '';
    return this.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      await tx.exec(`set local role ${role}`);
      return fn({
        query: async <R>(text: string, params?: unknown[]) => (await tx.query<R>(text, params)).rows,
      });
    });
  }

  /** Superuser query, for assertions about ground truth. */
  async admin<R>(text: string, params?: unknown[]): Promise<R[]> {
    return (await this.pg.query<R>(text, params)).rows;
  }
}

export interface Querier {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
}
