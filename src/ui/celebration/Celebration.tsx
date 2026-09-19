/**
 * The reward director. Every command from the UI flows through `act()`, and
 * the resulting engine effects are choreographed here with deliberate rhythm:
 *
 *   tiny / normal deed         → sound, a floating number, one toast with undo.
 *   rank-up, common/rare ach.  → quiet toasts (achievements grouped into one).
 *   chapter cleared, epic ach. → a banner: cinematic, auto-dismissing, never blocks.
 *   level up, boss, campaign   → ONE full-screen ceremony per action. Anything
 *                                else earned by that action rides along on it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sfx, type Sfx } from '../../audio/sfx';
import { ACHIEVEMENT_BY_ID } from '../../engine/achievements';
import type { Command } from '../../engine/commands';
import { hashString, reactTo, type Reaction } from '../../engine/gameMaster';
import { TITLE_BY_ID } from '../../engine/titles';
import type { Deed, Effect } from '../../engine/types';
import { useStore } from '../../store/GameContext';
import type { DispatchResult } from '../../store/gameStore';
import { Banner, Ceremony, type BannerItem, type CeremonyItem, type Honor } from './Overlays';
import { Toasts, type Toast } from './Toasts';

interface Floater {
  id: number;
  x: number;
  y: number;
  amount: number;
  rested: number;
  tier: Deed['tier'];
}

export interface GmReaction extends Reaction {
  deedId: string;
  at: number;
}

interface ActOptions {
  origin?: Element | null;
  /** Suppress the default "accept" chime (e.g. when the caller plays its own). */
  silent?: boolean;
}

interface CelebrationApi {
  act: (command: Command, options?: ActOptions) => DispatchResult;
  notify: (text: string, tone?: 'info' | 'error') => void;
  reaction: GmReaction | null;
  clearReaction: () => void;
  /** True while a full-screen moment is on screen. */
  overlayOpen: boolean;
}

const CelebrationContext = createContext<CelebrationApi | null>(null);

export function useCelebration(): CelebrationApi {
  const api = useContext(CelebrationContext);
  if (!api) throw new Error('useCelebration must be used inside <CelebrationProvider>');
  return api;
}

let nextId = 1;

/** Distributive Omit so each toast variant keeps its own fields. */
type ToastInput = Toast extends infer T ? (T extends Toast ? Omit<T, 'id'> : never) : never;

const LEVEL_UP_LINES = [
  'Level {n}. Something in you just got harder to stop.',
  'Level {n}. The old you would not recognize this stat sheet.',
  'Level {n}. Nobody handed you this. You earned every point of it.',
  'Level {n}. Same person. Slightly more dangerous.',
];

const CAMPAIGN_LINE = 'A whole campaign. Look back at chapter one — that person had no idea.';

function levelUpLine(level: number, seed: string): string {
  return LEVEL_UP_LINES[hashString(seed) % LEVEL_UP_LINES.length]!.replace('{n}', String(level));
}

const DEED_SOUND: Record<Deed['tier'], Sfx> = {
  tiny: 'tick',
  standard: 'complete',
  challenge: 'challenge',
  boss: 'boss',
};

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overlays, setOverlays] = useState<CeremonyItem[]>([]);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [reaction, setReaction] = useState<GmReaction | null>(null);
  const timers = useRef(new Set<number>());
  /** Receipts held back until the current ceremony closes, so their timers don't run out behind it. */
  const afterCeremony = useRef<(() => void)[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const pushToast = useCallback(
    (toast: ToastInput, ttl: number) => {
      const id = nextId++;
      // Three at most: rapid logging on a phone must never bury the quest list.
      setToasts((ts) => [...ts.slice(-2), { ...toast, id } as Toast]);
      later(ttl, () => dismissToast(id));
      return id;
    },
    [later, dismissToast],
  );

  const notify = useCallback(
    (text: string, tone: 'info' | 'error' = 'info') => {
      if (tone === 'error') sfx.play('error');
      pushToast({ kind: tone, text }, 4000);
    },
    [pushToast],
  );

  const enqueueOverlay = useCallback((item: CeremonyItem, delay: number) => {
    later(delay, () => setOverlays((q) => [...q, item]));
  }, [later]);

  const enqueueBanner = useCallback((item: BannerItem, delay: number) => {
    later(delay, () => setBanners((q) => [...q, item]));
  }, [later]);

  const celebrate = useCallback(
    (effects: Effect[], origin: Element | null | undefined) => {
      const deedEffect = effects.find((e): e is Extract<Effect, { kind: 'deed' }> => e.kind === 'deed');
      if (!deedEffect) return;
      const { deed, restedBonus } = deedEffect;
      const state = store.getState();

      const levelUp = effects.find((e): e is Extract<Effect, { kind: 'levelUp' }> => e.kind === 'levelUp');
      const campaignDone = effects.find((e): e is Extract<Effect, { kind: 'campaignComplete' }> => e.kind === 'campaignComplete');
      const achievements = effects
        .filter((e): e is Extract<Effect, { kind: 'achievement' }> => e.kind === 'achievement')
        .map((e) => ACHIEVEMENT_BY_ID.get(e.achievementId)!)
        .filter(Boolean);
      const titles = effects
        .filter((e): e is Extract<Effect, { kind: 'titleUnlocked' }> => e.kind === 'titleUnlocked')
        .map((e) => TITLE_BY_ID.get(e.titleId)!)
        .filter(Boolean);
      const attributeUps = effects.filter((e): e is Extract<Effect, { kind: 'attributeUp' }> => e.kind === 'attributeUp');
      const honors: Honor[] = achievements.map((a) => ({ achievement: a, titleName: a.titleId ? TITLE_BY_ID.get(a.titleId)?.name : undefined }));
      const epic = honors.filter((h) => h.achievement.rarity === 'epic' || h.achievement.rarity === 'legendary');
      const minor = honors.filter((h) => !epic.includes(h));

      const campaign = campaignDone ? state.campaigns[campaignDone.campaignId] : undefined;
      const primary: CeremonyItem['primary'] | null = campaign
        ? 'campaign'
        : deed.kind === 'quest' && deed.tier === 'boss'
          ? 'boss'
          : levelUp
            ? 'levelUp'
            : null;
      const chapterCampaign = !campaign && deed.kind === 'chapter' && deed.campaignId ? state.campaigns[deed.campaignId] : undefined;
      const bigDeed = primary === 'boss' || primary === 'campaign';
      const sweep = effects.find((e): e is Extract<Effect, { kind: 'dailySweep' }> => e.kind === 'dailySweep');
      const goalsMet = effects.filter((e): e is Extract<Effect, { kind: 'weeklyGoalMet' }> => e.kind === 'weeklyGoalMet');
      const r = reactTo(effects, state);

      // 1 — the hit: a number where your finger is. Big scenes bring their own sound.
      if (!bigDeed && !chapterCampaign) sfx.play(DEED_SOUND[deed.tier]);
      const rect = origin?.getBoundingClientRect();
      const floater: Floater = {
        id: nextId++,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top : window.innerHeight / 2,
        amount: deed.xp - restedBonus,
        rested: restedBonus,
        tier: deed.tier,
      };
      setFloaters((fs) => [...fs, floater]);
      later(1400, () => setFloaters((fs) => fs.filter((f) => f.id !== floater.id)));

      // 2 — the Game Master notices.
      if (r) setReaction({ ...r, deedId: deed.id, at: Date.now() });

      // 3 — the receipt, with a way back. Behind a level-up it waits for the screen to close.
      if (!bigDeed) {
        const ttl = deed.tier === 'tiny' ? 3500 : 6000;
        const receipt = () => pushToast({ kind: 'deed', deed, restedBonus, headline: r?.headline ?? 'QUEST COMPLETE', ttl }, ttl);
        if (primary) afterCeremony.current.push(receipt);
        else receipt();
      }

      // 4 — a ceremony, at most one per action, carrying everything else earned.
      if (primary) {
        const levelTitles = titles.filter((t) => t.source.kind === 'level').map((t) => t.name);
        const line =
          primary === 'levelUp' && levelUp ? levelUpLine(levelUp.to, deed.id) : primary === 'campaign' ? CAMPAIGN_LINE : (r?.line ?? '');
        enqueueOverlay(
          {
            key: nextId++,
            primary,
            deed,
            campaign,
            level: levelUp ? { from: levelUp.from, to: levelUp.to, titles: levelTitles } : undefined,
            attributeUps,
            honors,
            line,
          },
          bigDeed ? 380 : 1100,
        );
        return;
      }

      // 5 — or a banner: a cleared daily board, campaign progress, or an epic achievement on its own.
      if (sweep) {
        const board = state.dailies[sweep.date];
        enqueueBanner({ kind: 'sweep', key: nextId++, contracts: board?.contracts ?? [], xp: sweep.xp, honors: epic }, 450);
      } else if (chapterCampaign) {
        const chapterIndex = chapterCampaign.chapters.findIndex((c) => c.id === deed.refId);
        enqueueBanner({ kind: 'chapter', key: nextId++, campaign: chapterCampaign, chapterIndex, xp: deed.xp, honors: epic }, 150);
      } else if (epic.length > 0) {
        enqueueBanner({ kind: 'honor', key: nextId++, honors: epic }, 700);
      }

      // 6 — quiet rewards trail the XP bar: one toast per kind, never a parade.
      let stagger = 750;
      for (const e of attributeUps) {
        later(stagger, () => {
          sfx.play('rankUp');
          pushToast({ kind: 'rank', attribute: e.attribute, from: e.from, to: e.to }, 3800);
        });
        stagger += 350;
      }
      for (const g of goalsMet) {
        later(stagger, () => {
          sfx.play('rankUp');
          pushToast({ kind: 'goal', label: g.label, bonus: g.bonus }, 5000);
        });
        stagger += 400;
      }
      if (minor.length > 0) {
        later(stagger, () => {
          if (!chapterCampaign && !sweep && epic.length === 0) sfx.play('achievement');
          pushToast({ kind: 'achievement', honors: minor }, 7000);
        });
      }
    },
    [store, later, pushToast, enqueueOverlay, enqueueBanner],
  );

  const act = useCallback(
    (command: Command, options: ActOptions = {}): DispatchResult => {
      const result = store.dispatch(command);
      if (!result.ok) {
        notify(result.error, 'error');
        return result;
      }
      if (command.type === 'undoDeed') {
        sfx.play('undo');
        setReaction(null);
        setToasts((ts) => ts.filter((t) => !(t.kind === 'deed' && t.deed.id === command.eventId)));
        pushToast({ kind: 'info', text: 'Undone. The timeline has been quietly corrected.' }, 3000);
        return result;
      }
      if (result.effects.some((e) => e.kind === 'deed')) {
        celebrate(result.effects, options.origin);
      } else if (!options.silent && (command.type === 'createQuest' || command.type === 'createCampaign')) {
        sfx.play('accept');
      }
      return result;
    },
    [store, notify, celebrate, pushToast],
  );

  const undo = useCallback((deedId: string) => act({ type: 'undoDeed', eventId: deedId }), [act]);

  const api = useMemo<CelebrationApi>(
    () => ({ act, notify, reaction, clearReaction: () => setReaction(null), overlayOpen: overlays.length > 0 }),
    [act, notify, reaction, overlays.length],
  );

  const current = overlays[0];
  useEffect(() => {
    if (overlays.length > 0 || afterCeremony.current.length === 0) return;
    const pending = afterCeremony.current;
    afterCeremony.current = [];
    pending.forEach((fn, i) => later(250 + i * 200, fn));
  }, [overlays.length, later]);
  const dropBanner = useCallback(() => setBanners((q) => q.slice(1)), []);

  return (
    <CelebrationContext.Provider value={api}>
      {children}
      <div className="floaters" aria-hidden>
        {floaters.map((f) => (
          <div key={f.id} className={`floater floater--${f.tier}`} style={{ left: f.x, top: f.y }}>
            <span className="floater__xp mono">+{f.amount} XP</span>
            {f.rested > 0 && <span className="floater__rested mono">+{f.rested} RESTED</span>}
          </div>
        ))}
      </div>
      <Toasts toasts={toasts} onDismiss={dismissToast} onUndo={undo} />
      {current && <Ceremony key={current.key} item={current} onDone={() => setOverlays((q) => q.slice(1))} />}
      {!current && banners[0] && <Banner key={banners[0].key} item={banners[0]} onDone={dropBanner} />}
    </CelebrationContext.Provider>
  );
}
