/**
 * Classes: how a player wants to grow. A class never restricts anything — it
 * shapes which attributes grow fastest and flavors the daily contracts.
 *
 * Bonus XP (on the player's own quests and campaign chapters, never on daily
 * contracts, whose XP is fixed): +20% in the primary attribute, +10% in the
 * secondary. The Wanderer trades specialization for +7% everywhere.
 */
import type { Attribute } from './constants';

export const CLASS_IDS = ['brawler', 'archer', 'mage', 'bard', 'monk', 'wanderer'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface ClassDef {
  id: ClassId;
  name: string;
  primary: Attribute | null;
  secondary: Attribute | null;
  tagline: string;
  lore: string;
  /** Examples of real-life play, so the choice is concrete. */
  plays: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  brawler: {
    id: 'brawler',
    name: 'Brawler',
    primary: 'STR',
    secondary: 'VIT',
    tagline: 'Hits the gym. Hits the goals.',
    lore: 'Power through the body. Brawlers get stronger by showing up and moving.',
    plays: 'Gym, running, sports, martial arts',
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    primary: 'DEX',
    secondary: 'STR',
    tagline: 'Precision is a habit.',
    lore: 'Skill through repetition. Archers sharpen their hands until the impossible looks easy.',
    plays: 'Instruments, cubing, drawing, climbing, craft',
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    primary: 'INT',
    secondary: 'DEX',
    tagline: 'Knowledge is the oldest magic.',
    lore: 'Power through understanding. Mages study, build and bend systems to their will.',
    plays: 'Study, coding, research, reading, languages',
  },
  bard: {
    id: 'bard',
    name: 'Bard',
    primary: 'CHA',
    secondary: 'DEX',
    tagline: 'Every room is a stage.',
    lore: 'Power through people and performance. Bards grow by connecting, creating and being heard.',
    plays: 'Music, performing, friends, writing, speaking',
  },
  monk: {
    id: 'monk',
    name: 'Monk',
    primary: 'VIT',
    secondary: 'INT',
    tagline: 'Discipline is freedom.',
    lore: 'Power through balance. Monks master sleep, focus, food and the quiet between.',
    plays: 'Sleep, meditation, cooking, routines, journaling',
  },
  wanderer: {
    id: 'wanderer',
    name: 'Wanderer',
    primary: null,
    secondary: null,
    tagline: 'Walks every path.',
    lore: 'Refuses to specialize. Wanderers grow a little in everything and fear no quest.',
    plays: 'A bit of everything',
  },
};

export const CLASS_BONUS = { primary: 0.2, secondary: 0.1, wanderer: 0.07 } as const;

export function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

/** Bonus ratio a class grants on an attribute (0 when none). */
export function classBonusRatio(classId: ClassId | null, attribute: Attribute): number {
  if (!classId) return 0;
  const c = CLASSES[classId];
  if (c.id === 'wanderer') return CLASS_BONUS.wanderer;
  if (c.primary === attribute) return CLASS_BONUS.primary;
  if (c.secondary === attribute) return CLASS_BONUS.secondary;
  return 0;
}
