/**
 * One sync pass = push what this device has, pull what it's missing.
 *
 *   pending events ──push (idempotent)──▶ cloud assigns seq
 *   cloud events after cursor ──pull──▶ cache ──replay──▶ identical state everywhere
 *
 * Safe to interrupt at any point: a push whose response is lost is simply
 * retried (the server dedupes by event id), and nothing leaves the pending
 * queue until the cloud has confirmed it by returning it in a pull.
 */
import { replay } from '../engine/project';
import type { GameEvent, GameState } from '../engine/types';
import { eventProblem } from '../engine/validate';
import type { AccountEventStore } from './accountStore';
import type { RemoteEvent, SyncConflict, SyncReport, SyncTransport } from './types';

export const PUSH_BATCH = 200;
export const PULL_PAGE = 1000;

export class SyncEngine {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly cache: AccountEventStore,
    private readonly transport: SyncTransport,
    private readonly deviceId: string,
  ) {}

  /** Concurrent calls share one in-flight pass. */
  sync(): Promise<SyncReport> {
    if (!this.running) {
      this.running = this.pass().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async pass(): Promise<SyncReport> {
    const pushedIds = await this.pushPending();
    const { pulled, foreign, rejected } = await this.pullAll();
    this.cache.markSynced();
    const conflicts = foreign > 0 && pushedIds.length > 0 ? findConflicts(this.cache.load(), pushedIds) : [];
    return { pushed: pushedIds.length, pulled, foreign, conflicts, rejected };
  }

  private async pushPending(): Promise<string[]> {
    const pushed: string[] = [];
    // Snapshot: events made while we're pushing wait for the next pass.
    const queue = [...this.cache.pendingEvents()];
    for (let i = 0; i < queue.length; i += PUSH_BATCH) {
      const batch = queue.slice(i, i + PUSH_BATCH);
      await this.transport.push(batch, this.deviceId);
      pushed.push(...batch.map((e) => e.id));
    }
    return pushed;
  }

  private async pullAll(): Promise<{ pulled: number; foreign: number; rejected: number }> {
    let pulled = 0;
    let foreign = 0;
    let rejected = 0;
    for (;;) {
      const page = await this.transport.pull(this.cache.cursor, PULL_PAGE);
      if (page.length === 0) break;
      const accepted: RemoteEvent[] = [];
      for (const r of page) {
        // Never let one malformed event poison a device: skip it, but keep the cursor moving.
        if (eventProblem(r.event)) {
          rejected++;
          continue;
        }
        if (!this.cache.has(r.event.id)) foreign++;
        accepted.push(r);
      }
      this.cache.applyRemote(accepted, page[page.length - 1]!.seq);
      pulled += page.length;
      if (page.length < PULL_PAGE) break;
    }
    return { pulled, foreign, rejected };
  }
}

/**
 * A deed this device recorded that no longer counts after merging with other
 * devices' history — typically the same one-time quest or daily ritual cleared
 * on two devices while offline. The engine keeps exactly one (the first in
 * canonical order); we surface the other so progress never vanishes silently.
 */
export function findConflicts(log: readonly GameEvent[], ours: readonly string[]): SyncConflict[] {
  const state = replay(log);
  const counted = new Set(state.deeds.map((d) => d.id));
  const undone = new Set(log.flatMap((e) => (e.type === 'deed.undone' ? [e.targetEventId] : [])));
  const mine = new Set(ours);
  const conflicts: SyncConflict[] = [];
  for (const e of log) {
    if (!mine.has(e.id) || undone.has(e.id) || counted.has(e.id)) continue;
    if (e.type === 'quest.completed') {
      conflicts.push({ eventId: e.id, title: questTitle(state, e.questId), reason: describeQuestConflict(state, e.questId) });
    } else if (e.type === 'daily.completed') {
      const board = state.dailies[e.localDate];
      const contract = board?.contracts.find((c) => c.id === e.contractId);
      conflicts.push({
        eventId: e.id,
        title: contract?.title ?? 'A daily contract',
        reason: contract ? 'already fulfilled on another device' : 'from a board another device replaced — today’s board was issued there first',
      });
    } else if (e.type === 'campaign.chapterCleared') {
      const c = state.campaigns[e.campaignId];
      const ch = c?.chapters.find((x) => x.id === e.chapterId);
      conflicts.push({ eventId: e.id, title: ch?.title ?? 'A chapter', reason: 'already cleared on another device' });
    }
  }
  return conflicts;
}

function questTitle(state: GameState, questId: string): string {
  return state.quests[questId]?.title ?? 'A quest';
}

function describeQuestConflict(state: GameState, questId: string): string {
  const q = state.quests[questId];
  if (!q) return 'the quest no longer exists';
  if (q.status === 'retired') return 'the quest was retired on another device';
  if (q.cadence === 'daily') return 'already done that day on another device';
  return 'already cleared on another device';
}
