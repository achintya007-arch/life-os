import type { ClassId } from './classes';
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
  /** Boss HP: how many sessions ("strikes") it takes to defeat. One-time quests only; default 1. */
  hits?: number;
}

/** A system-issued daily task. Not editable: the only source of the day's contract XP. */
export interface Contract {
  id: string;
  /** Task-library key it was generated from (history stays interpretable). */
  key: string;
  title: string;
  detail?: string;
  attribute: Attribute;
  xp: number;
  kind: 'daily' | 'class' | 'challenge' | 'interest';
  /** For Game Master challenges: the player's quest this contract points at. */
  questId?: string;
  /** For interest contracts: which interest it came from. */
  interest?: string;
}

/** What a weekly goal counts: completions of one quest, or any deed in an attribute. */
export type GoalMatch = { questId: string } | { attribute: Attribute };

export type GameEvent =
  | (EventBase & { type: 'character.created'; name: string })
  | (EventBase & { type: 'character.renamed'; name: string })
  | (EventBase & { type: 'character.titleEquipped'; titleId: string | null })
  | (EventBase & { type: 'character.classChosen'; classId: ClassId })
  | (EventBase & { type: 'profile.interestsSet'; interests: string[] })
  | (EventBase & { type: 'daily.issued'; localDate: LocalDate; budget: number; contracts: Contract[] })
  | (EventBase & LocalMoment & { type: 'daily.completed'; contractId: string })
  | (EventBase & { type: 'weekly.goalSet'; goalId: string; weekStart: LocalDate; label: string; target: number; match: GoalMatch })
  | (EventBase & { type: 'weekly.goalRemoved'; goalId: string })
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
  /** Reverts a deed event (quest completion, chapter clear or contract) as if it never happened. */
  | (EventBase & { type: 'deed.undone'; targetEventId: string });

export type GameEventType = GameEvent['type'];
export type EventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

/* ─────────────────────────── Projected state ─────────────────────────── */

export interface Character {
  name: string;
  createdAt: string;
  equippedTitleId: string | null;
  classId: ClassId | null;
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

export interface DailyBoard {
  date: LocalDate;
  budget: number;
  contracts: Contract[];
  /** Ids of completed contracts, in completion order. */
  completed: string[];
  issuedAt: string;
}

export interface WeeklyGoal {
  id: string;
  weekStart: LocalDate;
  label: string;
  target: number;
  match: GoalMatch;
  progress: number;
  status: 'active' | 'met' | 'removed';
  metAt: string | null;
  bonus: number;
}

/** Anything the player actually did that earned XP. The backbone of history. */
export interface Deed {
  id: string;
  kind: 'quest' | 'chapter' | 'contract';
  refId: string;
  campaignId?: string;
  title: string;
  tier: Tier;
  attribute: Attribute;
  at: string;
  localDate: LocalDate;
  localHour: number;
  xp: number;
  /** Boss strikes: which hit this was, of how many. */
  strike?: { n: number; of: number };
}

export type XpReason = 'quest' | 'chapter' | 'rested' | 'campaign' | 'class' | 'contract' | 'weekly';

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
  /** System-issued daily contracts, by local date. */
  dailies: Record<LocalDate, DailyBoard>;
  weeklyGoals: Record<string, WeeklyGoal>;
  weeklyGoalOrder: string[];
  /** Declared interests (personalization). */
  interests: string[];
}

/* ─────────────────────────── Effects (what the UI should celebrate) ─────────────────────────── */

export type Effect =
  | { kind: 'deed'; deed: Deed; restedBonus: number }
  | { kind: 'xp'; amount: number; reason: XpReason; attribute: Attribute }
  | { kind: 'levelUp'; from: number; to: number }
  | { kind: 'attributeUp'; attribute: Attribute; from: number; to: number }
  | { kind: 'achievement'; achievementId: string }
  | { kind: 'titleUnlocked'; titleId: string }
  | { kind: 'campaignComplete'; campaignId: string }
  | { kind: 'dailySweep'; date: LocalDate; xp: number }
  | { kind: 'weeklyGoalMet'; goalId: string; label: string; bonus: number };
