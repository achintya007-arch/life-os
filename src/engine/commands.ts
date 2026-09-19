/**
 * Commands: player intentions, validated against current state, turned into events.
 * This is the only place new events are born. Clock and id generation are
 * injected so every command is reproducible in tests.
 */
import { interestLevelKey } from './interests';
import { INTERESTS_BY_ID } from './interestCatalog';
import { isClassId, type ClassId } from './classes';
import {
  ATTRIBUTES,
  BOSS_MAX_HITS,
  CADENCES,
  LIMITS,
  TIERS,
  WEEKLY_MAX_GOALS,
  WEEKLY_MAX_TARGET,
  type Attribute,
} from './constants';
import { generateDailyBoard } from './contracts';
import { startOfWeek, toLocalDate } from './dates';
import { isDeedEvent } from './project';
import { TITLE_BY_ID, isTitleUnlocked } from './titles';
import type { GameEvent, GameState, GoalMatch, QuestDraft } from './types';

export interface CommandContext {
  now: Date;
  newId: () => string;
}

export type CommandResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export type Command =
  | { type: 'createCharacter'; name: string }
  | { type: 'renameCharacter'; name: string }
  | { type: 'equipTitle'; titleId: string | null }
  | { type: 'createQuest'; quest: QuestDraft }
  | { type: 'editQuest'; questId: string; changes: Partial<QuestDraft> }
  | { type: 'retireQuest'; questId: string }
  | { type: 'completeQuest'; questId: string }
  | { type: 'createCampaign'; name: string; attribute: Attribute; chapters: string[] }
  | { type: 'clearChapter'; campaignId: string; chapterId: string }
  | { type: 'retireCampaign'; campaignId: string }
  | { type: 'undoDeed'; eventId: string }
  | { type: 'chooseClass'; classId: ClassId }
  | { type: 'setInterests'; interests: string[]; levels?: Record<string, number>; dismissed?: string[] }
  | { type: 'issueDaily' }
  | { type: 'completeContract'; contractId: string }
  | { type: 'setWeeklyGoal'; label: string; target: number; match: GoalMatch }
  | { type: 'removeWeeklyGoal'; goalId: string };

const fail = (error: string): CommandResult => ({ ok: false, error });
const ok = (...events: GameEvent[]): CommandResult => ({ ok: true, events });

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  if (s.length === 0 || s.length > max) return null;
  return s;
}

function validateDraft(draft: Partial<QuestDraft>, partial: boolean): Partial<QuestDraft> | string {
  const out: Partial<QuestDraft> = {};
  if (!partial || draft.title !== undefined) {
    const title = cleanText(draft.title, LIMITS.questTitleMax);
    if (!title) return `A quest needs a name (1–${LIMITS.questTitleMax} characters).`;
    out.title = title;
  }
  if (draft.notes !== undefined) {
    if (typeof draft.notes !== 'string' || draft.notes.length > LIMITS.notesMax) return 'Notes are too long.';
    // Empty string (not undefined) so clearing notes survives JSON serialization.
    out.notes = draft.notes.trim();
  }
  if (!partial || draft.tier !== undefined) {
    if (!TIERS.includes(draft.tier as never)) return 'Unknown quest tier.';
    out.tier = draft.tier;
  }
  if (!partial || draft.attribute !== undefined) {
    if (!ATTRIBUTES.includes(draft.attribute as never)) return 'Unknown attribute.';
    out.attribute = draft.attribute;
  }
  if (!partial || draft.cadence !== undefined) {
    if (!CADENCES.includes(draft.cadence as never)) return 'Unknown cadence.';
    out.cadence = draft.cadence;
  }
  if (draft.hits !== undefined) {
    if (!Number.isInteger(draft.hits) || draft.hits < 1 || draft.hits > BOSS_MAX_HITS) return `Boss HP is 1–${BOSS_MAX_HITS} strikes.`;
    out.hits = draft.hits;
  }
  return out;
}

/**
 * @param log the full event log (needed only for undo validation)
 */
export function execute(
  state: GameState,
  command: Command,
  ctx: CommandContext,
  log: readonly GameEvent[] = [],
): CommandResult {
  const base = () => ({ id: ctx.newId(), at: ctx.now.toISOString() });
  const moment = () => ({ localDate: toLocalDate(ctx.now), localHour: ctx.now.getHours() });

  if (command.type !== 'createCharacter' && !state.character) return fail('No character exists yet.');

  switch (command.type) {
    case 'createCharacter': {
      if (state.character) return fail('A character already exists.');
      const name = cleanText(command.name, LIMITS.nameMax);
      if (!name) return fail(`Every legend needs a name (1–${LIMITS.nameMax} characters).`);
      return ok({ ...base(), type: 'character.created', name });
    }

    case 'renameCharacter': {
      const name = cleanText(command.name, LIMITS.nameMax);
      if (!name) return fail(`Names are 1–${LIMITS.nameMax} characters.`);
      return ok({ ...base(), type: 'character.renamed', name });
    }

    case 'equipTitle': {
      if (command.titleId !== null) {
        const title = TITLE_BY_ID.get(command.titleId);
        if (!title) return fail('Unknown title.');
        if (!isTitleUnlocked(state, title)) return fail('That title has not been earned yet.');
      }
      return ok({ ...base(), type: 'character.titleEquipped', titleId: command.titleId });
    }

    case 'createQuest': {
      const draft = validateDraft(command.quest, false);
      if (typeof draft === 'string') return fail(draft);
      return ok({
        ...base(),
        ...moment(),
        type: 'quest.created',
        questId: ctx.newId(),
        quest: draft as QuestDraft,
      });
    }

    case 'editQuest': {
      const quest = state.quests[command.questId];
      if (!quest) return fail('Quest not found.');
      if (quest.status !== 'active') return fail('Only active quests can be edited.');
      const changes = validateDraft(command.changes, true);
      if (typeof changes === 'string') return fail(changes);
      if (Object.keys(changes).length === 0) return fail('Nothing to change.');
      return ok({ ...base(), type: 'quest.edited', questId: quest.id, changes });
    }

    case 'retireQuest': {
      const quest = state.quests[command.questId];
      if (!quest) return fail('Quest not found.');
      if (quest.status !== 'active') return fail('That quest is not active.');
      return ok({ ...base(), type: 'quest.retired', questId: quest.id });
    }

    case 'completeQuest': {
      const quest = state.quests[command.questId];
      if (!quest) return fail('Quest not found.');
      if (quest.status === 'cleared') return fail('That quest is already cleared.');
      if (quest.status === 'retired') return fail('That quest was retired.');
      const m = moment();
      if (quest.cadence === 'daily' && quest.lastCompletedDate === m.localDate) {
        return fail('Already done today. It resets tomorrow.');
      }
      return ok({ ...base(), ...m, type: 'quest.completed', questId: quest.id });
    }

    case 'createCampaign': {
      const name = cleanText(command.name, LIMITS.campaignNameMax);
      if (!name) return fail(`A campaign needs a name (1–${LIMITS.campaignNameMax} characters).`);
      if (!ATTRIBUTES.includes(command.attribute)) return fail('Unknown attribute.');
      const titles = command.chapters.map((c) => cleanText(c, LIMITS.questTitleMax)).filter((c): c is string => !!c);
      if (titles.length < LIMITS.chaptersMin || titles.length > LIMITS.chaptersMax) {
        return fail(`A campaign needs ${LIMITS.chaptersMin}–${LIMITS.chaptersMax} chapters.`);
      }
      return ok({
        ...base(),
        type: 'campaign.created',
        campaignId: ctx.newId(),
        name,
        attribute: command.attribute,
        chapters: titles.map((title) => ({ id: ctx.newId(), title })),
      });
    }

    case 'clearChapter': {
      const campaign = state.campaigns[command.campaignId];
      if (!campaign) return fail('Campaign not found.');
      if (campaign.status !== 'active') return fail('That campaign is not active.');
      const next = campaign.chapters.find((c) => c.clearedAt === null);
      if (!next || next.id !== command.chapterId) return fail('Chapters are cleared in order.');
      return ok({
        ...base(),
        ...moment(),
        type: 'campaign.chapterCleared',
        campaignId: campaign.id,
        chapterId: next.id,
      });
    }

    case 'retireCampaign': {
      const campaign = state.campaigns[command.campaignId];
      if (!campaign) return fail('Campaign not found.');
      if (campaign.status !== 'active') return fail('That campaign is not active.');
      return ok({ ...base(), type: 'campaign.retired', campaignId: campaign.id });
    }

    case 'chooseClass': {
      if (!isClassId(command.classId)) return fail('Unknown class.');
      if (state.character?.classId === command.classId) return fail('You already walk that path.');
      return ok({ ...base(), type: 'character.classChosen', classId: command.classId });
    }

    case 'setInterests': {
      if (!Array.isArray(command.interests)) return fail('Interests must be a list.');
      const seen = new Set<string>();
      const interests: string[] = [];
      for (const raw of command.interests) {
        const i = cleanText(raw, LIMITS.interestLengthMax);
        if (!i) continue;
        const key = i.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        interests.push(i);
      }
      if (interests.length > LIMITS.interestsMax) return fail(`Pick up to ${LIMITS.interestsMax} interests.`);
      const levels: Record<string, 1 | 2 | 3> = {};
      const given = command.levels ?? {};
      for (const i of interests) {
        const key = interestLevelKey(i);
        const level = given[key] ?? state.interestLevels[key];
        if (level === 1 || level === 2 || level === 3) levels[key] = level;
      }
      const dismissed = [...new Set(command.dismissed ?? state.dismissedInterests)].filter((id) => id in INTERESTS_BY_ID);
      return ok({ ...base(), type: 'profile.interestsSet', interests, levels, dismissed });
    }

    case 'issueDaily': {
      const date = toLocalDate(ctx.now);
      if (state.dailies[date]) return fail('Today’s contracts are already on the board.');
      const board = generateDailyBoard(state, date, ctx.now.toISOString());
      if (board.contracts.length === 0) return fail('No contracts could be issued.');
      return ok({ ...base(), type: 'daily.issued', localDate: date, budget: board.contracts.reduce((s, c) => s + c.xp, 0), contracts: board.contracts });
    }

    case 'completeContract': {
      const m = moment();
      const board = state.dailies[m.localDate];
      const contract = board?.contracts.find((c) => c.id === command.contractId);
      if (!board || !contract) return fail('That contract expired at midnight. Today’s board has new ones.');
      if (board.completed.includes(contract.id)) return fail('Contract already fulfilled.');
      return ok({ ...base(), ...m, type: 'daily.completed', contractId: contract.id });
    }

    case 'setWeeklyGoal': {
      const label = cleanText(command.label, LIMITS.goalLabelMax);
      if (!label) return fail(`Give the goal a name (1–${LIMITS.goalLabelMax} characters).`);
      if (!Number.isInteger(command.target) || command.target < 1 || command.target > WEEKLY_MAX_TARGET) {
        return fail(`Aim for 1–${WEEKLY_MAX_TARGET} times this week.`);
      }
      const match = command.match;
      if ('questId' in match) {
        const q = state.quests[match.questId];
        if (!q || q.status !== 'active') return fail('Pick an active quest for this goal.');
      } else if (!ATTRIBUTES.includes(match.attribute)) {
        return fail('Unknown attribute.');
      }
      const weekStart = startOfWeek(toLocalDate(ctx.now));
      const thisWeek = state.weeklyGoalOrder.map((id) => state.weeklyGoals[id]!).filter((g) => g.weekStart === weekStart && g.status !== 'removed');
      if (thisWeek.length >= WEEKLY_MAX_GOALS) return fail(`Up to ${WEEKLY_MAX_GOALS} goals a week — keep it light.`);
      return ok({ ...base(), type: 'weekly.goalSet', goalId: ctx.newId(), weekStart, label, target: command.target, match });
    }

    case 'removeWeeklyGoal': {
      const goal = state.weeklyGoals[command.goalId];
      if (!goal || goal.status !== 'active') return fail('That goal isn’t active.');
      return ok({ ...base(), type: 'weekly.goalRemoved', goalId: goal.id });
    }

    case 'undoDeed': {
      const target = log.find((e) => e.id === command.eventId);
      if (!target || !isDeedEvent(target)) return fail('Nothing to undo.');
      if (log.some((e) => e.type === 'deed.undone' && e.targetEventId === target.id)) return fail('Already undone.');
      if (!state.deeds.some((d) => d.id === target.id)) return fail('Nothing to undo.');
      return ok({ ...base(), type: 'deed.undone', targetEventId: target.id });
    }
  }
}
