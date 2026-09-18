/**
 * Structural validation of events from untrusted sources (imported files,
 * other devices via the cloud). This checks *shape*, not game rules — rules
 * live in commands.ts and are enforced again by projection, which ignores
 * events that don't make sense (e.g. completing an unknown quest).
 *
 * The goal: nothing that passes here can crash projection or the UI.
 */
import { ATTRIBUTES, CADENCES, TIERS } from './constants';
import { isLocalDate } from './dates';
import type { GameEvent, GameEventType } from './types';

export const EVENT_TYPES: readonly GameEventType[] = [
  'character.created',
  'character.renamed',
  'character.titleEquipped',
  'quest.created',
  'quest.edited',
  'quest.retired',
  'quest.completed',
  'campaign.created',
  'campaign.chapterCleared',
  'campaign.retired',
  'deed.undone',
];
const TYPE_SET = new Set<string>(EVENT_TYPES);

const MAX_ID = 128;
const MAX_TEXT = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isHour = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23;
const isIso = (v: unknown) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

function draftProblem(d: unknown, partial: boolean): string | null {
  if (!isObj(d)) return 'quest data missing';
  if ((!partial || d.title !== undefined) && !isText(d.title, 200)) return 'bad quest title';
  if (d.notes !== undefined && typeof d.notes !== 'string') return 'bad quest notes';
  if (typeof d.notes === 'string' && d.notes.length > MAX_TEXT) return 'quest notes too long';
  if ((!partial || d.tier !== undefined) && !oneOf(TIERS, d.tier)) return 'bad quest tier';
  if ((!partial || d.attribute !== undefined) && !oneOf(ATTRIBUTES, d.attribute)) return 'bad attribute';
  if ((!partial || d.cadence !== undefined) && !oneOf(CADENCES, d.cadence)) return 'bad cadence';
  return null;
}

/** Returns a human-readable problem, or null when the event is structurally sound. */
export function eventProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'not an object';
  const e = raw;
  if (!isId(e.id)) return 'missing or invalid id';
  if (typeof e.type !== 'string' || !TYPE_SET.has(e.type)) return `unknown type “${String(e.type)}”`;
  if (!isIso(e.at)) return 'missing or invalid time';

  const moment = () => (isLocalDate(e.localDate) && isHour(e.localHour) ? null : 'missing local date/hour');

  switch (e.type as GameEventType) {
    case 'character.created':
    case 'character.renamed':
      return isText(e.name, 64) ? null : 'bad character name';
    case 'character.titleEquipped':
      return e.titleId === null || isId(e.titleId) ? null : 'bad title id';
    case 'quest.created':
      return !isId(e.questId) ? 'bad quest id' : (moment() ?? draftProblem(e.quest, false));
    case 'quest.edited':
      return !isId(e.questId) ? 'bad quest id' : draftProblem(e.changes, true);
    case 'quest.retired':
      return isId(e.questId) ? null : 'bad quest id';
    case 'quest.completed':
      return !isId(e.questId) ? 'bad quest id' : moment();
    case 'campaign.created': {
      if (!isId(e.campaignId)) return 'bad campaign id';
      if (!isText(e.name, 200)) return 'bad campaign name';
      if (!oneOf(ATTRIBUTES, e.attribute)) return 'bad attribute';
      if (!Array.isArray(e.chapters) || e.chapters.length < 1 || e.chapters.length > 24) return 'bad chapters';
      for (const c of e.chapters) if (!isObj(c) || !isId(c.id) || !isText(c.title, 200)) return 'bad chapter';
      return null;
    }
    case 'campaign.chapterCleared':
      return !isId(e.campaignId) || !isId(e.chapterId) ? 'bad campaign reference' : moment();
    case 'campaign.retired':
      return isId(e.campaignId) ? null : 'bad campaign id';
    case 'deed.undone':
      return isId(e.targetEventId) ? null : 'bad undo target';
  }
}

export function isValidEvent(raw: unknown): raw is GameEvent {
  return eventProblem(raw) === null;
}
