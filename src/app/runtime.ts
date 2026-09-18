/**
 * The Runtime decides which save this device is playing and owns everything
 * about switching between them: guest ↔ account, sign-out, account deletion,
 * import, restore. React renders whatever `runtime.store` is; when the save
 * changes, `generation` bumps and the game tree remounts against the new store.
 *
 * Nothing here knows game rules. It only moves event logs around — carefully.
 */
import type { CommandContext } from '../engine/commands';
import type { GameEvent } from '../engine/types';
import { createBackup, readBackup } from '../store/backups';
import { GameStore } from '../store/gameStore';
import { LocalEventStore, SaveError, toSaveFile, type SaveFile } from '../store/eventStore';
import type { KeyValue } from '../store/keyValue';
import { AccountSession, type SyncStatus } from '../sync/accountSession';
import type { CloudUser } from '../sync/cloud';
import { GUEST_SAVE_KEY, readMode, writeMode, type DeviceMode } from '../sync/deviceSession';
import { mergeableEvents } from '../sync/migration';
import type { SyncConflict, SyncReport, SyncTransport } from '../sync/types';

/** What the runtime needs from the cloud. Supabase in the browser; a fake in tests. */
export interface CloudApi {
  available: boolean;
  currentUser(): Promise<CloudUser | null>;
  transport(): Promise<SyncTransport>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  updateProfileName(userId: string, name: string): Promise<void>;
}

export type Notice =
  | { kind: 'conflicts'; conflicts: SyncConflict[] }
  | { kind: 'arrived'; count: number };

/** connecting: cloud client loading / not reached yet · needs-sign-in: session expired or revoked. */
export type Connection = 'connecting' | 'connected' | 'needs-sign-in';

export type SaveStatus =
  | { kind: 'guest' }
  | ({ kind: 'account'; email: string; connected: boolean; connection: Connection } & SyncStatus);

export class Runtime {
  mode: DeviceMode = { kind: 'guest' };
  store!: GameStore;
  session: AccountSession | null = null;
  /** Bumped whenever the active save is swapped; React keys the game tree on it. */
  generation = 0;
  /** Set when an unreadable save had to be quarantined at boot. */
  recoveredCorruptSave = false;
  connection: Connection = 'connecting';

  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private detachSession: (() => void) | null = null;
  private lastProfileName = new Map<string, string>();

  constructor(
    readonly storage: KeyValue,
    readonly cloud: CloudApi,
    readonly deviceId: string,
    private readonly context?: () => CommandContext,
  ) {}

  /* ─────────────────────────── lifecycle ─────────────────────────── */

  boot(): this {
    const mode = readMode(this.storage);
    if (mode.kind === 'account' && this.cloud.available) this.startAccount(mode);
    else this.startGuest();
    return this;
  }

  /**
   * Attach the cloud to a signed-in device. Never blocks play: until this
   * resolves (or if it fails) the game runs from the local cache.
   */
  async connect(): Promise<void> {
    const session = this.session;
    if (!session || session.connected) return;
    try {
      const user = await this.cloud.currentUser();
      if (this.session !== session) return;
      if (!user || user.userId !== session.userId) {
        // Progress keeps queuing locally; the player is asked to sign in again.
        this.connection = 'needs-sign-in';
        this.emit();
        return;
      }
      session.connect(await this.cloud.transport());
      this.connection = 'connected';
    } catch {
      this.connection = 'connecting'; // e.g. offline before the cloud client ever loaded; retried later
    }
    this.emit();
  }

  /** One sync pass (no-op for guests). Surfaces conflicts and arrivals as notices. */
  async sync(): Promise<SyncReport | null> {
    const session = this.session;
    if (!session) return null;
    if (!session.connected) await this.connect();
    const report = await session.sync();
    if (report && this.session === session) {
      if (report.conflicts.length) this.notify({ kind: 'conflicts', conflicts: report.conflicts });
      if (report.foreign > 0) this.notify({ kind: 'arrived', count: report.foreign });
      void this.syncProfileName(session);
    }
    return report;
  }

  status(): SaveStatus {
    if (!this.session || this.mode.kind !== 'account') return { kind: 'guest' };
    return {
      kind: 'account',
      email: this.mode.email,
      connected: this.session.connected,
      connection: this.connection,
      ...this.session.getStatus(),
    };
  }

  /* ─────────────────────────── account transitions ─────────────────────────── */

  /** Called after a successful guest → account link (migration.ts wrote the cache and mode). */
  enterAccount(user: CloudUser): void {
    writeMode(this.storage, { kind: 'account', userId: user.userId, email: user.email });
    this.startAccount({ kind: 'account', userId: user.userId, email: user.email });
    void this.connect().then(() => this.sync());
  }

  /** After re-authenticating an expired session: resume syncing the same account. */
  async resume(user: CloudUser): Promise<void> {
    if (!this.session || user.userId !== this.session.userId) {
      throw new SaveError('That’s a different account. Sign out first to switch accounts.');
    }
    this.connection = 'connecting';
    await this.connect();
    await this.sync();
  }

  /** Events this device holds that the cloud hasn't confirmed yet. */
  unsyncedCount(): number {
    return this.session?.cache.pendingEvents().length ?? 0;
  }

  /**
   * Sign out: tries a final sync first. If progress still hasn't reached the
   * cloud (offline), it is preserved as an on-device backup — never discarded.
   * The account's local cache is then removed from this device.
   */
  async signOut(): Promise<{ backupId: string | null }> {
    const session = this.session;
    if (!session) return { backupId: null };
    await this.sync().catch(() => null);
    let backupId: string | null = null;
    if (session.cache.pendingEvents().length > 0) {
      backupId = createBackup(this.storage, session.cache.load(), `Unsynced progress of ${session.email}`, 'account').id;
    }
    await this.cloud.signOut().catch(() => undefined);
    session.cache.clear();
    writeMode(this.storage, { kind: 'guest' });
    this.startGuest();
    return { backupId };
  }

  /** Permanently deletes the cloud account and its data, then returns to a fresh guest game. */
  async deleteAccount(): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.cloud.deleteAccount(); // throws if it didn't happen — nothing local is touched then
    session.cache.clear();
    writeMode(this.storage, { kind: 'guest' });
    this.startGuest();
  }

  /* ─────────────────────────── saves: export, import, restore ─────────────────────────── */

  exportFile(): SaveFile {
    return toSaveFile(this.store.getEvents(), new Date(), this.mode.kind === 'account' ? 'account' : 'guest');
  }

  /**
   * Bring events from another save into this one.
   *  merge   — add its progress (never renames/replaces the current character)
   *  replace — guest saves only; the current save is backed up first
   * Accounts can only merge: an import never overwrites cloud history.
   */
  importEvents(events: GameEvent[], how: 'merge' | 'replace'): { added: number; backupId: string | null } {
    const current = [...this.store.getEvents()];
    if (how === 'replace') {
      if (this.mode.kind === 'account') throw new SaveError('Imports can only be merged into an account.');
      const backupId = current.length ? createBackup(this.storage, current, 'Before importing a save').id : null;
      this.store.replaceAll(events);
      this.emit();
      return { added: events.length, backupId };
    }
    const extra = mergeableEvents(current, events);
    if (extra.length) this.store.replaceAll([...current, ...extra]);
    this.emit();
    if (this.session) void this.sync();
    return { added: extra.length, backupId: null };
  }

  restoreBackup(id: string): { added: number; backupId: string | null } {
    const events = readBackup(this.storage, id);
    return this.importEvents(events, this.mode.kind === 'account' ? 'merge' : 'replace');
  }

  /** Guest "New Game": the old save is backed up, never simply destroyed. */
  newGuestGame(): string | null {
    if (this.mode.kind !== 'guest') throw new SaveError('Sign out before starting a new guest game.');
    const current = [...this.store.getEvents()];
    const backupId = current.length ? createBackup(this.storage, current, 'Before starting a new game').id : null;
    this.store.replaceAll([]);
    this.emit();
    return backupId;
  }

  /* ─────────────────────────── subscriptions ─────────────────────────── */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onNotice(listener: (n: Notice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  /* ─────────────────────────── internals ─────────────────────────── */

  private startGuest() {
    this.teardownSession();
    this.mode = { kind: 'guest' };
    const persistence = new LocalEventStore(this.storage, GUEST_SAVE_KEY);
    try {
      this.store = new GameStore(persistence, this.context);
    } catch (e) {
      if (!(e instanceof SaveError)) throw e;
      // Never destroy unreadable data: set it aside and start clean.
      persistence.quarantine();
      this.recoveredCorruptSave = true;
      this.store = new GameStore(persistence, this.context);
    }
    this.generation++;
    this.emit();
  }

  private startAccount(mode: Extract<DeviceMode, { kind: 'account' }>) {
    this.teardownSession();
    let session: AccountSession;
    try {
      session = new AccountSession(this.storage, mode.userId, mode.email, this.deviceId, this.context);
    } catch (e) {
      if (!(e instanceof SaveError)) throw e;
      // A damaged cache is only a cache: keep a copy, then rebuild from the cloud.
      const key = `life-os.account.${mode.userId}.v1`;
      const text = this.storage.getItem(key);
      if (text !== null) this.storage.setItem(`${key}.corrupt.${Date.now()}`, text);
      this.storage.removeItem(key);
      this.recoveredCorruptSave = true;
      session = new AccountSession(this.storage, mode.userId, mode.email, this.deviceId, this.context);
    }
    this.mode = mode;
    this.session = session;
    this.connection = 'connecting';
    this.store = session.store;
    this.detachSession = session.subscribe(() => this.emit());
    this.generation++;
    this.emit();
  }

  private teardownSession() {
    this.detachSession?.();
    this.detachSession = null;
    this.session = null;
  }

  /** Keep the profile's display name in step with the character (identity only, not game state). */
  private async syncProfileName(session: AccountSession) {
    const name = session.store.getState().character?.name;
    if (!name || this.lastProfileName.get(session.userId) === name) return;
    try {
      await this.cloud.updateProfileName(session.userId, name);
      this.lastProfileName.set(session.userId, name);
    } catch {
      /* cosmetic; retried after the next sync */
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private notify(n: Notice) {
    for (const l of this.noticeListeners) l(n);
  }
}
