/**
 * Persistence for the event log. Local-only by design: nothing leaves the device.
 * The interface is intentionally tiny so it can later be backed by IndexedDB,
 * SQLite (desktop), or an opt-in sync server without touching the engine.
 */
import type { GameEvent } from '../engine/types';

export const SAVE_FORMAT = 'life-os/save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  exportedAt?: string;
  events: GameEvent[];
}

export interface EventStore {
  load(): GameEvent[];
  save(events: readonly GameEvent[]): void;
  clear(): void;
}

export class SaveError extends Error {}

const KNOWN_TYPES = new Set<string>([
  'character.created',
  'character.renamed',
  'character.titleEquipped',
  'quest.created',
  'quest.edited',
  'quest.retired',
  'quest.completed',
  'campaign.created',
  'campaign.chapterCleared',
  'campaign.retired',
  'deed.undone',
]);

/** Structural validation of an untrusted save (localStorage or imported file). */
export function parseSave(raw: unknown): GameEvent[] {
  if (!raw || typeof raw !== 'object') throw new SaveError('Save data is not an object.');
  const save = raw as Partial<SaveFile>;
  if (save.format !== SAVE_FORMAT) throw new SaveError('This is not a LIFE//OS save file.');
  if (typeof save.version !== 'number' || save.version > SAVE_VERSION) {
    throw new SaveError('This save was made by a newer version of LIFE//OS.');
  }
  if (!Array.isArray(save.events)) throw new SaveError('Save file has no event log.');
  const ids = new Set<string>();
  for (const [i, e] of save.events.entries()) {
    if (!e || typeof e !== 'object') throw new SaveError(`Event #${i} is malformed.`);
    const ev = e as Partial<GameEvent>;
    if (typeof ev.id !== 'string' || typeof ev.at !== 'string' || typeof ev.type !== 'string') {
      throw new SaveError(`Event #${i} is missing id, time, or type.`);
    }
    if (!KNOWN_TYPES.has(ev.type)) throw new SaveError(`Event #${i} has unknown type “${ev.type}”.`);
    if (ids.has(ev.id)) throw new SaveError(`Event #${i} duplicates id ${ev.id}.`);
    ids.add(ev.id);
  }
  return save.events as GameEvent[];
}

export function toSaveFile(events: readonly GameEvent[], now = new Date()): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, exportedAt: now.toISOString(), events: [...events] };
}

interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalEventStore implements EventStore {
  constructor(
    private readonly storage: KeyValue,
    private readonly key = 'life-os.save.v1',
  ) {}

  load(): GameEvent[] {
    const text = this.storage.getItem(this.key);
    if (text === null) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SaveError('Save data is corrupted (invalid JSON).');
    }
    return parseSave(raw);
  }

  save(events: readonly GameEvent[]): void {
    this.storage.setItem(this.key, JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, events }));
  }

  clear(): void {
    this.storage.removeItem(this.key);
  }

  /** Keep a copy of unreadable data rather than overwriting it. */
  quarantine(): void {
    const text = this.storage.getItem(this.key);
    if (text !== null) this.storage.setItem(`${this.key}.corrupt.${Date.now()}`, text);
    this.storage.removeItem(this.key);
  }
}

export class MemoryEventStore implements EventStore {
  private events: GameEvent[] = [];
  constructor(initial: GameEvent[] = []) {
    this.events = [...initial];
  }
  load(): GameEvent[] {
    return [...this.events];
  }
  save(events: readonly GameEvent[]): void {
    this.events = [...events];
  }
  clear(): void {
    this.events = [];
  }
}
