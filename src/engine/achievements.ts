import { ATTRIBUTES } from './constants';
import { levelInfo } from './leveling';
import type { Campaign, Deed, GameState, Quest } from './types';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** What just happened, as seen by achievement checks. State is already updated. */
export interface DeedContext {
  state: GameState;
  deed: Deed;
  quest?: Quest;
  campaign?: Campaign;
  /** Days since the previous active day, or null if this is the first deed ever. */
  gapDays: number | null;
  campaignCompleted: boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Hidden achievements show only this cryptic hint until discovered. */
  hint?: string;
  hidden: boolean;
  rarity: Rarity;
  /** Title granted on unlock (see titles.ts). */
  titleId?: string;
  check: (ctx: DeedContext) => boolean;
}

const OUTDOOR_RE =
  /\b(walk|walking|run|running|jog|jogging|hike|hiking|outside|outdoors?|park|grass|sun|sunlight|beach|garden|bike|cycling|swim|trail|forest|nature)\b/i;
const WATER_RE = /\b(water|hydrate|hydration)\b/i;

function deedsOn(state: GameState, date: string): number {
  let n = 0;
  for (const d of state.deeds) if (d.localDate === date) n++;
  return n;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-blood',
    name: 'FIRST BLOOD',
    description: 'Complete your first quest.',
    hidden: false,
    rarity: 'common',
    titleId: 'blooded',
    check: ({ state }) => state.deeds.length >= 1,
  },
  {
    id: 'getting-serious',
    name: 'GETTING SERIOUS',
    description: 'Complete 5 quests.',
    hidden: false,
    rarity: 'common',
    check: ({ state }) => state.deeds.length >= 5,
  },
  {
    id: 'hat-trick',
    name: 'HAT TRICK',
    description: 'Complete 3 quests in a single day.',
    hidden: false,
    rarity: 'common',
    check: ({ state, deed }) => deedsOn(state, deed.localDate) >= 3,
  },
  {
    id: 'grinding',
    name: 'GRINDING',
    description: 'Earn 1,000 XP.',
    hidden: false,
    rarity: 'rare',
    check: ({ state }) => state.totalXp >= 1000,
  },
  {
    id: 'twenty-five',
    name: 'QUARTER CENTURY',
    description: 'Complete 25 quests.',
    hidden: false,
    rarity: 'rare',
    check: ({ state }) => state.deeds.length >= 25,
  },
  {
    id: 'renaissance',
    name: 'RENAISSANCE',
    description: 'Earn XP in all five attributes.',
    hidden: false,
    rarity: 'rare',
    titleId: 'polymath',
    check: ({ state }) => ATTRIBUTES.every((a) => state.attributeXp[a] > 0),
  },
  {
    id: 'level-5',
    name: 'NOT A TUTORIAL ANYMORE',
    description: 'Reach level 5.',
    hidden: false,
    rarity: 'rare',
    check: ({ state }) => levelInfo(state.totalXp).level >= 5,
  },
  {
    id: 'absolute-cinema',
    name: 'ABSOLUTE CINEMA',
    description: 'Defeat a Boss quest.',
    hidden: false,
    rarity: 'epic',
    titleId: 'bossbreaker',
    check: ({ deed }) => deed.kind === 'quest' && deed.tier === 'boss',
  },
  {
    id: 'chapter-one',
    name: 'CHAPTER ONE',
    description: 'Clear the first chapter of a campaign.',
    hidden: false,
    rarity: 'common',
    check: ({ deed }) => deed.kind === 'chapter',
  },
  {
    id: 'the-long-game',
    name: 'THE LONG GAME',
    description: 'Complete an entire campaign.',
    hidden: false,
    rarity: 'legendary',
    titleId: 'campaigner',
    check: ({ campaignCompleted }) => campaignCompleted,
  },
  {
    id: 'level-10',
    name: 'DOUBLE DIGITS',
    description: 'Reach level 10.',
    hidden: false,
    rarity: 'epic',
    check: ({ state }) => levelInfo(state.totalXp).level >= 10,
  },
  /* ── Hidden: discovered, not chased ── */
  {
    id: 'the-comeback',
    name: 'THE COMEBACK',
    description: 'Return after days away and complete a quest.',
    hint: 'Leave. Then come back.',
    hidden: true,
    rarity: 'rare',
    titleId: 'returned',
    check: ({ gapDays }) => gapDays !== null && gapDays >= 3,
  },
  {
    id: 'night-owl',
    name: 'NIGHT OWL',
    description: 'Complete a quest between midnight and 5 AM.',
    hint: 'Some quests are cleared by moonlight.',
    hidden: true,
    rarity: 'rare',
    titleId: 'nocturnal',
    check: ({ deed }) => deed.localHour >= 0 && deed.localHour < 5,
  },
  {
    id: 'early-bird',
    name: 'EARLY BIRD',
    description: 'Complete a quest between 5 and 7 AM.',
    hint: 'The world is quiet. You are not.',
    hidden: true,
    rarity: 'rare',
    check: ({ deed }) => deed.localHour >= 5 && deed.localHour < 7,
  },
  {
    id: 'touch-grass',
    name: 'TOUCH GRASS',
    description: 'Complete a quest that took you outside.',
    hint: 'There is a bright room with no ceiling.',
    hidden: true,
    rarity: 'common',
    titleId: 'grass-toucher',
    check: ({ deed }) => OUTDOOR_RE.test(deed.title),
  },
  {
    id: 'hydration-check',
    name: 'HYDRATION CHECK',
    description: 'Complete a quest involving water.',
    hint: 'You are mostly made of it.',
    hidden: true,
    rarity: 'common',
    check: ({ deed }) => WATER_RE.test(deed.title),
  },
  {
    id: 'why-so-long',
    name: 'WHY DID THAT TAKE SO LONG',
    description: 'Clear a one-time quest that sat in your log for a week or more.',
    hint: 'Old quests still count.',
    hidden: true,
    rarity: 'rare',
    check: ({ quest, deed }) => {
      if (!quest || quest.cadence !== 'once') return false;
      const created = Date.parse(quest.createdAt);
      return Date.parse(deed.at) - created >= 7 * 86_400_000;
    },
  },
  {
    id: 'speedrun',
    name: 'SPEEDRUN ANY%',
    description: 'Clear a quest within a minute of accepting it.',
    hint: 'Accepted. Done. Next.',
    hidden: true,
    rarity: 'common',
    check: ({ state, quest, deed }) => {
      // Not during the first few deeds: accepting a suggestion and ticking it off shouldn't feel like a trophy.
      if (state.deeds.length < 5) return false;
      if (!quest || quest.timesCompleted !== 1) return false;
      return Date.parse(deed.at) - Date.parse(quest.createdAt) <= 60_000;
    },
  },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Returns ids of achievements newly satisfied by this deed, in catalog order. */
export function evaluateAchievements(ctx: DeedContext): string[] {
  const unlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (ctx.state.achievements[def.id]) continue;
    if (def.check(ctx)) unlocked.push(def.id);
  }
  return unlocked;
}
