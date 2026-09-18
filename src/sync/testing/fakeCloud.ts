/**
 * In-memory stand-in for the Supabase backend with the same semantics as the
 * push_events function and the RLS-scoped game_events table:
 *   per-user logs, per-user seq, idempotent pushes, pull by cursor.
 * Supports simulated outages and "lost responses" for resilience tests.
 */
import type { GameEvent } from '../../engine/types';
import { SyncError, type RemoteEvent, type SyncTransport } from '../types';

interface Row {
  seq: number;
  event: GameEvent;
  deviceId: string;
}

export class FakeCloud {
  private logs = new Map<string, Row[]>();
  offline = false;
  /** When set, the next push is applied but its response is "lost" (throws). */
  dropNextPushResponse = false;
  /** When set, push calls beyond this count fail as if the network dropped. */
  failPushesAfter: number | null = null;
  pushCalls = 0;
  pullCalls = 0;

  /** A transport authenticated as `userId` — it can only ever touch that user's log. */
  transportFor(userId: string): SyncTransport {
    return {
      push: async (events, deviceId) => {
        this.pushCalls++;
        this.guard();
        if (this.failPushesAfter !== null && this.pushCalls > this.failPushesAfter) {
          throw new SyncError('offline', 'network dropped mid-upload');
        }
        const log = this.logOf(userId);
        const ids = new Set(log.map((r) => r.event.id));
        for (const e of events) {
          if (ids.has(e.id)) continue;
          ids.add(e.id);
          log.push({ seq: log.length + 1, event: structuredClone(e), deviceId });
        }
        if (this.dropNextPushResponse) {
          this.dropNextPushResponse = false;
          throw new SyncError('offline', 'connection reset (response lost)');
        }
        const want = new Set(events.map((e) => e.id));
        return log.filter((r) => want.has(r.event.id)).map((r) => ({ id: r.event.id, seq: r.seq }));
      },
      pull: async (afterSeq, limit) => {
        this.pullCalls++;
        this.guard();
        return this.logOf(userId)
          .filter((r) => r.seq > afterSeq)
          .slice(0, limit)
          .map((r): RemoteEvent => ({ seq: r.seq, event: structuredClone(r.event) }));
      },
    };
  }

  /** Ground truth, for assertions. */
  eventsOf(userId: string): GameEvent[] {
    return this.logOf(userId).map((r) => r.event);
  }

  /** Test hook: plant a raw (possibly malformed) event in a user's log. */
  plant(userId: string, event: unknown) {
    const log = this.logOf(userId);
    log.push({ seq: log.length + 1, event: event as GameEvent, deviceId: 'planted' });
  }

  deleteUser(userId: string) {
    this.logs.delete(userId);
  }

  private logOf(userId: string): Row[] {
    let log = this.logs.get(userId);
    if (!log) this.logs.set(userId, (log = []));
    return log;
  }

  private guard() {
    if (this.offline) throw new SyncError('offline', 'network unreachable');
  }
}

/** A CloudApi (the runtime's view of the cloud) backed by a FakeCloud. */
export function fakeCloudApi(cloud: FakeCloud, initialUser: { userId: string; email: string } | null = null) {
  const api = {
    available: true,
    user: initialUser,
    deleteFails: false,
    profileNames: new Map<string, string>(),
    async currentUser() {
      return api.user;
    },
    async transport() {
      if (!api.user) throw new SyncError('auth', 'not signed in');
      return cloud.transportFor(api.user.userId);
    },
    async signOut() {
      api.user = null;
    },
    async deleteAccount() {
      if (api.deleteFails) throw new SyncError('offline', 'network unreachable');
      if (api.user) cloud.deleteUser(api.user.userId);
      api.user = null;
    },
    async updateProfileName(userId: string, name: string) {
      api.profileNames.set(userId, name);
    },
  };
  return api;
}
