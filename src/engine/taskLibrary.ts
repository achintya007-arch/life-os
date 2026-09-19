/**
 * The contract task library: concrete, doable-today tasks the system can
 * assign, grouped by attribute. Tasks are phrased as small real actions with a
 * clear finish line — the player should never wonder whether it counts.
 *
 * Personalization (interests.ts) adds interest-specific tasks on top of these.
 */
import type { Attribute } from './constants';

export interface TaskTemplate {
  /** Stable id: generated contracts carry it so history stays interpretable. */
  key: string;
  title: string;
  detail?: string;
  attribute: Attribute;
  /** Relative effort: 1 = a few minutes, 2 = a real session, 3 = a push. */
  effort: 1 | 2 | 3;
}

const t = (attribute: Attribute, effort: 1 | 2 | 3, key: string, title: string, detail?: string): TaskTemplate => ({
  key,
  title,
  detail,
  attribute,
  effort,
});

export const BASE_TASKS: readonly TaskTemplate[] = [
  // STR
  t('STR', 1, 'str-pushups', 'Do 3 sets of push-ups', 'As many as you can with good form, rest between sets.'),
  t('STR', 1, 'str-plank', 'Hold a plank for 2 minutes total', 'Break it into as many holds as you need.'),
  t('STR', 2, 'str-walk', 'Walk for 30 minutes', 'Outside if you can.'),
  t('STR', 2, 'str-bodyweight', 'Do a 20-minute bodyweight workout', 'Squats, lunges, push-ups, planks — your pick.'),
  t('STR', 2, 'str-stairs', 'Take the stairs every time today'),
  t('STR', 3, 'str-run', 'Run or cycle for 30 minutes without stopping'),
  t('STR', 3, 'str-train', 'Complete a full training session', 'Gym, sport, class — a real session, start to finish.'),
  // INT
  t('INT', 1, 'int-explain', 'Learn one new fact and explain it in 2 sentences', 'Write it down or say it out loud.'),
  t('INT', 1, 'int-article', 'Read one long-form article to the end'),
  t('INT', 2, 'int-read', 'Read for 30 minutes', 'A book, not a feed.'),
  t('INT', 2, 'int-deepwork', 'Do 45 minutes of deep work', 'Phone in another room. One task.'),
  t('INT', 2, 'int-notes', 'Turn something you learned into notes', 'One page. Your own words.'),
  t('INT', 3, 'int-solve', 'Solve a problem you’ve been avoiding', 'Pick the hard one. Finish a real piece of it.'),
  t('INT', 3, 'int-90', 'Do a 90-minute focused study or build session'),
  // DEX
  t('DEX', 1, 'dex-sketch', 'Sketch one thing in front of you', 'Five minutes. It does not need to be good.'),
  t('DEX', 1, 'dex-typing', 'Do a 5-minute typing or dexterity drill'),
  t('DEX', 2, 'dex-practice', 'Practice a skill for 30 minutes', 'Instrument, craft, art — the thing your hands are learning.'),
  t('DEX', 2, 'dex-cook', 'Cook a meal from scratch'),
  t('DEX', 2, 'dex-fix', 'Fix or build something with your hands'),
  t('DEX', 3, 'dex-slow', 'Practice the hardest part slowly for 20 minutes', 'Slow and correct beats fast and sloppy.'),
  t('DEX', 3, 'dex-finish', 'Finish a small creative piece', 'A drawing, a riff, a recipe, a model — done, not perfect.'),
  // VIT
  t('VIT', 1, 'vit-water', 'Drink 2 liters of water today'),
  t('VIT', 1, 'vit-stretch', 'Stretch for 10 minutes'),
  t('VIT', 1, 'vit-tidy', 'Tidy your space for 10 minutes'),
  t('VIT', 2, 'vit-sleep', 'In bed before midnight, phone away'),
  t('VIT', 2, 'vit-meal', 'Eat a real meal with vegetables'),
  t('VIT', 2, 'vit-offline', 'Spend one hour fully offline'),
  t('VIT', 3, 'vit-reset', 'Do a full reset: clean room, clean desk, plan tomorrow'),
  // CHA
  t('CHA', 1, 'cha-compliment', 'Give someone a genuine compliment'),
  t('CHA', 1, 'cha-message', 'Message someone you haven’t talked to in a while'),
  t('CHA', 2, 'cha-call', 'Call a friend or family member'),
  t('CHA', 2, 'cha-help', 'Help someone with something they’re stuck on'),
  t('CHA', 2, 'cha-share', 'Share something you made or learned'),
  t('CHA', 3, 'cha-speak', 'Start a conversation you’ve been putting off'),
  t('CHA', 3, 'cha-plan', 'Make plans and meet someone in person'),
];
