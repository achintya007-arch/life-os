import type { Attribute, Cadence, Tier } from './constants';
import type { LocalDate } from './dates';

/* ─────────────────────────── Events (the source of truth) ─────────────────────────── */

interface EventBase {
  /** Unique event id. For deed events this doubles as the deed id. */
  id: string;
  /** ISO timestamp of when it happened. */
  at: string;
}

/** Captured at the moment of a deed so replay never depends on the current clock or timezone. */
interface LocalMoment {
  localDate: LocalDate;
  localHour: number;
}

export interface QuestDraft {
  title: string;
  notes?: string;
  tier: Tier;
  attribute: Attribute;
  cadence: Cadence;
}

export type GameEvent =
  | (EventBase & { type: 'character.created'; name: string })
  | (EventBase & { type: 'character.renamed'; name: string })
  | (EventBase & { type: 'character.titleEquipped'; titleId: string | null })
  | (EventBase & LocalMoment & { type: 'quest.created'; questId: string; quest: QuestDraft })
  | (EventBase & { type: 'quest.edited'; questId: string; changes: Partial<QuestDraft> })
  | (EventBase & { type: 'quest.retired'; questId: string })
  | (EventBase & LocalMoment & { type: 'quest.completed'; questId: string })
  | (EventBase & {
      type: 'campaign.created';
      campaignId: string;
      name: string;
      attribute: Attribute;
      chapters: { id: string; title: string }[];
    })
  | (EventBase & LocalMoment & { type: 'campaign.chapterCleared'; campaignId: string; chapterId: string })
  | (EventBase & { type: 'campaign.retired'; campaignId: string })
  /** Reverts a deed event (quest completion or chapter clear) as if it never happened. */
  | (EventBase & { type: 'deed.undone'; targetEventId: string });

export type GameEventType = GameEvent['type'];
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

/* ─────────────────────────── Projected state ─────────────────────────── */

export interface Character {
  name: string;
  createdAt: string;
  equippedTitleId: string | null;
}

export interface Quest extends QuestDraft {
  id: string;
  createdAt: string;
  createdDate: LocalDate;
  status: 'active' | 'cleared' | 'retired';
  timesCompleted: number;
  lastCompletedDate: LocalDate | null;
  clearedAt: string | null;
}

export interface Chapter {
  id: string;
  title: string;
  clearedAt: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  attribute: Attribute;
  chapters: Chapter[];
  createdAt: string;
  status: 'active' | 'complete' | 'retired';
  completedAt: string | null;
}

/** Anything the player actually did that earned XP. The backbone of history. */
export interface Deed {
  id: string;
  kind: 'quest' | 'chapter';
  refId: string;
  campaignId?: string;
  title: string;
  tier: Tier;
  attribute: Attribute;
  at: string;
  localDate: LocalDate;
  localHour: number;
  xp: number;
}

export type XpReason = 'quest' | 'chapter' | 'rested' | 'campaign';

export interface XpTransaction {
  id: string;
  deedId: string;
  at: string;
  localDate: LocalDate;
  amount: number;
  reason: XpReason;
  attribute: Attribute;
}

export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: string;
  deedId: string;
}

export interface GameState {
  character: Character | null;
  quests: Record<string, Quest>;
  /** Creation order. */
  questOrder: string[];
  campaigns: Record<string, Campaign>;
  campaignOrder: string[];
  deeds: Deed[];
  transactions: XpTransaction[];
  totalXp: number;
  attributeXp: Record<Attribute, number>;
  achievements: Record<string, AchievementUnlock>;
  lastActiveDate: LocalDate | null;
}

/* ─────────────────────────── Effects (what the UI should celebrate) ─────────────────────────── */

export type Effect =
  | { kind: 'deed'; deed: Deed; restedBonus: number }
  | { kind: 'xp'; amount: number; reason: XpReason; attribute: Attribute }
  | { kind: 'levelUp'; from: number; to: number }
  | { kind: 'attributeUp'; attribute: Attribute; from: number; to: number }
  | { kind: 'achievement'; achievementId: string }
  | { kind: 'titleUnlocked'; titleId: string }
  | { kind: 'campaignComplete'; campaignId: string };
