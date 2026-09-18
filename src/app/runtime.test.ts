import { describe, expect, it } from 'vitest';
import { buildDemoHistory } from '../dev/seed';
import { replay } from '../engine/project';
import { listBackups, readBackup } from '../store/backups';
import { MemoryStorage } from '../store/keyValue';
import { accountCacheKey } from '../sync/accountStore';
import { GUEST_SAVE_KEY, readMode } from '../sync/deviceSession';
import { executeLink, inspectLink } from '../sync/migration';
import { FakeCloud, fakeCloudApi } from '../sync/testing/fakeCloud';
import { Runtime } from './runtime';

const alice = { userId: 'user-alice', email: 'alice@example.test' };
const bob = { userId: 'user-bob', email: 'bob@example.test' };

function setup(storage = new MemoryStorage(), cloud = new FakeCloud()) {
  const api = fakeCloudApi(cloud);
  const runtime = new Runtime(storage, api, 'device-1').boot();
  return { storage, cloud, api, runtime };
}

/** The full sign-in path the UI drives: authenticate → inspect → link → enter. */
async function signIn(t: ReturnType<typeof setup>, user: typeof alice, choice?: 'merge' | 'keep-account') {
  t.api.user = user;
  const transport = await t.api.transport();
  const guestEvents = t.runtime.mode.kind === 'guest' ? [...t.runtime.store.getEvents()] : [];
  const plan = await inspectLink(guestEvents, transport);
  const pick = choice ?? (plan.kind === 'upload' ? 'upload' : 'adopt');
  await executeLink({ storage: t.storage, transport, ...user, deviceId: 'device-1', guestEvents, plan, choice: pick });
  t.runtime.enterAccount(user);
  await t.runtime.sync();
}

describe('guest mode', () => {
  it('works with no account and no cloud at all', () => {
    const storage = new MemoryStorage();
    const runtime = new Runtime(storage, { ...fakeCloudApi(new FakeCloud()), available: false }, 'd').boot();
    expect(runtime.status()).toEqual({ kind: 'guest' });
    expect(runtime.store.dispatch({ type: 'createCharacter', name: 'Guest' }).ok).toBe(true);
    expect(storage.getItem(GUEST_SAVE_KEY)).toContain('Guest');
  });
});

describe('account lifecycle on one device', () => {
  it('guest plays, links an account, and keeps every bit of progress', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    const before = t.runtime.store.getState();
    const gen = t.runtime.generation;

    await signIn(t, alice);
    expect(t.runtime.generation).toBeGreaterThan(gen);
    expect(t.runtime.mode).toEqual({ kind: 'account', ...alice });
    expect(t.runtime.store.getState()).toEqual(before);
    expect(t.runtime.status()).toMatchObject({ kind: 'account', email: alice.email, connected: true, phase: 'idle', pending: 0 });
    expect(t.api.profileNames.get(alice.userId)).toBe('Alice');
  });

  it('signing out removes the account’s data from the device and returns to a fresh guest', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);

    const { backupId } = await t.runtime.signOut();
    expect(backupId).toBeNull(); // everything was already in the cloud
    expect(t.runtime.mode.kind).toBe('guest');
    expect(t.runtime.store.getState().character).toBeNull();
    expect(t.storage.getItem(accountCacheKey(alice.userId))).toBeNull();
    expect(readMode(t.storage).kind).toBe('guest');
    expect(t.cloud.eventsOf(alice.userId)).toHaveLength(1); // the cloud keeps it, of course
  });

  it('signing out while offline preserves unsynced progress as a backup', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);
    t.cloud.offline = true;
    t.runtime.store.dispatch({ type: 'createQuest', quest: { title: 'Offline quest', tier: 'tiny', attribute: 'VIT', cadence: 'once' } });
    expect(t.runtime.unsyncedCount()).toBe(1);

    const { backupId } = await t.runtime.signOut();
    expect(backupId).not.toBeNull();
    const saved = readBackup(t.storage, backupId!);
    expect(replay(saved).questOrder).toHaveLength(1);
    expect(listBackups(t.storage)[0]!.label).toContain(alice.email);
  });

  it('switching accounts on a shared device shows each player only their own world', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);
    await t.runtime.signOut();

    await signIn(t, bob);
    expect(t.runtime.store.getState().character).toBeNull();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Bob' });
    await t.runtime.sync();
    expect(t.cloud.eventsOf(bob.userId).map((e) => e.type)).toEqual(['character.created']);
    expect(JSON.stringify(t.cloud.eventsOf(alice.userId))).not.toContain('Bob');

    await t.runtime.signOut();
    await signIn(t, alice);
    expect(t.runtime.store.getState().character?.name).toBe('Alice');
  });

  it('boots offline into the cached account and plays before the cloud answers', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);

    // App restarts with no connectivity.
    t.cloud.offline = true;
    const again = new Runtime(t.storage, t.api, 'device-1').boot();
    expect(again.store.getState().character?.name).toBe('Alice');
    again.store.dispatch({ type: 'createQuest', quest: { title: 'Q', tier: 'tiny', attribute: 'VIT', cadence: 'once' } });
    await again.sync();
    expect(again.status()).toMatchObject({ phase: 'offline', pending: 1 });
    t.cloud.offline = false;
    await again.sync();
    expect(again.status()).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('an expired session keeps the game playable and queues progress', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);
    t.api.user = null; // token expired / revoked elsewhere
    const again = new Runtime(t.storage, t.api, 'device-1').boot();
    await again.connect();
    expect(again.status()).toMatchObject({ kind: 'account', connected: false });
    expect(again.store.dispatch({ type: 'renameCharacter', name: 'Still Alice' }).ok).toBe(true);
    expect(again.unsyncedCount()).toBe(1);
  });

  it('delete account erases the cloud data — and does nothing locally if it fails', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);

    t.api.deleteFails = true;
    await expect(t.runtime.deleteAccount()).rejects.toThrow();
    expect(t.runtime.mode.kind).toBe('account');
    expect(t.runtime.store.getState().character?.name).toBe('Alice');

    t.api.deleteFails = false;
    await t.runtime.deleteAccount();
    expect(t.cloud.eventsOf(alice.userId)).toEqual([]);
    expect(t.runtime.mode.kind).toBe('guest');
    expect(t.storage.getItem(accountCacheKey(alice.userId))).toBeNull();
  });

  it('recovers from a corrupted account cache by keeping a copy and rebuilding from the cloud', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);
    t.storage.setItem(accountCacheKey(alice.userId), '{broken');

    const again = new Runtime(t.storage, t.api, 'device-1').boot();
    expect(again.recoveredCorruptSave).toBe(true);
    expect(t.storage.keys().some((k) => k.includes('.corrupt.'))).toBe(true);
    await again.sync();
    expect(again.store.getState().character?.name).toBe('Alice');
  });
});

describe('import & restore', () => {
  const demo = () => buildDemoHistory(new Date('2026-09-17T19:00:00'));

  it('guest import can replace, and the replaced save is backed up and restorable', () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Original' });
    const { backupId } = t.runtime.importEvents(demo(), 'replace');
    expect(t.runtime.store.getState().character?.name).toBe('Achintya');
    t.runtime.restoreBackup(backupId!);
    expect(t.runtime.store.getState().character?.name).toBe('Original');
  });

  it('an import never overwrites an account: it can only merge, keeping the account character', async () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Alice' });
    await signIn(t, alice);

    expect(() => t.runtime.importEvents(demo(), 'replace')).toThrow(/only be merged/);
    const { added } = t.runtime.importEvents(demo(), 'merge');
    expect(added).toBeGreaterThan(0);
    expect(t.runtime.store.getState().character?.name).toBe('Alice');
    expect(t.runtime.store.getState().totalXp).toBe(replay(demo()).totalXp);

    // Importing the same file twice adds nothing.
    expect(t.runtime.importEvents(demo(), 'merge').added).toBe(0);
    await t.runtime.sync();
    expect(t.runtime.unsyncedCount()).toBe(0);
  });

  it('new guest game backs up the old save instead of destroying it', () => {
    const t = setup();
    t.runtime.store.dispatch({ type: 'createCharacter', name: 'Old Hero' });
    const backupId = t.runtime.newGuestGame();
    expect(t.runtime.store.getState().character).toBeNull();
    expect(replay(readBackup(t.storage, backupId!)).character?.name).toBe('Old Hero');
  });
});
