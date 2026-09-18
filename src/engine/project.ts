/**
 * Projection: folds the event log into game state.
 *
 *   DEED EVENT → XP TRANSACTIONS → CHARACTER XP → LEVEL CHECK → ATTRIBUTE CHECK
 *              → ACHIEVEMENT CHECK → TITLE CHECK → EFFECTS (for the UI)
 *
 * Pure and deterministic: the same events always produce the same state.
 * Events are assumed valid (commands.ts validates before events are written);
 * the projection still ignores events that reference unknown entities so a
 * damaged log degrades gracefully instead of crashing.
 */
import { evaluateAchievements } from './achievements';
import {
  ATTRIBUTES,
  CAMPAIGN_COMPLETE_BONUS_XP,
  CHAPTER_XP,
  RESTED_BONUS_MIN,
  RESTED_BONUS_RATIO,
  RESTED_GAP_DAYS,
  TIER_INFO,
  type Attribute,
} from './constants';
import { daysBetween } from './dates';
import { attributeRank, levelInfo } from './leveling';
import { unlockedTitleIds } from './titles';
import type { Campaign, Deed, Effect, EventOf, GameEvent, GameState, Quest, XpReason, XpTransaction } from './types';

export function initialState(): GameState {
  return {
    character: null,
    quests: {},
    questOrder: [],
    campaigns: {},
    campaignOrder: [],
    deeds: [],
    transactions: [],
    totalXp: 0,
    attributeXp: Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, number>,
    achievements: {},
    lastActiveDate: null,
  };
}

export interface ApplyResult {
  state: GameState;
  effects: Effect[];
}

export function applyEvent(state: GameState, event: GameEvent): ApplyResult {
  switch (event.type) {
    case 'character.created':
      if (state.character) return { state, effects: [] };
      return {
        state: { ...state, character: { name: event.name, createdAt: event.at, equippedTitleId: null } },
        effects: [],
      };

    case 'character.renamed':
      if (!state.character) return { state, effects: [] };
      return { state: { ...state, character: { ...state.character, name: event.name } }, effects: [] };

    case 'character.titleEquipped':
      if (!state.character) return { state, effects: [] };
      return {
        state: { ...state, character: { ...state.character, equippedTitleId: event.titleId } },
        effects: [],
      };

    case 'quest.created': {
      if (state.quests[event.questId]) return { state, effects: [] };
      const quest: Quest = {
        ...event.quest,
        id: event.questId,
        createdAt: event.at,
        createdDate: event.localDate,
        status: 'active',
        timesCompleted: 0,
        lastCompletedDate: null,
        clearedAt: null,
      };
      return {
        state: {
          ...state,
          quests: { ...state.quests, [quest.id]: quest },
          questOrder: [...state.questOrder, quest.id],
        },
        effects: [],
      };
    }

    case 'quest.edited': {
      const quest = state.quests[event.questId];
      if (!quest) return { state, effects: [] };
      return {
        state: { ...state, quests: { ...state.quests, [quest.id]: { ...quest, ...event.changes } } },
        effects: [],
      };
    }

    case 'quest.retired': {
      const quest = state.quests[event.questId];
      if (!quest || quest.status !== 'active') return { state, effects: [] };
      return {
        state: { ...state, quests: { ...state.quests, [quest.id]: { ...quest, status: 'retired' } } },
        effects: [],
      };
    }

    case 'quest.completed':
      return applyQuestCompleted(state, event);

    case 'campaign.created': {
      if (state.campaigns[event.campaignId]) return { state, effects: [] };
      const campaign: Campaign = {
        id: event.campaignId,
        name: event.name,
        attribute: event.attribute,
        chapters: event.chapters.map((c) => ({ id: c.id, title: c.title, clearedAt: null })),
        createdAt: event.at,
        status: 'active',
        completedAt: null,
      };
      return {
        state: {
          ...state,
          campaigns: { ...state.campaigns, [campaign.id]: campaign },
          campaignOrder: [...state.campaignOrder, campaign.id],
        },
        effects: [],
      };
    }

    case 'campaign.chapterCleared':
      return applyChapterCleared(state, event);

    case 'campaign.retired': {
      const campaign = state.campaigns[event.campaignId];
      if (!campaign || campaign.status !== 'active') return { state, effects: [] };
      return {
        state: { ...state, campaigns: { ...state.campaigns, [campaign.id]: { ...campaign, status: 'retired' } } },
        effects: [],
      };
    }

    case 'deed.undone':
      // Undo is resolved by replay (see replay()); folding it incrementally is a no-op.
      return { state, effects: [] };
  }
}

function applyQuestCompleted(state: GameState, event: EventOf<'quest.completed'>): ApplyResult {
  const quest = state.quests[event.questId];
  if (!quest || quest.status !== 'active') return { state, effects: [] };
  if (quest.cadence === 'daily' && quest.lastCompletedDate === event.localDate) return { state, effects: [] };

  const updatedQuest: Quest = {
    ...quest,
    timesCompleted: quest.timesCompleted + 1,
    lastCompletedDate: event.localDate,
    status: quest.cadence === 'once' ? 'cleared' : 'active',
    clearedAt: quest.cadence === 'once' ? event.at : quest.clearedAt,
  };
  const withQuest: GameState = { ...state, quests: { ...state.quests, [quest.id]: updatedQuest } };

  const deed: Deed = {
    id: event.id,
    kind: 'quest',
    refId: quest.id,
    title: quest.title,
    tier: quest.tier,
    attribute: quest.attribute,
    at: event.at,
    localDate: event.localDate,
    localHour: event.localHour,
    xp: 0,
  };

  return awardDeed(state, withQuest, deed, [{ amount: TIER_INFO[quest.tier].xp, reason: 'quest' }], {
    quest: updatedQuest,
    campaignCompleted: false,
  });
}

function applyChapterCleared(state: GameState, event: EventOf<'campaign.chapterCleared'>): ApplyResult {
  const campaign = state.campaigns[event.campaignId];
  if (!campaign || campaign.status !== 'active') return { state, effects: [] };
  const index = campaign.chapters.findIndex((c) => c.id === event.chapterId);
  if (index === -1) return { state, effects: [] };
  // Chapters are cleared strictly in order.
  const nextIndex = campaign.chapters.findIndex((c) => c.clearedAt === null);
  if (index !== nextIndex) return { state, effects: [] };

  const chapters = campaign.chapters.map((c, i) => (i === index ? { ...c, clearedAt: event.at } : c));
  const completed = chapters.every((c) => c.clearedAt !== null);
  const updatedCampaign: Campaign = {
    ...campaign,
    chapters,
    status: completed ? 'complete' : 'active',
    completedAt: completed ? event.at : null,
  };
  const withCampaign: GameState = {
    ...state,
    campaigns: { ...state.campaigns, [campaign.id]: updatedCampaign },
  };

  const chapter = chapters[index]!;
  const deed: Deed = {
    id: event.id,
    kind: 'chapter',
    refId: chapter.id,
    campaignId: campaign.id,
    title: chapter.title,
    tier: completed ? 'boss' : 'challenge',
    attribute: campaign.attribute,
    at: event.at,
    localDate: event.localDate,
    localHour: event.localHour,
    xp: 0,
  };

  const grants: { amount: number; reason: XpReason }[] = [{ amount: CHAPTER_XP, reason: 'chapter' }];
  if (completed) grants.push({ amount: CAMPAIGN_COMPLETE_BONUS_XP, reason: 'campaign' });

  const result = awardDeed(state, withCampaign, deed, grants, {
    campaign: updatedCampaign,
    campaignCompleted: completed,
  });
  if (completed) result.effects.push({ kind: 'campaignComplete', campaignId: campaign.id });
  return result;
}

/**
 * Shared reward pipeline for every deed.
 * `before` is the state prior to the event (for level/attribute/title diffs);
 * `state` already contains the entity update (quest cleared, chapter cleared…).
 */
function awardDeed(
  before: GameState,
  state: GameState,
  deed: Deed,
  grants: { amount: number; reason: XpReason }[],
  extra: { quest?: Quest; campaign?: Campaign; campaignCompleted: boolean },
): ApplyResult {
  const gapDays = before.lastActiveDate === null ? null : daysBetween(before.lastActiveDate, deed.localDate);

  const allGrants = [...grants];
  let restedBonus = 0;
  if (gapDays !== null && gapDays >= RESTED_GAP_DAYS) {
    const base = grants.reduce((s, g) => s + g.amount, 0);
    restedBonus = Math.max(RESTED_BONUS_MIN, Math.round(base * RESTED_BONUS_RATIO));
    allGrants.push({ amount: restedBonus, reason: 'rested' });
  }

  const transactions: XpTransaction[] = allGrants.map((g, i) => ({
    id: `${deed.id}:${i}`,
    deedId: deed.id,
    at: deed.at,
    localDate: deed.localDate,
    amount: g.amount,
    reason: g.reason,
    attribute: deed.attribute,
  }));
  const gained = transactions.reduce((s, t) => s + t.amount, 0);
  const finalDeed: Deed = { ...deed, xp: gained };

  let next: GameState = {
    ...state,
    deeds: [...state.deeds, finalDeed],
    transactions: [...state.transactions, ...transactions],
    totalXp: state.totalXp + gained,
    attributeXp: { ...state.attributeXp, [deed.attribute]: state.attributeXp[deed.attribute] + gained },
    lastActiveDate:
      state.lastActiveDate === null || deed.localDate > state.lastActiveDate ? deed.localDate : state.lastActiveDate,
  };

  const effects: Effect[] = [{ kind: 'deed', deed: finalDeed, restedBonus }];
  for (const t of transactions) effects.push({ kind: 'xp', amount: t.amount, reason: t.reason, attribute: t.attribute });

  const levelBefore = levelInfo(before.totalXp).level;
  const levelAfter = levelInfo(next.totalXp).level;
  if (levelAfter > levelBefore) effects.push({ kind: 'levelUp', from: levelBefore, to: levelAfter });

  const rankBefore = attributeRank(before.attributeXp[deed.attribute]);
  const rankAfter = attributeRank(next.attributeXp[deed.attribute]);
  if (rankAfter > rankBefore) {
    effects.push({ kind: 'attributeUp', attribute: deed.attribute, from: rankBefore, to: rankAfter });
  }

  const titlesBefore = unlockedTitleIds(before);

  const newAchievements = evaluateAchievements({
    state: next,
    deed: finalDeed,
    quest: extra.quest,
    campaign: extra.campaign,
    gapDays,
    campaignCompleted: extra.campaignCompleted,
  });
  if (newAchievements.length > 0) {
    const achievements = { ...next.achievements };
    for (const id of newAchievements) {
      achievements[id] = { achievementId: id, unlockedAt: deed.at, deedId: deed.id };
      effects.push({ kind: 'achievement', achievementId: id });
    }
    next = { ...next, achievements };
  }

  for (const id of unlockedTitleIds(next)) {
    if (!titlesBefore.has(id)) effects.push({ kind: 'titleUnlocked', titleId: id });
  }

  return { state: next, effects };
}

/** Rebuild state from the full log, honoring undo events. */
export function replay(events: readonly GameEvent[]): GameState {
  const undone = new Set<string>();
  for (const e of events) if (e.type === 'deed.undone') undone.add(e.targetEventId);

  let state = initialState();
  for (const e of events) {
    if (undone.has(e.id)) continue;
    state = applyEvent(state, e).state;
  }
  return state;
}

/** Guard used by the undo command: which events can be reverted. */
export function isDeedEvent(e: GameEvent): e is EventOf<'quest.completed'> | EventOf<'campaign.chapterCleared'> {
  return e.type === 'quest.completed' || e.type === 'campaign.chapterCleared';
}
