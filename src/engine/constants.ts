/**
 * Static game rules. Everything tunable about the RPG lives here so balance
 * changes never require touching engine logic.
 */

export const ATTRIBUTES = ['STR', 'INT', 'DEX', 'VIT', 'CHA'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_INFO: Record<Attribute, { name: string; domain: string }> = {
  STR: { name: 'Strength', domain: 'Movement, exercise, physical challenges' },
  INT: { name: 'Intellect', domain: 'Study, learning, technical work' },
  DEX: { name: 'Dexterity', domain: 'Practice, instruments, craft' },
  VIT: { name: 'Vitality', domain: 'Sleep, food, recovery, routines' },
  CHA: { name: 'Charisma', domain: 'People, voice, courage' },
};

export const TIERS = ['tiny', 'standard', 'challenge', 'boss'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_INFO: Record<Tier, { label: string; xp: number; blurb: string }> = {
  tiny: { label: 'Tiny', xp: 10, blurb: 'Two minutes. Drink water, make the bed.' },
  standard: { label: 'Quest', xp: 50, blurb: 'A real session. Practice, study, train.' },
  challenge: { label: 'Challenge', xp: 150, blurb: 'Hard. The thing you keep putting off.' },
  boss: { label: 'Boss', xp: 500, blurb: 'A milestone. Ship it. Finish it. End it.' },
};

export const CADENCES = ['once', 'daily'] as const;
export type Cadence = (typeof CADENCES)[number];

/** XP awarded for clearing a campaign chapter, and the bonus for finishing a campaign. */
export const CHAPTER_XP = 150;
export const CAMPAIGN_COMPLETE_BONUS_XP = 500;

/** XP for each non-final strike on a multi-hit boss (the final strike pays the full boss XP). */
export const BOSS_STRIKE_XP = 80;
export const BOSS_MAX_HITS = 10;

/** Weekly goal bonus, per completion targeted. A 3× goal pays 60 XP. */
export const WEEKLY_BONUS_PER_TARGET = 20;
export const WEEKLY_MAX_TARGET = 7;
export const WEEKLY_MAX_GOALS = 3;

/**
 * Rested XP: coming back after time away is rewarded, never punished.
 * If the last active day was at least RESTED_GAP_DAYS ago, the first deed of the
 * return earns a bonus.
 */
export const RESTED_GAP_DAYS = 3;
export const RESTED_BONUS_RATIO = 0.5;
export const RESTED_BONUS_MIN = 10;

export const LIMITS = {
  nameMax: 32,
  questTitleMax: 100,
  notesMax: 500,
  campaignNameMax: 80,
  chaptersMin: 1,
  chaptersMax: 12,
  goalLabelMax: 60,
  interestsMax: 8,
  interestLengthMax: 30,
};
