/**
 * Progression curves.
 *
 * Character level: early levels come fast (2 quests to reach level 2) so the
 * loop is felt immediately; the cost per level grows ~L^1.4 so later levels
 * mean something without becoming a grind wall.
 *
 *   L1→2: 100   L2→3: 180   L3→4: 280   L5→6: 530   L10→11: 1310   L20→21: 3360
 */

export const MAX_LEVEL = 999;

export function xpToNextLevel(level: number): number {
  return Math.round((50 + 50 * Math.pow(level, 1.4)) / 10) * 10;
}

/** Total XP needed to *reach* `level` from zero. */
export function totalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNextLevel(l);
  return sum;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  /** 0..1 */
  progress: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let floor = 0;
  while (level < MAX_LEVEL && xp >= floor + xpToNextLevel(level)) {
    floor += xpToNextLevel(level);
    level++;
  }
  const xpForLevel = xpToNextLevel(level);
  const xpIntoLevel = xp - floor;
  return { level, xpIntoLevel, xpForLevel, progress: Math.min(1, xpIntoLevel / xpForLevel) };
}

/**
 * Attribute rank: rank r is reached at 25·(r−1)² attribute XP.
 * One standard quest lifts a fresh attribute to 2; rank 11 takes ~50 quests.
 */
export function attributeRank(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 25));
}

export function attributeRankInfo(xp: number): { rank: number; progress: number; xpToNext: number } {
  const rank = attributeRank(xp);
  const floor = 25 * (rank - 1) ** 2;
  const ceil = 25 * rank ** 2;
  return { rank, progress: (xp - floor) / (ceil - floor), xpToNext: ceil - xp };
}
