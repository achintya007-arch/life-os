/**
 * The Game Master — a narrator with opinions.
 *
 * Fully local and deterministic: lines are chosen by seeded hash so the GM
 * doesn't flicker between renders, but still varies day to day. The shape of
 * these functions (state in → narration out) is deliberately the seam where an
 * LLM-backed GM can be plugged in later, with the player's permission.
 */
import { ATTRIBUTES, ATTRIBUTE_INFO, RESTED_GAP_DAYS, TIER_INFO, type Attribute, type Cadence, type Tier } from './constants';
import { ACHIEVEMENT_BY_ID } from './achievements';
import { addDays, daysBetween, toLocalDate } from './dates';
import { levelInfo } from './leveling';
import type { Effect, GameState, Quest, QuestDraft } from './types';

/* ─────────────────────────── utilities ─────────────────────────── */

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length]!;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/* ─────────────────────────── briefing ─────────────────────────── */

export interface Spotlight {
  questId: string;
  codename: string;
  lines: string[];
}

export interface Briefing {
  salutation: string;
  lines: string[];
  spotlight: Spotlight | null;
  restedActive: boolean;
}

function salutationFor(hour: number, seed: string): string {
  if (hour < 5) return pick(['STILL AWAKE, ADVENTURER?', 'THE NIGHT SHIFT BEGINS.', 'BURNING THE MIDNIGHT OIL.'], seed);
  if (hour < 12) return pick(['GOOD MORNING, ADVENTURER.', 'A NEW DAY LOADS.', 'MORNING. THE BOARD IS SET.'], seed);
  if (hour < 18) return pick(['GOOD AFTERNOON, ADVENTURER.', 'THE DAY IS STILL YOURS.', 'AFTERNOON REPORT.'], seed);
  return pick(['GOOD EVENING, ADVENTURER.', 'EVENING. TIME TO TALLY.', 'THE DAY WINDS DOWN.'], seed);
}

const NEGLECT_DAYS = 4;

/** A quest the player has been circling. Oldest untouched one-time quest wins; challenge+ preferred. */
export function findNeglectedQuest(state: GameState, today: string): Quest | null {
  let best: { quest: Quest; score: number } | null = null;
  for (const id of state.questOrder) {
    const q = state.quests[id];
    if (!q || q.status !== 'active') continue;
    const since = q.lastCompletedDate ?? q.createdDate;
    const idle = daysBetween(since, today);
    if (idle < NEGLECT_DAYS) continue;
    if (q.cadence === 'daily' && q.timesCompleted === 0) continue;
    const weight = { tiny: 0, standard: 1, challenge: 2, boss: 3 }[q.tier];
    const score = idle + weight * 3;
    if (!best || score > best.score) best = { quest: q, score };
  }
  return best?.quest ?? null;
}

const CODENAME_NOUNS: Record<Attribute, string[]> = {
  STR: ['IDLE BLADE', 'SILENT GYM', 'RESTLESS BODY'],
  INT: ['ABANDONED REPOSITORY', 'UNREAD SCROLL', 'DORMANT MIND'],
  DEX: ['DUSTY INSTRUMENT', 'UNFINISHED CRAFT', 'WAITING HANDS'],
  VIT: ['FORGOTTEN RITUAL', 'EMPTY FLASK', 'UNTENDED GARDEN'],
  CHA: ['UNSENT MESSAGE', 'QUIET TAVERN', 'UNSPOKEN WORD'],
};

export function spotlightFor(quest: Quest, today: string): Spotlight {
  const idle = daysBetween(quest.lastCompletedDate ?? quest.createdDate, today);
  const codename = `THE ${pick(CODENAME_NOUNS[quest.attribute], quest.id)}`;
  const opener = pick(
    [
      'Something has been left unfinished.',
      `This quest has been waiting ${idle} days. It is patient. It is also judging you, slightly.`,
      'An old quest stirs in the log.',
      `${idle} days of silence. The quest remembers.`,
    ],
    quest.id + today,
  );
  const closer = pick(
    [
      "You don't need to finish the whole quest. Just open the door.",
      'Ten minutes. That is all I ask. The rest tends to follow.',
      'Start badly. Starting badly still counts as starting.',
      'Nobody said it has to be heroic. It just has to be touched.',
    ],
    today + quest.id,
  );
  return { questId: quest.id, codename, lines: [opener, closer] };
}

export function briefing(state: GameState, now: Date): Briefing {
  const today = toLocalDate(now);
  const seed = today + (state.character?.name ?? '');
  const salutation = salutationFor(now.getHours(), seed);
  const lines: string[] = [];
  const activeQuests = state.questOrder.map((id) => state.quests[id]!).filter((q) => q.status === 'active');
  const gap = state.lastActiveDate ? daysBetween(state.lastActiveDate, today) : null;
  const restedActive = gap !== null && gap >= RESTED_GAP_DAYS;

  if (state.deeds.length === 0) {
    if (activeQuests.length === 0) {
      lines.push(
        pick(
          [
            'A fresh character file. No history, no expectations, no excuses yet.',
            'Level one. Every legend started here. Most of them just stopped mentioning it.',
          ],
          seed,
        ),
        'I have prepared a few quests. Accept one. Or write your own — you know your life better than I do.',
      );
    } else {
      lines.push(
        'Quests accepted. Now for the part where they happen.',
        pick(['Pick the smallest one. Momentum is a real stat.', 'Start anywhere. The XP bar is hungry.'], seed),
      );
    }
    return { salutation, lines, spotlight: null, restedActive: false };
  }

  if (restedActive) {
    return {
      salutation: 'WELCOME BACK, ADVENTURER.',
      lines: [
        pick(
          [
            `You were away ${gap} days. The world kept spinning. Your quests waited.`,
            `${gap} days. Long enough to miss you. Not long enough to forget you.`,
            `${gap} days out in the wild. No penalties here — this isn't that kind of game.`,
          ],
          seed,
        ),
        `Rested bonus is active: your next deed earns +50% XP.`,
      ],
      spotlight: null,
      restedActive,
    };
  }

  const doneToday = state.deeds.filter((d) => d.localDate === today);
  const yesterday = state.deeds.filter((d) => d.localDate === addDays(today, -1));
  const lvl = levelInfo(state.totalXp);
  const toNext = lvl.xpForLevel - lvl.xpIntoLevel;

  if (doneToday.length >= 3) {
    lines.push(
      fill(pick(['{n} deeds today. The chronicle is getting thick.', '{n} quests down today. I had to sharpen my quill.'], seed), {
        n: doneToday.length,
      }),
    );
  } else if (doneToday.length > 0) {
    lines.push(
      fill(pick(['{n} down today. The day is paying dividends.', 'Today already counts. Anything else is a bonus round.'], seed), {
        n: doneToday.length,
      }),
    );
  } else if (yesterday.length > 0) {
    lines.push(
      fill(
        pick(
          ['Yesterday you cleared {n} {q}. Today is a blank page.', 'Yesterday: {n} {q}. Not bad. Not bad at all.'],
          seed,
        ),
        { n: yesterday.length, q: yesterday.length === 1 ? 'quest' : 'quests' },
      ),
    );
  } else {
    lines.push(pick(['The board is set. Your move.', 'Quests await. None of them are going to do themselves. I checked.'], seed));
  }

  if (lvl.progress >= 0.75) {
    lines.push(`Level ${lvl.level + 1} is ${toNext} XP away. One good quest should do it.`);
  }

  const campaign = state.campaignOrder.map((id) => state.campaigns[id]!).find((c) => c.status === 'active');
  if (campaign && lines.length < 3) {
    const cleared = campaign.chapters.filter((c) => c.clearedAt).length;
    const pct = Math.round((cleared / campaign.chapters.length) * 100);
    lines.push(`Campaign “${campaign.name}” stands at ${pct}%.`);
  }

  const neglected = findNeglectedQuest(state, today);
  return { salutation, lines, spotlight: neglected ? spotlightFor(neglected, today) : null, restedActive };
}

/* ─────────────────────────── reactions ─────────────────────────── */

export interface Reaction {
  headline: string;
  line: string;
}

const KEYWORD_QUIPS: [RegExp, string[]][] = [
  [/\bbugs?\b|\bdebug/i, ['The bug has been removed from existence.', 'Bug slain. Its family has been notified.']],
  [/\bguitar|piano|drums?|violin|bass\b/i, ['Your fingertips have filed a formal complaint. Denied.', 'Somewhere, a future audience just got slightly luckier.']],
  [/\bgym|workout|lift|pushups?|squats?|exercise\b/i, ['Your muscles have been informed. They are furious, and grateful.', 'Gravity lost a round today.']],
  [/\bwater|hydrat/i, ['Hydration acquired. Your cells send their regards.', 'You drank water. Civilization is proud.']],
  [/\bsleep|nap|bed\b/i, ["Sleep is a quest now. I don't make the rules. (I make the rules.)"]],
  [/\bstudy|learn|read|course|lecture\b/i, ['Knowledge acquired. Brain now slightly larger. Scientifically questionable, spiritually accurate.']],
  [/\bcode|coding|repo|commit|implement|project\b/i, ['The repository stirs. Something was built today.', 'Code shipped from brain to machine. Rare. Beautiful.']],
  [/\bwalk|run|hike|outside|grass\b/i, ['You went outside. The graphics out there are incredible.']],
  [/\bcall|text|friend|mom|dad|family\b/i, ['Connection made. That one counts double in the real ledger.']],
  [/\bclean|tidy|laundry|dishes\b/i, ['Order has been restored to a small corner of the universe.']],
];

const TIER_QUIPS: Record<Tier, string[]> = {
  tiny: ['Small, but it counts. Everything counts.', 'Noted. Filed. Quietly impressive.', 'Tiny quest. Nonzero hero.'],
  standard: [
    'Quest complete. The log grows heavier.',
    'This is how characters get built: one session at a time.',
    'Done. The version of you from this morning would be pleased.',
  ],
  challenge: [
    'That one had teeth. You did it anyway.',
    'The hard version of you just won an argument with the easy version.',
    'Challenge cleared. Write that one down. (I did.)',
  ],
  boss: [
    'The boss has been removed from existence.',
    'Roll credits. Actually, don’t — there’s a sequel.',
    'They will write songs about this. Mostly me. I will write the songs.',
  ],
};

export function reactTo(effects: readonly Effect[], state: GameState): Reaction | null {
  const deedEffect = effects.find((e): e is Extract<Effect, { kind: 'deed' }> => e.kind === 'deed');
  if (!deedEffect) return null;
  const { deed, restedBonus } = deedEffect;
  const seed = deed.id;

  const campaignDone = effects.some((e) => e.kind === 'campaignComplete');
  const headline = campaignDone
    ? 'CAMPAIGN COMPLETE'
    : deed.kind === 'chapter'
      ? 'CHAPTER CLEARED'
      : deed.tier === 'boss'
        ? 'BOSS DEFEATED'
        : deed.tier === 'challenge'
          ? 'CHALLENGE CLEARED'
          : 'QUEST COMPLETE';

  const levelUp = effects.find((e): e is Extract<Effect, { kind: 'levelUp' }> => e.kind === 'levelUp');
  const ach = effects.find((e): e is Extract<Effect, { kind: 'achievement' }> => e.kind === 'achievement');

  let line: string;
  if (state.deeds.length === 1) {
    line = 'First blood. Everyone remembers their first quest. I certainly will — I’m writing it down.';
  } else if (campaignDone) {
    line = 'A whole campaign. Start to finish. Look back at chapter one — that person had no idea.';
  } else if (restedBonus > 0) {
    line = pick(['You came back. That is the whole trick, and you just did it.', 'Welcome back. The XP missed you.'], seed);
  } else if (deed.tier === 'boss' || deed.kind === 'chapter') {
    line = pick(TIER_QUIPS[deed.tier], seed);
  } else if (levelUp) {
    line = `Level ${levelUp.to}. Something in you just got harder to stop.`;
  } else if (ach?.achievementId === 'night-owl') {
    line = `It is ${deed.localHour} AM. I’m not your mother. But — good work. Now sleep.`;
  } else {
    const keyword = KEYWORD_QUIPS.find(([re]) => re.test(deed.title));
    const pool = keyword && hashString(seed) % 3 !== 0 ? keyword[1] : TIER_QUIPS[deed.tier];
    line = pick(pool, seed);
  }
  return { headline, line };
}

/* ─────────────────────────── suggestions ─────────────────────────── */

export interface SuggestedQuest extends QuestDraft {
  pitch: string;
}

const SUGGESTION_POOL: (QuestDraft & { pitch: string })[] = [
  { title: 'Drink a full glass of water', tier: 'tiny', attribute: 'VIT', cadence: 'daily', pitch: 'The easiest XP in the realm.' },
  { title: 'Walk outside for 15 minutes', tier: 'standard', attribute: 'STR', cadence: 'daily', pitch: 'The outdoors has excellent graphics.' },
  { title: 'Do 20 push-ups', tier: 'tiny', attribute: 'STR', cadence: 'daily', pitch: 'Twenty. Not twenty-one. I’m reasonable.' },
  { title: 'Read for 20 minutes', tier: 'standard', attribute: 'INT', cadence: 'daily', pitch: 'Borrow someone else’s brain for a while.' },
  { title: 'One focused hour of deep work', tier: 'standard', attribute: 'INT', cadence: 'daily', pitch: 'No tabs. No phone. Just the thing.' },
  { title: 'Learn one new thing and explain it out loud', tier: 'standard', attribute: 'INT', cadence: 'once', pitch: 'If you can explain it, you own it.' },
  { title: 'Practice an instrument for 30 minutes', tier: 'standard', attribute: 'DEX', cadence: 'daily', pitch: 'Your fingers will complain. Ignore them.' },
  { title: 'Cook a real meal from scratch', tier: 'standard', attribute: 'DEX', cadence: 'once', pitch: 'Crafting skill, but edible.' },
  { title: 'Sketch something in front of you', tier: 'tiny', attribute: 'DEX', cadence: 'once', pitch: 'It does not have to be good. That is the point.' },
  { title: 'In bed before midnight', tier: 'standard', attribute: 'VIT', cadence: 'daily', pitch: 'The strongest buff in the game is free.' },
  { title: 'Tidy your desk', tier: 'tiny', attribute: 'VIT', cadence: 'once', pitch: 'A clear desk is a clear map.' },
  { title: '10 minutes of stretching', tier: 'tiny', attribute: 'VIT', cadence: 'daily', pitch: 'Future you has a back. Be kind to it.' },
  { title: 'Message a friend you haven’t talked to in a while', tier: 'standard', attribute: 'CHA', cadence: 'once', pitch: 'They are probably thinking the same thing.' },
  { title: 'Call someone in your family', tier: 'standard', attribute: 'CHA', cadence: 'once', pitch: 'Rare loot. Does not respawn forever.' },
  { title: 'Give someone a genuine compliment', tier: 'tiny', attribute: 'CHA', cadence: 'once', pitch: 'Costs nothing. Crits often.' },
  { title: 'Finish the thing you’ve been avoiding', tier: 'challenge', attribute: 'INT', cadence: 'once', pitch: 'You know which one. I know you know.' },
];

/**
 * Suggests quests aimed at the player's least-developed attributes,
 * skipping anything already in their log. `reroll` shifts the selection.
 */
export function suggestQuests(state: GameState, now: Date, count = 3, reroll = 0): SuggestedQuest[] {
  const existing = new Set(
    state.questOrder.map((id) => state.quests[id]!).filter((q) => q.status === 'active').map((q) => q.title.toLowerCase()),
  );
  const available = SUGGESTION_POOL.filter((s) => !existing.has(s.title.toLowerCase()));
  const seed = toLocalDate(now) + ':' + reroll;

  // Weakest attributes first; ties broken by a seeded shuffle so it varies.
  const order = [...ATTRIBUTES].sort(
    (a, b) => state.attributeXp[a] - state.attributeXp[b] || hashString(seed + a) - hashString(seed + b),
  );

  const picks: SuggestedQuest[] = [];
  const used = new Set<string>();
  // Brand-new players get a tiny quest first: the fastest possible first win.
  if (state.deeds.length === 0) {
    const tiny = available.filter((s) => s.tier === 'tiny');
    if (tiny.length) {
      const t = pick(tiny, seed);
      picks.push(t);
      used.add(t.title);
    }
  }
  for (let round = 0; picks.length < count && round < 4; round++) {
    for (const attr of order) {
      if (picks.length >= count) break;
      if (picks.some((p) => p.attribute === attr) && round === 0) continue;
      const pool = available.filter((s) => s.attribute === attr && !used.has(s.title));
      if (!pool.length) continue;
      const s = pick(pool, seed + attr + round);
      picks.push(s);
      used.add(s.title);
    }
  }
  return picks.slice(0, count);
}

/* ─────────────────────────── misc copy ─────────────────────────── */

export function describeAttribute(attr: Attribute): string {
  return `${ATTRIBUTE_INFO[attr].name} — ${ATTRIBUTE_INFO[attr].domain}`;
}

export function achievementLine(achievementId: string): string {
  return ACHIEVEMENT_BY_ID.get(achievementId)?.description ?? '';
}

export function xpLabel(tier: Tier): string {
  return `+${TIER_INFO[tier].xp} XP`;
}

export function cadenceLabel(c: Cadence): string {
  return c === 'daily' ? 'DAILY' : 'ONE-TIME';
}

