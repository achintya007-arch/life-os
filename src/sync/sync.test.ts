import { describe, expect, it } from 'vitest';
import { levelInfo } from '../engine/leveling';
import { replay } from '../engine/project';
import type { Command } from '../engine/commands';
import type { QuestDraft } from '../engine/types';
import { MemoryStorage } from '../store/keyValue';
import { AccountSession } from './accountSession';
import { PUSH_BATCH } from './syncEngine';
import { FakeCloud } from './testing/fakeCloud';

const USER = 'user-a';

/** A device: its own storage, clock and id space, signed in to `userId`. */
function device(cloud: FakeCloud, name: string, userId = USER, storage = new MemoryStorage(), start = '2026-09-18T10:00:00') {
  let now = new Date(start);
  let seq = 0;
  const session = new AccountSession(storage, userId, `${userId}@example.test`, `device-${name}`, () => ({
    now: new Date(now),
    newId: () => `${name}-${++seq}-${Math.random().toString(36).slice(2, 8)}`,
  }));
  session.connect(cloud.transportFor(userId));
  const run = (c: Command) => {
    const r = session.store.dispatch(c);
    if (!r.ok) throw new Error(`${c.type}: ${r.error}`);
    return r;
  };
  return {
    session,
    storage,
    run,
    get state() {
      return session.store.getState();
    },
    setTime(iso: string) {
      now = new Date(iso);
    },
    quest(q: Partial<QuestDraft> = {}) {
      const r = run({ type: 'createQuest', quest: { title: 'Practice guitar', tier: 'standard', attribute: 'DEX', cadence: 'once', ...q } });
      const e = r.events[0]!;
      if (e.type !== 'quest.created') throw new Error();
      return e.questId;
    },
    complete(questId: string) {
      return run({ type: 'completeQuest', questId });
    },
    sync: () => session.sync(),
  };
}

/** Full derived state of a device, compared across devices. */
const world = (d: { session: AccountSession }) => replay(d.session.cache.load());

describe('cross-device sync', () => {
  it('a second device signs in and derives the identical character', async () => {
    const cloud = new FakeCloud();
    const laptop = device(cloud, 'laptop');
    laptop.run({ type: 'createCharacter', name: 'Achintya' });
    const guitar = laptop.quest({ cadence: 'daily' });
    laptop.complete(guitar);
    laptop.complete(laptop.quest({ title: 'Ship the optimizer', tier: 'boss', attribute: 'INT' }));
    laptop.run({ type: 'createCampaign', name: 'Quantum', attribute: 'INT', chapters: ['Learn', 'Build'] });
    await laptop.sync();

    const phone = device(cloud, 'phone');
    expect(phone.state.character).toBeNull();
    const report = await phone.sync();
    expect(report?.foreign).toBe(laptop.session.cache.load().length);

    expect(phone.state).toEqual(laptop.state);
    expect(phone.state.character?.name).toBe('Achintya');
    expect(levelInfo(phone.state.totalXp).level).toBe(levelInfo(laptop.state.totalXp).level);
    expect(Object.keys(phone.state.achievements).sort()).toEqual(Object.keys(laptop.state.achievements).sort());
  });

  it('activity on the phone appears on the laptop, and back again', async () => {
    const cloud = new FakeCloud();
    const laptop = device(cloud, 'laptop');
    laptop.run({ type: 'createCharacter', name: 'Achintya' });
    const guitar = laptop.quest({ cadence: 'daily' });
    await laptop.sync();

    const phone = device(cloud, 'phone', USER, new MemoryStorage(), '2026-09-19T08:00:00');
    await phone.sync();
    phone.complete(guitar);
    await phone.sync();

    await laptop.sync();
    expect(laptop.state.quests[guitar]!.timesCompleted).toBe(1);
    expect(laptop.state.totalXp).toBe(50);
    expect(world(laptop)).toEqual(world(phone));
  });

  it('undo on one device is undone everywhere', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, 'a');
    a.run({ type: 'createCharacter', name: 'X' });
    const r = a.complete(a.quest());
    await a.sync();
    const b = device(cloud, 'b');
    await b.sync();
    expect(b.state.totalXp).toBe(50);
    b.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    await b.sync();
    await a.sync();
    expect(a.state.totalXp).toBe(0);
    expect(world(a)).toEqual(world(b));
  });
});

describe('offline-first', () => {
  it('plays fully offline; the queue survives a restart and syncs later', async () => {
    const cloud = new FakeCloud();
    const storage = new MemoryStorage();
    const phone = device(cloud, 'phone', USER, storage);
    phone.run({ type: 'createCharacter', name: 'Offline Hero' });
    await phone.sync();

    cloud.offline = true;
    const q = phone.quest();
    const result = phone.complete(q);
    expect(result.effects.some((e) => e.kind === 'deed')).toBe(true); // XP, achievements: all still work
    expect(phone.state.totalXp).toBe(50);
    await phone.sync();
    expect(phone.session.getStatus()).toMatchObject({ phase: 'offline', pending: 2 });

    // App is closed and reopened, still offline.
    const reopened = device(cloud, 'phone', USER, storage);
    expect(reopened.state.totalXp).toBe(50);
    expect(reopened.session.getStatus().pending).toBe(2);

    cloud.offline = false;
    await reopened.sync();
    expect(reopened.session.getStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(cloud.eventsOf(USER)).toHaveLength(3);
  });

  it('a lost push response is retried without creating duplicates', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, 'a');
    a.run({ type: 'createCharacter', name: 'X' });
    a.complete(a.quest());
    cloud.dropNextPushResponse = true;
    await a.sync();
    expect(a.session.getStatus().pending).toBe(3); // we don't know it landed
    await a.sync();
    expect(a.session.getStatus().pending).toBe(0);
    const ids = cloud.eventsOf(USER).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });

  it('pushes large queues in batches and pages large pulls', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, 'a');
    a.run({ type: 'createCharacter', name: 'Grinder' });
    for (let i = 0; i < PUSH_BATCH + 50; i++) a.quest({ title: `Q${i}` });
    await a.sync();
    expect(cloud.eventsOf(USER)).toHaveLength(PUSH_BATCH + 51);

    for (let i = 0; i < 1100; i++) {
      cloud.plant(USER, { id: `bulk-${i}`, at: '2026-09-18T10:00:00.000Z', type: 'character.renamed', name: `N${i}` });
    }
    const b = device(cloud, 'b');
    await b.sync();
    expect(b.session.cache.load()).toHaveLength(PUSH_BATCH + 51 + 1100);
    expect(b.state.character?.name).toBe('N1099');
  });
});

describe('concurrent devices & conflicts', () => {
  async function twoDevices() {
    const cloud = new FakeCloud();
    const laptop = device(cloud, 'laptop');
    laptop.run({ type: 'createCharacter', name: 'Achintya' });
    const questA = laptop.quest({ title: 'Quest A' });
    const questB = laptop.quest({ title: 'Quest B', attribute: 'STR' });
    await laptop.sync();
    const phone = device(cloud, 'phone');
    await phone.sync();
    return { cloud, laptop, phone, questA, questB };
  }

  it('independent offline progress merges: Quest A + Quest B, not A or B', async () => {
    const { cloud, laptop, phone, questA, questB } = await twoDevices();
    cloud.offline = true;
    phone.complete(questA);
    laptop.complete(questB);
    await Promise.all([phone.sync(), laptop.sync()]);
    cloud.offline = false;

    await phone.sync();
    const report = await laptop.sync();
    await phone.sync();
    expect(report?.conflicts).toEqual([]);

    for (const d of [laptop, phone]) {
      expect(d.state.quests[questA]!.status).toBe('cleared');
      expect(d.state.quests[questB]!.status).toBe('cleared');
      expect(d.state.totalXp).toBe(100);
    }
    expect(world(laptop)).toEqual(world(phone));
  });

  it('the same quest cleared on two devices counts once, and the loser is told', async () => {
    const { cloud, laptop, phone, questA } = await twoDevices();
    cloud.offline = true;
    phone.complete(questA);
    laptop.complete(questA);
    cloud.offline = false;

    const first = await phone.sync();
    const second = await laptop.sync();
    await phone.sync();

    expect(first?.conflicts).toEqual([]);
    expect(second?.conflicts).toEqual([
      expect.objectContaining({ title: 'Quest A', reason: 'already cleared on another device' }),
    ]);
    // Deterministic resolution, identical everywhere; XP is not double counted.
    expect(laptop.state.totalXp).toBe(50);
    expect(world(laptop)).toEqual(world(phone));
    // Nothing was deleted: both completions remain in the permanent history.
    expect(cloud.eventsOf(USER).filter((e) => e.type === 'quest.completed')).toHaveLength(2);
  });

  it('ordering follows the cloud, not device clocks (clock skew cannot orphan a deed)', async () => {
    const cloud = new FakeCloud();
    // Laptop clock runs an hour fast; phone clock is correct.
    const laptop = device(cloud, 'laptop', USER, new MemoryStorage(), '2026-09-18T11:00:00');
    laptop.run({ type: 'createCharacter', name: 'X' });
    const q = laptop.quest();
    await laptop.sync();
    const phone = device(cloud, 'phone', USER, new MemoryStorage(), '2026-09-18T10:05:00');
    await phone.sync();
    phone.complete(q); // timestamped "before" the quest was created
    await phone.sync();
    await laptop.sync();
    expect(laptop.state.totalXp).toBe(50);
    expect(world(laptop)).toEqual(world(phone));
  });

  it('a malformed event in the cloud is skipped, never crashing the device', async () => {
    const cloud = new FakeCloud();
    const a = device(cloud, 'a');
    a.run({ type: 'createCharacter', name: 'X' });
    await a.sync();
    cloud.plant(USER, { id: 'evil', at: 'not-a-date', type: 'quest.created' });
    cloud.plant(USER, { id: 'ok', at: '2026-09-18T10:00:00.000Z', type: 'character.renamed', name: 'Still Fine' });
    const report = await a.sync();
    expect(report?.rejected).toBe(1);
    expect(a.state.character?.name).toBe('Still Fine');
    const again = await a.sync();
    expect(again?.pulled).toBe(0); // cursor moved past the bad event
  });
});

describe('account isolation & switching on one device', () => {
  it('two accounts on the same device never see each other’s data', async () => {
    const cloud = new FakeCloud();
    const storage = new MemoryStorage();
    const a = device(cloud, 'shared', 'user-a', storage);
    a.run({ type: 'createCharacter', name: 'Alice' });
    a.complete(a.quest({ title: 'Alice quest' }));
    await a.sync();

    const b = device(cloud, 'shared', 'user-b', storage);
    expect(b.state.character).toBeNull();
    await b.sync();
    expect(b.state.character).toBeNull();
    b.run({ type: 'createCharacter', name: 'Bob' });
    await b.sync();

    expect(cloud.eventsOf('user-a').some((e) => e.type === 'character.created' && e.name === 'Bob')).toBe(false);
    expect(cloud.eventsOf('user-b').some((e) => e.type === 'character.created' && e.name === 'Alice')).toBe(false);
    const reloadedA = device(cloud, 'shared', 'user-a', storage);
    expect(reloadedA.state.character?.name).toBe('Alice');
    expect(reloadedA.state.totalXp).toBe(50);
  });
});
