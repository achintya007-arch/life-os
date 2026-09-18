/**
 * Persistence for the event log. The interface is intentionally tiny: guest
 * saves use LocalEventStore; signed-in players use AccountEventStore
 * (src/sync), which adds a cloud-sync queue behind the same interface.
 */
import type { GameEvent } from '../engine/types';
import { eventProblem } from '../engine/validate';
import type { KeyValue } from './keyValue';

export const SAVE_FORMAT = 'life-os/save';
/**
 * Save-file versions.
 *  1 — { format, version, exportedAt?, events }                      (v0.1)
 *  2 — adds optional provenance: { app, eventSchema, source }        (accounts)
 * Events themselves are unchanged between versions, so every version-1 save
 * remains importable forever.
 */
export const SAVE_VERSION = 2;
export const EVENT_SCHEMA = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  app?: string;
  eventSchema?: number;
  /** Where the export came from: a guest save on one device, or an account. */
  source?: 'guest' | 'account';
  exportedAt?: string;
  events: GameEvent[];
}

export interface EventStore {
  load(): GameEvent[];
  save(events: readonly GameEvent[]): void;
  clear(): void;
}

export class SaveError extends Error {}

/** Validation of an untrusted save (localStorage, imported file or backup). */
export function parseSave(raw: unknown): GameEvent[] {
  if (!raw || typeof raw !== 'object') throw new SaveError('Save data is not an object.');
  const save = raw as Partial<SaveFile>;
  if (save.format !== SAVE_FORMAT) throw new SaveError('This is not a LIFE//OS save file.');
  if (typeof save.version !== 'number' || save.version < 1 || save.version > SAVE_VERSION) {
    throw new SaveError('This save was made by a newer version of LIFE//OS.');
  }
  if (save.eventSchema !== undefined && save.eventSchema > EVENT_SCHEMA) {
    throw new SaveError('This save uses a newer event format than this version of LIFE//OS understands.');
  }
  if (!Array.isArray(save.events)) throw new SaveError('Save file has no event log.');
  const ids = new Set<string>();
  for (const [i, e] of save.events.entries()) {
    const problem = eventProblem(e);
    if (problem) throw new SaveError(`Event #${i} is invalid: ${problem}.`);
    const id = (e as GameEvent).id;
    if (ids.has(id)) throw new SaveError(`Event #${i} duplicates id ${id}.`);
    ids.add(id);
  }
  return save.events as GameEvent[];
}

export function toSaveFile(events: readonly GameEvent[], now = new Date(), source: SaveFile['source'] = 'guest'): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    app: 'LIFE//OS',
    eventSchema: EVENT_SCHEMA,
    source,
    exportedAt: now.toISOString(),
    events: [...events],
  };
}

export class LocalEventStore implements EventStore {
  constructor(
    private readonly storage: Pick<KeyValue, 'getItem' | 'setItem' | 'removeItem'>,
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
