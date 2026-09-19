/**
 * Personalization: who this player is, turned into what the game asks of them.
 *
 * Three signals, all local and deterministic:
 *
 *   1. DECLARED — interests the player names ("guitar", "rubik's cube",
 *      "pottery"), each with a self-rated skill level. Free text is matched
 *      against the catalog; anything unknown gets sensible generic tasks.
 *   2. INFERRED — interests the Game Master notices in the player's own quest
 *      log ("Practice guitar" completed 6 times → guitar). They feed contracts
 *      lightly and are offered to the player to confirm or dismiss.
 *   3. EXPERIENCE — every interest contract fulfilled and every matching quest
 *      completed raises the player's rank in that interest, so tasks get
 *      harder as they do: Novice → Adept → Expert.
 *
 * The output is a list of resolved interests and the contract candidates they
 * contribute. Same state in, same interests out — two devices always agree.
 */
import { ATTRIBUTE_INFO, type Attribute } from './constants';
import type { Candidate } from './contracts';
import { INTEREST_CATALOG, INTERESTS_BY_ID, type InterestDef, type InterestRank, type InterestTask } from './interestCatalog';
import type { GameState } from './types';

export interface ResolvedInterest {
  /** Stable identity: the catalog id, or `x-<slug>` for a custom interest. */
  id: string;
  /** What the player sees: the catalog name, or their own words. */
  name: string;
  def: InterestDef | null;
  attribute: Attribute;
  source: 'declared' | 'inferred';
  /** Self-rated skill (declared interests only). */
  declaredRank: InterestRank;
  /** Interest deeds completed: contracts plus matching quests. */
  experience: number;
  /** Effective rank: the higher of declared and earned. */
  rank: InterestRank;
  /** For inferred interests: how strong the signal is. */
  score?: number;
}

/** Deeds needed to earn each rank. */
export const RANK_THRESHOLDS: Record<InterestRank, number> = { 1: 0, 2: 12, 3: 40 };
/** How strong a quest-log signal must be before the GM acts on it. */
export const INFER_MIN_SCORE = 3;
/** How many inferred interests may feed contracts. */
export const INFER_MAX_ACTIVE = 2;

/* ─────────────────────────── text matching ─────────────────────────── */

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9.+#]+/g, ' ')
    .trim();
}

function hasPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

/** The catalog interest a piece of text refers to, preferring the longest alias match. */
export function matchInterest(text: string): InterestDef | null {
  const t = normalizeText(text);
  if (!t) return null;
  let best: { d: InterestDef; len: number } | null = null;
  for (const d of INTEREST_CATALOG) {
    for (const phrase of [normalizeText(d.name), d.id.replace(/-/g, ' '), ...d.aliases.map(normalizeText)]) {
      if (hasPhrase(t, phrase) && (!best || phrase.length > best.len)) best = { d, len: phrase.length };
    }
  }
  return best?.d ?? null;
}

export function slug(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'interest';
}

/** Does this quest/deed title belong to the interest? */
function titleMatches(title: string, interest: { def: InterestDef | null; name: string }): boolean {
  if (interest.def) return matchInterest(title)?.id === interest.def.id;
  return hasPhrase(normalizeText(title), normalizeText(interest.name));
}

/* ─────────────────────────── custom interests ─────────────────────────── */

const ATTRIBUTE_HINTS: [Attribute, string[]][] = [
  ['STR', ['sport', 'sports', 'train', 'training', 'climb', 'climbing', 'boxing', 'martial', 'karate', 'judo', 'tennis', 'badminton', 'hiking', 'hike', 'skate', 'skating', 'surf', 'surfing', 'ski', 'skiing', 'rowing', 'volleyball', 'hockey', 'parkour', 'fitness']],
  ['INT', ['study', 'learn', 'learning', 'history', 'philosophy', 'research', 'puzzle', 'puzzles', 'sudoku', 'investing', 'economics', 'astronomy', 'biology', 'robotics', 'electronics', 'trivia']],
  ['CHA', ['friends', 'people', 'volunteer', 'volunteering', 'acting', 'theatre', 'theater', 'comedy', 'improv', 'networking', 'teaching', 'mentoring', 'community', 'streaming', 'content']],
  ['VIT', ['sleep', 'health', 'nutrition', 'diet', 'walking', 'walk', 'nature', 'self care', 'skincare', 'hydration', 'tea', 'fishing']],
];

export function guessAttribute(text: string): Attribute {
  const t = normalizeText(text);
  for (const [attr, words] of ATTRIBUTE_HINTS) if (words.some((w) => hasPhrase(t, w))) return attr;
  return 'DEX'; // most hobbies are practised skills
}

function genericTasks(id: string, name: string): InterestTask[] {
  const k = (s: string) => `i-${id}-${s}`;
  return [
    { key: k('touch'), title: `Spend 10 minutes on ${name}`, detail: 'Small, but it keeps the thread unbroken.', effort: 1, ranks: [1, 2, 3] },
    { key: k('learn'), title: `Learn one new thing about ${name}`, detail: 'A technique, a fact, a trick — then try it.', effort: 1, ranks: [1, 2] },
    { key: k('session'), title: `Do a 30-minute ${name} session`, effort: 2, ranks: [1, 2, 3] },
    { key: k('basics'), title: `Drill the fundamentals of ${name} for 20 minutes`, effort: 2, ranks: [1] },
    { key: k('weak'), title: `Work on your weakest area in ${name} for 30 minutes`, detail: 'The part you usually skip.', effort: 2, ranks: [2, 3] },
    { key: k('deep'), title: `Do a focused hour of ${name}`, detail: 'One hour, one goal, no distractions.', effort: 3, ranks: [1, 2, 3] },
    { key: k('make'), title: `Finish something in ${name} and show someone`, effort: 3, ranks: [2, 3] },
  ];
}

/* ─────────────────────────── experience ─────────────────────────── */

function experienceFor(state: GameState, interest: { id: string; def: InterestDef | null; name: string }): number {
  let n = 0;
  for (const board of Object.values(state.dailies)) {
    for (const c of board.contracts) {
      if (!board.completed.includes(c.id)) continue;
      if (c.key.startsWith(`i-${interest.id}-`)) n++;
    }
  }
  for (const d of state.deeds) {
    if (d.kind !== 'contract' && titleMatches(d.title, interest)) n++;
  }
  return n;
}

export function earnedRank(experience: number): InterestRank {
  if (experience >= RANK_THRESHOLDS[3]) return 3;
  if (experience >= RANK_THRESHOLDS[2]) return 2;
  return 1;
}

/** Deeds until the next rank, or null at Expert. */
export function toNextRank(interest: ResolvedInterest): number | null {
  if (interest.rank === 3) return null;
  return Math.max(0, RANK_THRESHOLDS[(interest.rank + 1) as InterestRank] - interest.experience);
}

/* ─────────────────────────── resolution ─────────────────────────── */

export function interestLevelKey(name: string): string {
  return normalizeText(name);
}

/** The player's declared interests, resolved against the catalog. */
export function declaredInterests(state: GameState): ResolvedInterest[] {
  const out: ResolvedInterest[] = [];
  const seen = new Set<string>();
  for (const raw of state.interests) {
    const def = matchInterest(raw);
    const id = def ? def.id : `x-${slug(raw)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = def ? def.name : raw;
    const declaredRank = (state.interestLevels[interestLevelKey(raw)] ?? 1) as InterestRank;
    const experience = experienceFor(state, { id, def, name });
    out.push({
      id,
      name,
      def,
      attribute: def?.attribute ?? guessAttribute(raw),
      source: 'declared',
      declaredRank,
      experience,
      rank: Math.max(declaredRank, earnedRank(experience)) as InterestRank,
    });
  }
  return out;
}

/**
 * Interests the Game Master has noticed in the quest log but the player hasn't
 * declared (or dismissed). Strongest signal first.
 */
export function inferredInterests(state: GameState): ResolvedInterest[] {
  const declared = new Set(declaredInterests(state).map((i) => i.id));
  const dismissed = new Set(state.dismissedInterests);
  const scores = new Map<string, number>();
  const bump = (title: string, by: number) => {
    const def = matchInterest(title);
    if (def && !declared.has(def.id) && !dismissed.has(def.id)) scores.set(def.id, (scores.get(def.id) ?? 0) + by);
  };
  for (const id of state.questOrder) {
    const q = state.quests[id];
    if (q?.status === 'active') bump(q.title, 2);
  }
  for (const d of state.deeds.slice(-200)) if (d.kind === 'quest' || d.kind === 'chapter') bump(d.title, 1);

  return [...scores.entries()]
    .filter(([, score]) => score >= INFER_MIN_SCORE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, score]) => {
      const def = INTERESTS_BY_ID[id]!;
      const experience = experienceFor(state, { id, def, name: def.name });
      const rank = earnedRank(experience);
      return { id, name: def.name, def, attribute: def.attribute, source: 'inferred' as const, declaredRank: 1 as InterestRank, experience, rank, score };
    });
}

/** Everything that shapes today's contracts: declared interests plus the strongest inferred ones. */
export function activeInterests(state: GameState): ResolvedInterest[] {
  return [...declaredInterests(state), ...inferredInterests(state).slice(0, INFER_MAX_ACTIVE)];
}

/* ─────────────────────────── tasks ─────────────────────────── */

/** An interest's tasks for the player's rank; if an effort level has none at that rank, the nearest rank fills in. */
export function tasksForRank(tasks: readonly InterestTask[], rank: InterestRank): InterestTask[] {
  const out: InterestTask[] = [];
  for (const effort of [1, 2, 3] as const) {
    const atEffort = tasks.filter((t) => t.effort === effort);
    const exact = atEffort.filter((t) => t.ranks.includes(rank));
    if (exact.length) {
      out.push(...exact);
      continue;
    }
    const distance = (t: InterestTask) => Math.min(...t.ranks.map((r) => Math.abs(r - rank)));
    const nearest = Math.min(...atEffort.map(distance));
    out.push(...atEffort.filter((t) => distance(t) === nearest));
  }
  return out;
}

export function interestTasks(state: GameState): Candidate[] {
  return activeInterests(state).flatMap((i) =>
    tasksForRank(i.def ? i.def.tasks : genericTasks(i.id, i.name), i.rank).map((t) => ({
      key: t.key,
      title: t.title,
      ...(t.detail ? { detail: t.detail } : {}),
      attribute: i.attribute,
      effort: t.effort,
      interest: i.name,
    })),
  );
}

/** The suggested repeatable quest for an interest. */
export function interestQuest(i: ResolvedInterest): { title: string; pitch: string } {
  if (i.def) return i.def.quest;
  return { title: `Practice ${i.name} for 20 minutes`, pitch: `${ATTRIBUTE_INFO[i.attribute].name} grows where you spend it.` };
}
