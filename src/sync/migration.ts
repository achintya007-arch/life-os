/**
 * Guest → account linking.
 *
 *   inspect   pull the account's cloud log, compare with the guest save → a plan
 *   execute   back up → upload (idempotent) → verify against the server
 *             → switch the device to the account → retire the guest save
 *
 * Properties:
 *   • Retryable & idempotent: event ids dedupe on the server, so re-running
 *     after any failure never duplicates anything.
 *   • Never destructive before verification: the guest save and a backup copy
 *     stay untouched until the server provably holds every uploaded event.
 *   • Explicit: a guest character never silently overwrites (or is silently
 *     overwritten by) an account character — the player chooses.
 */
import { levelInfo } from '../engine/leveling';
import { replay } from '../engine/project';
import type { GameEvent } from '../engine/types';
import { createBackup, deleteBackup, listBackups } from '../store/backups';
import { LocalEventStore } from '../store/eventStore';
import type { KeyValue } from '../store/keyValue';
import { AccountEventStore } from './accountStore';
import { GUEST_SAVE_KEY, writeMode } from './deviceSession';
import { PULL_PAGE, SyncEngine } from './syncEngine';
import { SyncError, type RemoteEvent, type SyncTransport } from './types';

export interface SaveSummary {
  name: string | null;
  level: number;
  totalXp: number;
  deeds: number;
  events: number;
}

export type LinkPlan =
  /** Nothing on either side: the account simply starts here. */
  | { kind: 'fresh'; remote: RemoteEvent[] }
  /** No guest progress; the account has a character → load it. */
  | { kind: 'adopt'; remote: RemoteEvent[]; account: SaveSummary }
  /** Guest progress; the account is empty → upload it. */
  | { kind: 'upload'; remote: RemoteEvent[]; guest: SaveSummary }
  /** Both have a character → the player decides. */
  | { kind: 'choose'; remote: RemoteEvent[]; guest: SaveSummary; account: SaveSummary };

export type LinkChoice = 'upload' | 'merge' | 'keep-account' | 'adopt';

export function summarize(events: readonly GameEvent[]): SaveSummary {
  const s = replay(events);
  return {
    name: s.character?.name ?? null,
    level: levelInfo(s.totalXp).level,
    totalXp: s.totalXp,
    deeds: s.deeds.length,
    events: events.length,
  };
}

export async function pullEverything(transport: SyncTransport): Promise<RemoteEvent[]> {
  const out: RemoteEvent[] = [];
  let cursor = 0;
  for (;;) {
    const page = await transport.pull(cursor, PULL_PAGE);
    out.push(...page);
    if (page.length < PULL_PAGE) return out;
    cursor = page[page.length - 1]!.seq;
  }
}

export async function inspectLink(guestEvents: readonly GameEvent[], transport: SyncTransport): Promise<LinkPlan> {
  const remote = await pullEverything(transport);
  const remoteEvents = remote.map((r) => r.event);
  const guestHas = replay(guestEvents).character !== null;
  const remoteHas = replay(remoteEvents).character !== null;

  if (!guestHas) {
    if (remoteHas) return { kind: 'adopt', remote, account: summarize(remoteEvents) };
    return guestEvents.length ? { kind: 'upload', remote, guest: summarize(guestEvents) } : { kind: 'fresh', remote };
  }
  if (!remoteHas) return { kind: 'upload', remote, guest: summarize(guestEvents) };
  return { kind: 'choose', remote, guest: summarize(guestEvents), account: summarize(remoteEvents) };
}

/** Identity events from the guest are dropped when merging into an existing character. */
const IDENTITY_TYPES = new Set<GameEvent['type']>(['character.created', 'character.renamed', 'character.titleEquipped']);

export interface LinkParams {
  storage: KeyValue;
  transport: SyncTransport;
  userId: string;
  email: string;
  deviceId: string;
  guestEvents: readonly GameEvent[];
  plan: LinkPlan;
  choice: LinkChoice;
}

export interface LinkResult {
  uploaded: number;
  /** Backup kept on this device (only when guest progress was NOT uploaded). */
  keptBackupId: string | null;
}

export class LinkError extends Error {}

export async function executeLink(p: LinkParams): Promise<LinkResult> {
  const { storage, transport, guestEvents, plan, choice } = p;
  const allowed: Record<LinkPlan['kind'], LinkChoice[]> = {
    fresh: ['adopt'],
    adopt: ['adopt'],
    upload: ['upload'],
    choose: ['merge', 'keep-account'],
  };
  if (!allowed[plan.kind].includes(choice)) throw new LinkError(`“${choice}” is not a valid choice here.`);

  // 1 — Safety copy first. Nothing below touches the guest save until verified.
  const label = `Guest save before linking ${p.email}`;
  const existing = listBackups(storage).find((b) => b.label === label && b.eventCount === guestEvents.length);
  const backup = guestEvents.length ? (existing ?? createBackup(storage, guestEvents, label, 'guest')) : null;

  // 2 — Seed the account cache with what the cloud already has.
  const cache = new AccountEventStore(storage, p.userId);
  const maxSeq = plan.remote.length ? plan.remote[plan.remote.length - 1]!.seq : 0;
  cache.applyRemote(plan.remote, maxSeq);

  // 3 — Queue the guest's history for upload, per the player's choice.
  let toUpload: GameEvent[] = [];
  if (choice === 'upload') toUpload = [...guestEvents];
  else if (choice === 'merge') toUpload = guestEvents.filter((e) => !IDENTITY_TYPES.has(e.type));
  cache.save([...cache.load(), ...toUpload]);

  // 4 — Upload and pull (idempotent; safe to retry after any failure).
  const engine = new SyncEngine(cache, transport, p.deviceId);
  try {
    await engine.sync();
  } catch (e) {
    const offline = e instanceof SyncError && e.kind === 'offline';
    throw new LinkError(
      offline
        ? 'Connection lost while uploading. Your guest save is untouched — try again when you’re back online.'
        : 'The cloud rejected the upload. Your guest save is untouched — try again.',
      { cause: e },
    );
  }

  // 5 — Verify against a fresh read of the server, not our own bookkeeping.
  if (cache.pendingEvents().length > 0) throw new LinkError('Upload did not complete. Your guest save is untouched — try again.');
  const serverIds = new Set((await pullEverything(transport)).map((r) => r.event.id));
  const missing = toUpload.filter((e) => !serverIds.has(e.id));
  if (missing.length) throw new LinkError(`The cloud is missing ${missing.length} events. Your guest save is untouched — try again.`);
  const localIds = cache.load().map((e) => e.id);
  if (localIds.some((id) => !serverIds.has(id))) throw new LinkError('Cloud verification failed. Your guest save is untouched — try again.');

  // 6 — Switch this device to the account, then retire the guest save.
  cache.markSynced();
  writeMode(storage, { kind: 'account', userId: p.userId, email: p.email });
  new LocalEventStore(storage, GUEST_SAVE_KEY).clear();

  // The guest progress now lives in the cloud. If it did NOT go to the cloud
  // (the player kept the account's character), the backup is its only copy: keep it.
  const guestProgressUploaded = choice === 'upload' || choice === 'merge';
  if (backup && guestProgressUploaded) deleteBackup(storage, backup.id);
  return { uploaded: toUpload.length, keptBackupId: backup && !guestProgressUploaded ? backup.id : null };
}

/**
 * Events from another save (import, backup restore) that can be safely added
 * to `existing`: unseen ids only, and — when a character already exists —
 * without the other save's identity events, so a merge adds progress but never
 * renames or replaces the current character.
 */
export function mergeableEvents(existing: readonly GameEvent[], incoming: readonly GameEvent[]): GameEvent[] {
  const known = new Set(existing.map((e) => e.id));
  const hasCharacter = replay(existing).character !== null;
  return incoming.filter((e) => !known.has(e.id) && !(hasCharacter && IDENTITY_TYPES.has(e.type)));
}
