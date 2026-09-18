/**
 * Local state for a signed-in player: a cache of the cloud log plus a queue of
 * events that haven't reached the cloud yet. Implements the same EventStore
 * interface as a guest save, so GameStore and the engine don't know or care
 * whether they're playing online, offline, or as a guest.
 *
 * Canonical order = confirmed events by server seq, then pending events in the
 * order they were made on this device. Once pending events are confirmed they
 * take their server position, and every device converges on the same order.
 */
import type { GameEvent } from '../engine/types';
import { isValidEvent } from '../engine/validate';
import { SaveError, type EventStore } from '../store/eventStore';
import type { KeyValue } from '../store/keyValue';
import type { RemoteEvent } from './types';

const CACHE_VERSION = 1;

interface CacheData {
  version: number;
  userId: string;
  confirmed: RemoteEvent[];
  pending: GameEvent[];
  /** Highest server seq this device has processed (may exceed the last confirmed event if invalid ones were skipped). */
  cursor: number;
  lastSyncedAt: string | null;
}

export function accountCacheKey(userId: string): string {
  return `life-os.account.${userId}.v1`;
}

export class AccountEventStore implements EventStore {
  private confirmed: RemoteEvent[] = [];
  private pending: GameEvent[] = [];
  private known = new Set<string>();
  private _cursor = 0;
  private _lastSyncedAt: string | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValue,
    readonly userId: string,
  ) {
    this.read();
  }

  /* ── EventStore ── */

  load(): GameEvent[] {
    return [...this.confirmed.map((r) => r.event), ...this.pending];
  }

  /**
   * GameStore hands us the full log after every change. Anything we haven't
   * seen before is a new local event: queue it for the cloud.
   */
  save(events: readonly GameEvent[]): void {
    let changed = false;
    for (const e of events) {
      if (this.known.has(e.id)) continue;
      this.pending.push(e);
      this.known.add(e.id);
      changed = true;
    }
    if (changed) this.write();
  }

  clear(): void {
    this.storage.removeItem(accountCacheKey(this.userId));
    this.confirmed = [];
    this.pending = [];
    this.known.clear();
    this._cursor = 0;
    this._lastSyncedAt = null;
    this.notify();
  }

  /* ── sync API ── */

  get cursor(): number {
    return this._cursor;
  }

  get lastSyncedAt(): string | null {
    return this._lastSyncedAt;
  }

  pendingEvents(): readonly GameEvent[] {
    return this.pending;
  }

  has(id: string): boolean {
    return this.known.has(id);
  }

  /**
   * Merge a page of cloud events (seq > cursor, ascending). `upTo` is the
   * highest seq in the page, including events the caller chose to skip.
   * Anything we were holding as pending is now confirmed at its server position.
   */
  applyRemote(remote: readonly RemoteEvent[], upTo: number): void {
    const confirmedIds = new Set(this.confirmed.map((r) => r.event.id));
    for (const r of remote) {
      if (r.seq <= this._cursor || confirmedIds.has(r.event.id)) continue;
      this.confirmed.push(r);
      confirmedIds.add(r.event.id);
      this.known.add(r.event.id);
    }
    this._cursor = Math.max(this._cursor, upTo);
    this.pending = this.pending.filter((e) => !confirmedIds.has(e.id));
    this.write();
  }

  markSynced(at = new Date()): void {
    this._lastSyncedAt = at.toISOString();
    this.write();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ── persistence ── */

  private read(): void {
    const text = this.storage.getItem(accountCacheKey(this.userId));
    if (text === null) return;
    let data: CacheData;
    try {
      data = JSON.parse(text) as CacheData;
    } catch {
      throw new SaveError('Local account cache is corrupted.');
    }
    if (data.version !== CACHE_VERSION || data.userId !== this.userId) {
      throw new SaveError('Local account cache belongs to a different account or version.');
    }
    // Validate defensively: a bad cache entry must never crash the game.
    this.confirmed = (data.confirmed ?? []).filter((r) => Number.isFinite(r.seq) && isValidEvent(r.event));
    this.confirmed.sort((a, b) => a.seq - b.seq);
    const confirmedIds = new Set(this.confirmed.map((r) => r.event.id));
    this.pending = (data.pending ?? []).filter((e) => isValidEvent(e) && !confirmedIds.has(e.id));
    this.known = new Set([...confirmedIds, ...this.pending.map((e) => e.id)]);
    const lastConfirmed = this.confirmed.length ? this.confirmed[this.confirmed.length - 1]!.seq : 0;
    this._cursor = Math.max(Number.isFinite(data.cursor) ? data.cursor : 0, lastConfirmed);
    this._lastSyncedAt = data.lastSyncedAt ?? null;
  }

  private write(): void {
    const data: CacheData = {
      version: CACHE_VERSION,
      userId: this.userId,
      confirmed: this.confirmed,
      pending: this.pending,
      cursor: this._cursor,
      lastSyncedAt: this._lastSyncedAt,
    };
    this.storage.setItem(accountCacheKey(this.userId), JSON.stringify(data));
    this.notify();
  }

  private notify() {
    for (const l of this.listeners) l();
  }
}
