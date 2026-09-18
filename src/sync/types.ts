import type { GameEvent } from '../engine/types';

/** An event as stored in the cloud: the canonical replay position is `seq`. */
export interface RemoteEvent {
  seq: number;
  event: GameEvent;
}

/**
 * The only thing the sync layer needs from a backend. Implemented by
 * SupabaseTransport in production and by an in-memory fake server in tests.
 * A transport is always bound to one authenticated user; it cannot address
 * anyone else's data (the database enforces this too).
 */
export interface SyncTransport {
  /** Idempotently append events. Returns the seq of every submitted id. */
  push(events: readonly GameEvent[], deviceId: string): Promise<{ id: string; seq: number }[]>;
  /** Events with seq > afterSeq, ascending, at most `limit`. */
  pull(afterSeq: number, limit: number): Promise<RemoteEvent[]>;
}

export type SyncErrorKind = 'offline' | 'auth' | 'server';

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** What a sync pass did, for the status UI and for conflict notices. */
export interface SyncReport {
  pushed: number;
  pulled: number;
  /** Events that arrived from other devices during this pass. */
  foreign: number;
  /** Deeds recorded on this device that had no effect once merged (e.g. the quest was already cleared elsewhere). */
  conflicts: SyncConflict[];
  /** Remote events skipped because they failed structural validation. */
  rejected: number;
}

export interface SyncConflict {
  eventId: string;
  title: string;
  reason: string;
}
