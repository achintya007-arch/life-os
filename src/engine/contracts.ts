/**
 * Daily contracts: three system-issued tasks per day, worth a fixed XP budget
 * that is ONLY earnable through them. The player can't edit them — that's the
 * challenge — but missing them costs nothing; tomorrow brings a new board.
 *
 *   slot 1 · DAILY      — a small task that strengthens the weakest attribute
 *   slot 2 · CLASS      — a real session in the class's primary attribute
 *                         (or the player's interests, when they match)
 *   slot 3 · CHALLENGE  — the Game Master's pick: a quest the player has been
 *                         avoiding, or a hard push when nothing is neglected
 *
 * Generation is deterministic (seeded by the character and the date), so two
 * devices issuing the same day's board from the same history agree exactly.
 */
import { CLASSES } from './classes';
import { ATTRIBUTES, type Attribute } from './constants';
import { addDays, daysBetween, type LocalDate } from './dates';
import { levelInfo } from './leveling';
import { interestTasks } from './interests';
import { BASE_TASKS, type TaskTemplate } from './taskLibrary';
import type { Contract, DailyBoard, GameState, Quest } from './types';

export const CONTRACT_SPLIT = [0.25, 0.3, 0.45] as const;

/** Daily contract XP: meaningful early, growing slowly so it stays relevant at every level. */
export function dailyBudget(level: number): number {
  return Math.min(400, Math.round((80 + 20 * level) / 10) * 10);
}

export function splitBudget(budget: number): number[] {
  const first = Math.round((budget * CONTRACT_SPLIT[0]) / 5) * 5;
  const second = Math.round((budget * CONTRACT_SPLIT[1]) / 5) * 5;
  return [first, second, budget - first - second];
}

/* ─────────────────────────── seeded randomness ─────────────────────────── */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], r: () => number): T | undefined {
  return items.length ? items[Math.floor(r() * items.length)] : undefined;
}

/* ─────────────────────────── task sources ─────────────────────────── */

/** A candidate task, possibly tied to one of the player's interests. */
export interface Candidate extends TaskTemplate {
  interest?: string;
}

/** All tasks the generator may choose from: the base library plus the player's interests. */
function candidates(state: GameState): Candidate[] {
  return [...BASE_TASKS, ...interestTasks(state)];
}

/* ─────────────────────────── generation ─────────────────────────── */

/** The one-time quest the player has avoided longest (challenge-tier and up preferred). */
function neglectedQuest(state: GameState, date: LocalDate): Quest | null {
  let best: { q: Quest; score: number } | null = null;
  for (const id of state.questOrder) {
    const q = state.quests[id];
    if (!q || q.status !== 'active' || q.cadence !== 'once') continue;
    const idle = daysBetween(q.lastCompletedDate ?? q.createdDate, date);
    if (idle < 3) continue;
    const weight = { tiny: 0, standard: 1, challenge: 2, boss: 3 }[q.tier];
    const score = idle + weight * 3;
    if (!best || score > best.score) best = { q, score };
  }
  return best?.q ?? null;
}

function weakestAttribute(state: GameState, r: () => number): Attribute {
  const min = Math.min(...ATTRIBUTES.map((a) => state.attributeXp[a]));
  const tied = ATTRIBUTES.filter((a) => state.attributeXp[a] === min);
  return pick(tied, r) ?? 'VIT';
}

export function generateDailyBoard(state: GameState, date: LocalDate, issuedAt: string): DailyBoard {
  const seedBase = `${state.character?.createdAt ?? ''}|${date}`;
  const r = rng(hash(seedBase));
  const level = levelInfo(state.totalXp).level;
  const budget = dailyBudget(level);
  const [xp1, xp2, xp3] = splitBudget(budget) as [number, number, number];

  const pool = candidates(state);
  const yesterday = state.dailies[addDays(date, -1)];
  const recentKeys = new Set(yesterday?.contracts.map((c) => c.key) ?? []);
  const activeTitles = new Set(
    state.questOrder.map((id) => state.quests[id]!).filter((q) => q.status === 'active').map((q) => q.title.toLowerCase()),
  );
  const used = new Set<string>();

  const choose = (filter: (c: Candidate) => boolean): Candidate | undefined => {
    const ok = (c: Candidate) => filter(c) && !used.has(c.key) && !activeTitles.has(c.title.toLowerCase());
    // Prefer fresh tasks (not on yesterday's board); fall back to any.
    const fresh = pool.filter((c) => ok(c) && !recentKeys.has(c.key));
    const chosen = pick(fresh.length ? fresh : pool.filter(ok), r);
    if (chosen) used.add(chosen.key);
    return chosen;
  };

  const classDef = state.character?.classId ? CLASSES[state.character.classId] : null;
  const contracts: Contract[] = [];
  const make = (slot: number, c: Candidate, xp: number, kind: Contract['kind'], extra: Partial<Contract> = {}): Contract => ({
    id: `${date}:${slot}:${c.key}`,
    key: c.key,
    title: c.title,
    ...(c.detail ? { detail: c.detail } : {}),
    attribute: c.attribute,
    xp,
    kind,
    ...(c.interest ? { interest: c.interest } : {}),
    ...extra,
  });

  // Slot 1 — the weakest attribute, a small step.
  const weak = weakestAttribute(state, r);
  const daily = choose((c) => c.attribute === weak && c.effort === 1 && !c.interest) ?? choose((c) => c.effort === 1);
  if (daily) contracts.push(make(1, daily, xp1, 'daily'));

  // Slot 2 — the class's craft. An interest in that attribute wins; otherwise any interest; otherwise the class pool.
  const classAttr = classDef?.primary ?? pick(ATTRIBUTES, r)!;
  const second =
    choose((c) => !!c.interest && c.attribute === classAttr && c.effort === 2) ??
    choose((c) => !!c.interest && c.effort === 2) ??
    choose((c) => c.attribute === classAttr && c.effort === 2 && !c.interest) ??
    choose((c) => c.effort === 2);
  if (second) contracts.push(make(2, second, xp2, second.interest ? 'interest' : 'class'));

  // Slot 3 — the Game Master's challenge.
  const avoided = neglectedQuest(state, date);
  if (avoided) {
    const idle = daysBetween(avoided.lastCompletedDate ?? avoided.createdDate, date);
    contracts.push({
      id: `${date}:3:quest:${avoided.id}`,
      key: `quest:${avoided.id}`,
      title: `Break the silence: 25 focused minutes on “${avoided.title}”`,
      detail: `Untouched for ${idle} days. You don’t have to finish it — just open the door.`,
      attribute: avoided.attribute,
      xp: xp3,
      kind: 'challenge',
      questId: avoided.id,
    });
  } else {
    const hardAttr = classDef?.secondary ?? weak;
    const hard =
      choose((c) => !!c.interest && c.effort === 3) ??
      choose((c) => c.attribute === hardAttr && c.effort === 3) ??
      choose((c) => c.effort === 3);
    if (hard) contracts.push(make(3, hard, xp3, 'challenge'));
  }

  return { date, budget, contracts, completed: [], issuedAt };
}
