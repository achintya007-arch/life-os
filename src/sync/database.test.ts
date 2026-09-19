/**
 * Server-side authorization boundaries, tested against the real migration in
 * real Postgres. These are the guarantees that must hold even if a client is
 * malicious and talks to the database API directly.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDb } from './testing/pgHarness';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const ev = (id: string, type = 'quest.created', extra: Record<string, unknown> = {}) => ({
  id,
  at: '2026-09-18T10:00:00.000Z',
  type,
  ...extra,
});

async function push(db: TestDb, user: string | null, events: unknown[], device = 'dev-1') {
  return db.as(user, (q) =>
    q.query<{ event_id: string; seq: string }>('select * from public.push_events($1::jsonb, $2)', [JSON.stringify(events), device]),
  );
}

const seqOf = (rows: { event_id: string; seq: string | number }[]) =>
  Object.fromEntries(rows.map((r) => [r.event_id, Number(r.seq)]));

describe('database authorization (RLS + grants)', () => {
  let db: TestDb;

  // One Postgres instance for the file; every test starts from empty tables.
  beforeAll(async () => {
    db = await createTestDatabase();
  }, 60_000);

  beforeEach(async () => {
    await db.admin('truncate auth.users, public.profiles, public.game_events, public.sync_state');
    await db.createUser(A, 'a@example.test');
    await db.createUser(B, 'b@example.test');
  });

  it('bootstraps a profile and sync counter for every new user', async () => {
    const profiles = await db.admin<{ user_id: string }>('select user_id from public.profiles order by user_id');
    expect(profiles.map((p) => p.user_id)).toEqual([A, B]);
  });

  it('assigns independent, gap-free per-user sequences', async () => {
    const a = seqOf(await push(db, A, [ev('a1'), ev('a2'), ev('a3')]));
    const b = seqOf(await push(db, B, [ev('b1'), ev('b2')]));
    expect(a).toEqual({ a1: 1, a2: 2, a3: 3 });
    expect(b).toEqual({ b1: 1, b2: 2 });
  });

  it('USER A can never read USER B’s events, profile or sync state', async () => {
    await push(db, A, [ev('a1'), ev('a2')]);
    await push(db, B, [ev('b1', 'character.created', { name: 'Secret B' })]);

    const aSees = await db.as(A, (q) => q.query<{ event_id: string }>('select event_id from public.game_events'));
    expect(aSees.map((r) => r.event_id).sort()).toEqual(['a1', 'a2']);

    const aProbesB = await db.as(A, (q) =>
      q.query('select * from public.game_events where user_id = $1', [B]),
    );
    expect(aProbesB).toHaveLength(0);

    const aProfiles = await db.as(A, (q) => q.query<{ user_id: string }>('select user_id from public.profiles'));
    expect(aProfiles.map((p) => p.user_id)).toEqual([A]);

    const aSync = await db.as(A, (q) => q.query<{ user_id: string }>('select user_id from public.sync_state'));
    expect(aSync.map((p) => p.user_id)).toEqual([A]);

    const bSees = await db.as(B, (q) => q.query<{ event_id: string }>('select event_id from public.game_events'));
    expect(bSees.map((r) => r.event_id)).toEqual(['b1']);
  });

  it('clients cannot write the event log directly — not even their own rows', async () => {
    await push(db, A, [ev('a1')]);
    const payload = JSON.stringify(ev('forged'));
    await expect(
      db.as(A, (q) =>
        q.query(`insert into public.game_events (user_id, event_id, seq, type, at, payload) values ($1, 'forged', 99, 'quest.created', now(), $2::jsonb)`, [A, payload]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as(A, (q) =>
        q.query(`insert into public.game_events (user_id, event_id, seq, type, at, payload) values ($1, 'forged', 99, 'quest.created', now(), $2::jsonb)`, [B, payload]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as(A, (q) => q.query(`update public.game_events set seq = 42`))).rejects.toThrow(/permission denied/);
    await expect(db.as(A, (q) => q.query(`delete from public.game_events`))).rejects.toThrow(/permission denied/);
    await expect(db.as(A, (q) => q.query(`update public.sync_state set last_seq = 0`))).rejects.toThrow(/permission denied/);

    const truth = await db.admin<{ n: number }>('select count(*)::int as n from public.game_events');
    expect(truth[0]!.n).toBe(1);
  });

  it('pushes always land in the caller’s own log, whatever the payload claims', async () => {
    await push(db, A, [{ ...ev('sneaky'), user_id: B }]);
    const owner = await db.admin<{ user_id: string }>(`select user_id from public.game_events where event_id = 'sneaky'`);
    expect(owner.map((o) => o.user_id)).toEqual([A]);
  });

  it('a user can rename only their own profile', async () => {
    await db.as(A, (q) => q.query(`update public.profiles set display_name = 'Hero A' where user_id = $1`, [A]));
    await db.as(A, (q) => q.query(`update public.profiles set display_name = 'Hijacked' where user_id = $1`, [B]));
    const rows = await db.admin<{ user_id: string; display_name: string | null }>(
      'select user_id, display_name from public.profiles order by user_id',
    );
    expect(rows).toEqual([
      { user_id: A, display_name: 'Hero A' },
      { user_id: B, display_name: null },
    ]);
    await expect(db.as(A, (q) => q.query(`update public.profiles set user_id = $1`, [B]))).rejects.toThrow(/permission denied/);
  });

  it('anonymous requests can neither read nor push', async () => {
    await push(db, A, [ev('a1')]);
    await expect(db.as(null, (q) => q.query('select * from public.game_events'))).rejects.toThrow(/permission denied/);
    await expect(push(db, null, [ev('x')])).rejects.toThrow(/permission denied/);
    await expect(db.as(null, (q) => q.query('select public.delete_my_account()'))).rejects.toThrow(/permission denied/);
  });

  it('an authenticated role without a user id is refused', async () => {
    await expect(
      db.pg.transaction(async (tx) => {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select * from public.push_events('[]'::jsonb, null)`);
      }),
    ).rejects.toThrow(/not authenticated/);
  });

  it('push is idempotent: retries and in-batch duplicates never create copies', async () => {
    await push(db, A, [ev('a1'), ev('a2')]);
    // The response to the first push was "lost"; the device retries with one more event.
    const retry = seqOf(await push(db, A, [ev('a1'), ev('a2'), ev('a3'), ev('a3')]));
    expect(retry).toEqual({ a1: 1, a2: 2, a3: 3 });
    const rows = await db.admin<{ n: number; max: number }>(
      `select count(*)::int as n, max(seq)::int as max from public.game_events where user_id = $1`,
      [A],
    );
    expect(rows[0]).toEqual({ n: 3, max: 3 });
  });

  it('rejects unknown event types, oversized payloads and oversized batches', async () => {
    await expect(push(db, A, [ev('bad', 'hack.everything')])).rejects.toThrow(/game_events_known_type/);
    await expect(push(db, A, [ev('big', 'quest.created', { blob: 'x'.repeat(20_000) })])).rejects.toThrow(/payload_size/);
    await expect(push(db, A, Array.from({ length: 501 }, (_, i) => ev(`e${i}`)))).rejects.toThrow(/too many events/);
    // A failed push is atomic: nothing from it was written, and the counter didn't move.
    const [row] = await db.admin<{ last_seq: number }>('select last_seq::int from public.sync_state where user_id = $1', [A]);
    expect(row!.last_seq).toBe(0);
  });

  it('accepts every event type the engine can produce, and nothing else', async () => {
    const { EVENT_TYPES } = await import('../engine/validate');
    const events = EVENT_TYPES.map((type, i) => ev(`t${i}`, type));
    const rows = await push(db, A, events);
    expect(rows).toHaveLength(EVENT_TYPES.length);
    await expect(push(db, A, [ev('nope', 'daily.hacked')])).rejects.toThrow(/game_events_known_type/);
  });

  it('delete_my_account erases exactly the caller — and nobody else', async () => {
    await push(db, A, [ev('a1'), ev('a2')]);
    await push(db, B, [ev('b1')]);
    await db.as(A, (q) => q.query('select public.delete_my_account()'));

    const users = await db.admin<{ id: string }>('select id from auth.users');
    expect(users.map((u) => u.id)).toEqual([B]);
    const events = await db.admin<{ user_id: string }>('select distinct user_id from public.game_events');
    expect(events.map((e) => e.user_id)).toEqual([B]);
    const profiles = await db.admin<{ user_id: string }>('select user_id from public.profiles');
    expect(profiles.map((p) => p.user_id)).toEqual([B]);
  });

  it('internal trigger function is not callable by API roles', async () => {
    await expect(db.as(A, (q) => q.query('select public.handle_new_user()'))).rejects.toThrow();
  });
});
