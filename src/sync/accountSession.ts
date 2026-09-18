/**
 * Everything a signed-in device needs: the local cache + offline queue, the
 * GameStore the UI plays against, and the sync engine that reconciles with the
 * cloud. Gameplay never waits on the network — dispatches hit the local cache
 * synchronously; sync runs in the background and re-projects only when other
 * devices contributed new history.
 */
import type { CommandContext } from '../engine/commands';
import { GameStore } from '../store/gameStore';
import type { KeyValue } from '../store/keyValue';
import { AccountEventStore } from './accountStore';
import { SyncEngine } from './syncEngine';
import { SyncError, type SyncErrorKind, type SyncReport, type SyncTransport } from './types';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  lastSyncedAt: string | null;
  errorKind?: SyncErrorKind;
  error?: string;
}

export class AccountSession {
  readonly cache: AccountEventStore;
  readonly store: GameStore;
  private engine: SyncEngine | null = null;
  private status: SyncStatus;
  private listeners = new Set<() => void>();

  constructor(
    storage: KeyValue,
    readonly userId: string,
    readonly email: string,
    private readonly deviceId: string,
    context?: () => CommandContext,
  ) {
    this.cache = new AccountEventStore(storage, userId);
    this.store = new GameStore(this.cache, context);
    this.status = { phase: 'idle', pending: this.cache.pendingEvents().length, lastSyncedAt: this.cache.lastSyncedAt };
    this.cache.subscribe(() => this.refreshCounts());
  }

  /** The transport arrives asynchronously (the cloud client is lazy-loaded). Until then we play offline. */
  connect(transport: SyncTransport): void {
    this.engine = new SyncEngine(this.cache, transport, this.deviceId);
  }

  get connected(): boolean {
    return this.engine !== null;
  }

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Run one sync pass. Never throws: failures become status, and progress stays
   * safe in the local queue until the next attempt.
   */
  async sync(): Promise<SyncReport | null> {
    if (!this.engine) return null;
    this.setStatus({ phase: 'syncing', error: undefined, errorKind: undefined });
    try {
      const report = await this.engine.sync();
      if (report.foreign > 0 || report.rejected > 0) {
        // Other devices added history: re-project the merged, canonical log.
        this.store.replaceAll(this.cache.load());
      }
      this.setStatus({ phase: 'idle' });
      return report;
    } catch (e) {
      const kind: SyncErrorKind = e instanceof SyncError ? e.kind : 'server';
      this.setStatus({
        phase: kind === 'offline' ? 'offline' : 'error',
        errorKind: kind,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private refreshCounts() {
    const pending = this.cache.pendingEvents().length;
    const lastSyncedAt = this.cache.lastSyncedAt;
    if (pending !== this.status.pending || lastSyncedAt !== this.status.lastSyncedAt) this.setStatus({ pending, lastSyncedAt });
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = {
      ...this.status,
      ...patch,
      pending: this.cache.pendingEvents().length,
      lastSyncedAt: this.cache.lastSyncedAt,
    };
    for (const l of this.listeners) l();
  }
}
