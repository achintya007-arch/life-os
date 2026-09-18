import { describe, expect, it } from 'vitest';
import { buildDemoHistory } from '../dev/seed';
import { replay } from '../engine/project';
import { createHarness } from '../engine/testkit';
import type { GameEvent } from '../engine/types';
import { listBackups, readBackup } from '../store/backups';
import { LocalEventStore, parseSave } from '../store/eventStore';
import { MemoryStorage } from '../store/keyValue';
import { AccountSession } from './accountSession';
import { GUEST_SAVE_KEY, readMode } from './deviceSession';
import { executeLink, inspectLink, LinkError } from './migration';
import { PUSH_BATCH } from './syncEngine';
import { FakeCloud } from './testing/fakeCloud';

const USER = 'user-1';
const EMAIL = 'player@example.test';

/** A guest device with some real progress, saved exactly the way v0.1 saves it. */
function guestDevice(events: GameEvent[] = buildDemoHistory(new Date('2026-09-17T19:00:00'))) {
  const storage = new MemoryStorage();
  new LocalEventStore(storage, GUEST_SAVE_KEY).save(events);
  return { storage, events };
}

const guestSaveOf = (storage: MemoryStorage) => new LocalEventStore(storage, GUEST_SAVE_KEY).load();

async function link(storage: MemoryStorage, cloud: FakeCloud, choice?: 'upload' | 'merge' | 'keep-account' | 'adopt') {
  const transport = cloud.transportFor(USER);
  const guestEvents = guestSaveOf(storage);
  const plan = await inspectLink(guestEvents, transport);
  const pick =
    choice ?? (plan.kind === 'upload' ? 'upload' : plan.kind === 'choose' ? 'merge' : 'adopt');
  const result = await executeLink({ storage, transport, userId: USER, email: EMAIL, deviceId: 'dev', guestEvents, plan, choice: pick });
  return { plan, result };
}

describe('guest → account migration', () => {
  it('uploads a guest save into an empty account and verifies it', async () => {
    const cloud = new FakeCloud();
    const { storage, events } = guestDevice();
    const before = replay(events);

    const { plan, result } = await link(storage, cloud);
    expect(plan.kind).toBe('upload');
    expect(result.uploaded).toBe(events.length);

    // Cloud holds the exact history; the device is now an account device.
    expect(cloud.eventsOf(USER).map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(readMode(storage)).toEqual({ kind: 'account', userId: USER, email: EMAIL });
    const session = new AccountSession(storage, USER, EMAIL, 'dev');
    expect(session.store.getState()).toEqual(before);
    expect(session.getStatus().pending).toBe(0);

    // The guest save is retired only after verification, and the temporary backup with it.
    expect(guestSaveOf(storage)).toEqual([]);
    expect(listBackups(storage)).toEqual([]);
  });

  it('a partial upload fails safely and a retry completes it without duplicates', async () => {
    const cloud = new FakeCloud();
    const many = createHarness('2026-09-01T10:00:00');
    many.begin('Grinder');
    for (let i = 0; i < PUSH_BATCH * 2 + 10; i++) many.complete(many.quest({ title: `Q${i}` }));
    const events = [...many.store.getEvents()];
    const { storage } = guestDevice(events);

    cloud.failPushesAfter = 1; // the connection dies after the first batch
    await expect(link(storage, cloud)).rejects.toThrow(LinkError);
    expect(cloud.eventsOf(USER).length).toBe(PUSH_BATCH); // partial upload happened…
    expect(readMode(storage).kind).toBe('guest'); // …but the device is still a guest
    expect(guestSaveOf(storage)).toHaveLength(events.length); // and nothing local was lost
    expect(listBackups(storage)).toHaveLength(1);

    cloud.failPushesAfter = null;
    await link(storage, cloud);
    const ids = cloud.eventsOf(USER).map((e) => e.id);
    expect(ids).toHaveLength(events.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(readMode(storage).kind).toBe('account');
    expect(listBackups(storage)).toEqual([]); // retries reuse one backup, removed after success
  });

  it('when both sides have a character, the player must choose', async () => {
    const cloud = new FakeCloud();
    // The account already has a character from another device.
    const laptop = new AccountSession(new MemoryStorage(), USER, EMAIL, 'laptop');
    laptop.connect(cloud.transportFor(USER));
    laptop.store.dispatch({ type: 'createCharacter', name: 'Account Hero' });
    await laptop.sync();

    const { storage } = guestDevice();
    const plan = await inspectLink(guestSaveOf(storage), cloud.transportFor(USER));
    expect(plan.kind).toBe('choose');
    if (plan.kind !== 'choose') return;
    expect(plan.account.name).toBe('Account Hero');
    expect(plan.guest.name).toBe('Achintya');

    await expect(
      executeLink({
        storage, transport: cloud.transportFor(USER), userId: USER, email: EMAIL, deviceId: 'd',
        guestEvents: guestSaveOf(storage), plan, choice: 'upload',
      }),
    ).rejects.toThrow(/not a valid choice/);
    expect(guestSaveOf(storage).length).toBeGreaterThan(0);
  });

  it('merge: guest progress joins the account character, which keeps its identity', async () => {
    const cloud = new FakeCloud();
    const laptop = new AccountSession(new MemoryStorage(), USER, EMAIL, 'laptop');
    laptop.connect(cloud.transportFor(USER));
    laptop.store.dispatch({ type: 'createCharacter', name: 'Account Hero' });
    await laptop.sync();

    const { storage, events } = guestDevice();
    const guestXp = replay(events).totalXp;
    await link(storage, cloud, 'merge');

    const phone = new AccountSession(storage, USER, EMAIL, 'phone');
    expect(phone.store.getState().character?.name).toBe('Account Hero');
    expect(phone.store.getState().totalXp).toBe(guestXp);
    await laptop.sync();
    expect(laptop.store.getState()).toEqual(phone.store.getState());
  });

  it('keep-account: the guest save is not uploaded but survives as a restorable backup', async () => {
    const cloud = new FakeCloud();
    const laptop = new AccountSession(new MemoryStorage(), USER, EMAIL, 'laptop');
    laptop.connect(cloud.transportFor(USER));
    laptop.store.dispatch({ type: 'createCharacter', name: 'Account Hero' });
    await laptop.sync();
    const cloudBefore = cloud.eventsOf(USER).length;

    const { storage, events } = guestDevice();
    const { result } = await link(storage, cloud, 'keep-account');
    expect(cloud.eventsOf(USER)).toHaveLength(cloudBefore);
    expect(result.keptBackupId).not.toBeNull();
    expect(readBackup(storage, result.keptBackupId!)).toEqual(events);
    expect(new AccountSession(storage, USER, EMAIL, 'p').store.getState().character?.name).toBe('Account Hero');
  });

  it('a fresh device with no guest progress simply loads the account', async () => {
    const cloud = new FakeCloud();
    const laptop = new AccountSession(new MemoryStorage(), USER, EMAIL, 'laptop');
    laptop.connect(cloud.transportFor(USER));
    laptop.store.dispatch({ type: 'createCharacter', name: 'Account Hero' });
    await laptop.sync();

    const storage = new MemoryStorage();
    const { plan } = await link(storage, cloud);
    expect(plan.kind).toBe('adopt');
    expect(new AccountSession(storage, USER, EMAIL, 'p').store.getState().character?.name).toBe('Account Hero');
  });

  it('an old v0.1 export file still imports and migrates into a valid character', async () => {
    const cloud = new FakeCloud();
    const v01File = JSON.parse(
      JSON.stringify({ format: 'life-os/save', version: 1, exportedAt: '2026-09-18T00:00:00.000Z', events: buildDemoHistory(new Date('2026-09-17T19:00:00')) }),
    );
    const events = parseSave(v01File);
    const { storage } = guestDevice(events);
    await link(storage, cloud);
    const s = new AccountSession(storage, USER, EMAIL, 'd').store.getState();
    expect(s.character?.name).toBe('Achintya');
    expect(s).toEqual(replay(events));
  });
});
