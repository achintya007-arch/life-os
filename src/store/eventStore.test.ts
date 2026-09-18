import { describe, expect, it } from 'vitest';
import { LocalEventStore, SaveError, parseSave, toSaveFile } from './eventStore';
import type { GameEvent } from '../engine/types';

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const events: GameEvent[] = [{ id: 'e1', at: '2026-09-01T00:00:00.000Z', type: 'character.created', name: 'A' }];

describe('LocalEventStore', () => {
  it('round-trips events', () => {
    const s = new LocalEventStore(new FakeStorage());
    expect(s.load()).toEqual([]);
    s.save(events);
    expect(s.load()).toEqual(events);
  });

  it('throws SaveError on corrupted JSON and can quarantine it', () => {
    const storage = new FakeStorage();
    const s = new LocalEventStore(storage, 'k');
    storage.setItem('k', '{nope');
    expect(() => s.load()).toThrow(SaveError);
    s.quarantine();
    expect(s.load()).toEqual([]);
    expect([...storage.data.keys()].some((k) => k.startsWith('k.corrupt.'))).toBe(true);
  });
});

describe('parseSave', () => {
  it('accepts exported files', () => {
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(events))))).toEqual(events);
  });

  it('rejects foreign, future, and malformed saves', () => {
    expect(() => parseSave({ hello: 1 })).toThrow(SaveError);
    expect(() => parseSave({ format: 'life-os/save', version: 99, events: [] })).toThrow(/newer/);
    expect(() => parseSave({ format: 'life-os/save', version: 1, events: [{ id: 'x' }] })).toThrow(SaveError);
    expect(() =>
      parseSave({ format: 'life-os/save', version: 1, events: [{ id: 'x', at: 't', type: 'hack.everything' }] }),
    ).toThrow(/unknown type/);
    expect(() => parseSave({ format: 'life-os/save', version: 1, events: [events[0], events[0]] })).toThrow(/duplicates/);
  });
});
