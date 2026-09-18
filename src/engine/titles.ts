import { ACHIEVEMENTS } from './achievements';
import { levelInfo } from './leveling';
import type { GameState } from './types';

export interface TitleDef {
  id: string;
  name: string;
  source: { kind: 'level'; level: number } | { kind: 'achievement'; achievementId: string };
}

const LEVEL_TITLES: [number, string, string][] = [
  [1, 'unwritten', 'The Unwritten'],
  [2, 'wanderer', 'Wanderer'],
  [4, 'pathfinder', 'Pathfinder'],
  [6, 'adventurer', 'Adventurer'],
  [9, 'veteran', 'Veteran'],
  [12, 'persistent', 'The Persistent'],
  [16, 'vanguard', 'Vanguard'],
  [20, 'legend-in-progress', 'Legend in Progress'],
  [30, 'mythic', 'Mythic'],
  [50, 'main-character', 'Main Character'],
];

const ACHIEVEMENT_TITLE_NAMES: Record<string, string> = {
  blooded: 'Blooded',
  polymath: 'Polymath',
  bossbreaker: 'Bossbreaker',
  campaigner: 'The Campaigner',
  returned: 'The Returned',
  nocturnal: 'Creature of the Night',
  'grass-toucher': 'Toucher of Grass',
};

export const TITLES: readonly TitleDef[] = [
  ...LEVEL_TITLES.map(([level, id, name]): TitleDef => ({ id, name, source: { kind: 'level', level } })),
  ...ACHIEVEMENTS.filter((a) => a.titleId).map(
    (a): TitleDef => ({
      id: a.titleId!,
      name: ACHIEVEMENT_TITLE_NAMES[a.titleId!] ?? a.titleId!,
      source: { kind: 'achievement', achievementId: a.id },
    }),
  ),
];

export const TITLE_BY_ID: ReadonlyMap<string, TitleDef> = new Map(TITLES.map((t) => [t.id, t]));

export function isTitleUnlocked(state: GameState, title: TitleDef): boolean {
  if (title.source.kind === 'level') return levelInfo(state.totalXp).level >= title.source.level;
  return Boolean(state.achievements[title.source.achievementId]);
}

export function unlockedTitleIds(state: GameState): Set<string> {
  return new Set(TITLES.filter((t) => isTitleUnlocked(state, t)).map((t) => t.id));
}

/** The title shown under the character's name. */
export function displayTitle(state: GameState): TitleDef {
  const equipped = state.character?.equippedTitleId;
  if (equipped) {
    const t = TITLE_BY_ID.get(equipped);
    if (t && isTitleUnlocked(state, t)) return t;
  }
  const level = levelInfo(state.totalXp).level;
  let best = TITLES[0]!;
  for (const t of TITLES) if (t.source.kind === 'level' && t.source.level <= level) best = t;
  return best;
}
