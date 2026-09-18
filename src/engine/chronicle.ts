/**
 * The Chronicle: history, aggregated. Built entirely from deeds and XP
 * transactions — which is exactly why XP is recorded as a ledger.
 */
import { ATTRIBUTES, type Attribute } from './constants';
import { addDays, daysInMonth, monthKey, type LocalDate, type MonthKey } from './dates';
import { levelInfo } from './leveling';
import type { Deed, GameState } from './types';

export interface MonthChronicle {
  month: MonthKey;
  xp: number;
  deeds: Deed[];
  levelStart: number;
  levelEnd: number;
  activeDays: number;
  /** XP per day, index 0 = day 1. */
  dailyXp: number[];
  byAttribute: Record<Attribute, { count: number; xp: number }>;
  achievements: string[];
  biggestWin: Deed | null;
  /** Most-repeated quests this month, e.g. "Practice guitar ×8". */
  topRepeats: { title: string; attribute: Attribute; count: number }[];
}

export function chronicleFor(state: GameState, month: MonthKey): MonthChronicle {
  const deeds = state.deeds.filter((d) => monthKey(d.localDate) === month);
  let xpBefore = 0;
  let xp = 0;
  for (const t of state.transactions) {
    const m = monthKey(t.localDate);
    if (m < month) xpBefore += t.amount;
    else if (m === month) xp += t.amount;
  }

  const dailyXp = new Array<number>(daysInMonth(month)).fill(0);
  for (const t of state.transactions) {
    if (monthKey(t.localDate) !== month) continue;
    const day = Number(t.localDate.slice(8, 10));
    dailyXp[day - 1] = (dailyXp[day - 1] ?? 0) + t.amount;
  }

  const byAttribute = Object.fromEntries(ATTRIBUTES.map((a) => [a, { count: 0, xp: 0 }])) as MonthChronicle['byAttribute'];
  const repeats = new Map<string, { title: string; attribute: Attribute; count: number }>();
  let biggestWin: Deed | null = null;
  for (const d of deeds) {
    byAttribute[d.attribute].count++;
    byAttribute[d.attribute].xp += d.xp;
    if (!biggestWin || d.xp > biggestWin.xp) biggestWin = d;
    const key = d.kind + ':' + d.refId;
    const r = repeats.get(key) ?? { title: d.title, attribute: d.attribute, count: 0 };
    r.count++;
    repeats.set(key, r);
  }

  const achievements = Object.values(state.achievements)
    .filter((u) => {
      const deed = state.deeds.find((d) => d.id === u.deedId);
      return deed ? monthKey(deed.localDate) === month : false;
    })
    .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt))
    .map((u) => u.achievementId);

  return {
    month,
    xp,
    deeds,
    levelStart: levelInfo(xpBefore).level,
    levelEnd: levelInfo(xpBefore + xp).level,
    activeDays: dailyXp.filter((v) => v > 0).length,
    dailyXp,
    byAttribute,
    achievements,
    biggestWin,
    topRepeats: [...repeats.values()]
      .filter((r) => r.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  };
}

/** Months that have any recorded deeds, newest first. */
export function chronicleMonths(state: GameState): MonthKey[] {
  return [...new Set(state.deeds.map((d) => monthKey(d.localDate)))].sort().reverse();
}

/** Which of the 7 days (Mon..Sun) starting at `weekStart` had at least one deed. */
export function weekActivity(state: GameState, weekStart: LocalDate): boolean[] {
  const active = new Set(state.deeds.map((d) => d.localDate));
  return Array.from({ length: 7 }, (_, i) => active.has(addDays(weekStart, i)));
}
