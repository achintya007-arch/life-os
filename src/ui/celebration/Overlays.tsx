import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import type { AchievementDef } from '../../engine/achievements';
import type { Attribute } from '../../engine/constants';
import type { Campaign, Deed } from '../../engine/types';
import { CountUp } from '../components/CountUp';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';

export interface Honor {
  achievement: AchievementDef;
  titleName?: string;
}

export interface LevelGain {
  from: number;
  to: number;
  titles: string[];
}

export type AttributeGain = { attribute: Attribute; from: number; to: number };

/**
 * A ceremony is the ONE full-screen moment an action may earn. Its `primary`
 * picks the scene; everything else that happened in the same action (a level,
 * rank-ups, achievements) rides along on that screen instead of queueing its own.
 */
export interface CeremonyItem {
  key: number;
  primary: 'campaign' | 'boss' | 'levelUp';
  deed: Deed;
  campaign?: Campaign;
  level?: LevelGain;
  attributeUps: AttributeGain[];
  honors: Honor[];
  line: string;
}

/** Non-blocking moments: they announce, then get out of the way. */
export type BannerItem =
  | {
      kind: 'chapter';
      key: number;
      campaign: Campaign;
      chapterIndex: number;
      xp: number;
      honors: Honor[];
    }
  | { kind: 'honor'; key: number; honors: Honor[] };

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const CEREMONY_SOUND = { campaign: 'campaign', boss: 'boss', levelUp: 'levelUp' } as const;

function useCoarsePointer(): boolean {
  return useMemo(() => window.matchMedia?.('(pointer: coarse)').matches ?? false, []);
}

export function Ceremony({ item, onDone }: { item: CeremonyItem; onDone: () => void }) {
  const [closing, setClosing] = useState(false);
  const [armed, setArmed] = useState(false);
  const coarse = useCoarsePointer();
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    sfx.play(CEREMONY_SOUND[item.primary]);
    // The boss hit lands on the world behind the screen, too.
    if (item.primary === 'boss') {
      document.body.classList.add('is-impact');
      window.setTimeout(() => document.body.classList.remove('is-impact'), 520);
    }
    // iOS chains touch scrolling through fixed layers: hold the page still underneath.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Prevent the click that triggered this from instantly dismissing it.
    const t = window.setTimeout(() => setArmed(true), 900);
    return () => {
      window.clearTimeout(t);
      root.style.overflow = prevOverflow;
      document.body.classList.remove('is-impact');
    };
  }, [item]);

  useEffect(() => {
    if (armed) continueRef.current?.focus({ preventScroll: true });
  }, [armed]);

  const close = () => {
    if (!armed || closing) return;
    setClosing(true);
    window.setTimeout(onDone, 320);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const accent = item.campaign ? `var(--attr-${item.campaign.attribute})` : undefined;

  return (
    <div
      className={`ceremony ceremony--${item.primary} ${closing ? 'is-closing' : ''}`}
      style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={item.primary === 'levelUp' ? 'Level up' : item.primary === 'boss' ? 'Boss defeated' : 'Campaign complete'}
      onClick={close}
    >
      <div className="ceremony__backdrop" aria-hidden />
      <div className="ceremony__stage">
        {item.primary === 'levelUp' && <Ascension item={item} />}
        {item.primary === 'boss' && <Impact item={item} />}
        {item.primary === 'campaign' && <Road item={item} />}
        <Spoils item={item} />
        {item.line && <p className="ceremony__gm">“{item.line}”</p>}
      </div>
      <button ref={continueRef} className={`ceremony__continue mono ${armed ? 'is-armed' : ''}`} onClick={close} tabIndex={armed ? 0 : -1}>
        {coarse ? 'TAP TO CONTINUE' : 'CONTINUE ⏎'}
      </button>
    </div>
  );
}

/* ── Level up: the badge ascends and turns over to the new number. ── */
function Ascension({ item }: { item: CeremonyItem }) {
  const level = item.level!;
  return (
    <>
      <div className="ascend" aria-hidden>
        <div className="ascend__column" />
        <div className="ascend__rings">
          <i />
          <i />
          <i />
        </div>
        <div className="ascend__badge">
          <div className="ascend__face ascend__face--from mono">{level.from}</div>
          <div className="ascend__face ascend__face--to mono">{level.to}</div>
        </div>
      </div>
      <div className="ceremony__kicker mono">CHARACTER PROGRESSION</div>
      <h2 className="ceremony__headline ceremony__headline--level">LEVEL UP</h2>
      <div className="ascend__caption mono">
        LEVEL {level.from} <span>→</span> <strong>{level.to}</strong>
      </div>
      {level.titles.length > 0 && <TitleUnlock name={level.titles[level.titles.length - 1]!} />}
    </>
  );
}

/* ── Boss: the sigil takes the hit and shatters. ── */
function Impact({ item }: { item: CeremonyItem }) {
  return (
    <>
      <div className="impact__flash" aria-hidden />
      <div className="impact__slash" aria-hidden />
      <div className="impact" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={`impact__shard impact__shard--${i}`} />
        ))}
        <div className="impact__sigil">
          <TierIcon tier="boss" size={40} />
        </div>
      </div>
      <div className="ceremony__kicker mono">BOSS QUEST</div>
      <h2 className="ceremony__headline ceremony__headline--boss">BOSS DEFEATED</h2>
      <div className="ceremony__subject">{item.deed.title}</div>
      <div className="ceremony__xp mono">
        +<CountUp to={item.deed.xp} duration={1100} /> XP
      </div>
      {item.level && <LevelBand level={item.level} delay={1.5} />}
    </>
  );
}

/* ── Campaign: the road lights up chapter by chapter, then the seal stamps. ── */
function Road({ item }: { item: CeremonyItem }) {
  const campaign = item.campaign!;
  const n = campaign.chapters.length;
  const step = Math.min(0.2, 1.2 / n);
  const sealAt = 0.5 + n * step + 0.15;
  return (
    <>
      <div className="ceremony__kicker mono">CAMPAIGN COMPLETE</div>
      <h2 className="ceremony__headline ceremony__headline--campaign">{campaign.name}</h2>
      <ol className="road" style={{ '--road-time': `${n * step}s` } as React.CSSProperties}>
        {campaign.chapters.map((c, i) => (
          <li key={c.id} className="road__stop" style={{ animationDelay: `${0.5 + i * step}s` }}>
            <span className="road__node" style={{ animationDelay: `${0.5 + i * step}s` }} />
            <span className="road__num mono">{ROMAN[i] ?? i + 1}</span>
            <span className="road__title">{c.title}</span>
          </li>
        ))}
      </ol>
      <div className="road__seal" style={{ animationDelay: `${sealAt}s` }} aria-hidden>
        <Glyph name="check" size={26} />
      </div>
      <div className="ceremony__xp mono" style={{ animationDelay: `${sealAt + 0.2}s` }}>
        +<CountUp to={item.deed.xp} duration={1200} /> XP
      </div>
      {item.level && <LevelBand level={item.level} delay={sealAt + 0.5} />}
    </>
  );
}

function LevelBand({ level, delay }: { level: LevelGain; delay: number }) {
  return (
    <div className="level-band" style={{ animationDelay: `${delay}s` }}>
      <span className="level-band__badge mono">{level.to}</span>
      <span className="level-band__text mono">
        LEVEL UP · {level.from} → <strong>{level.to}</strong>
      </span>
      {level.titles.length > 0 && <span className="level-band__title mono">+ TITLE · {level.titles[level.titles.length - 1]}</span>}
    </div>
  );
}

function TitleUnlock({ name }: { name: string }) {
  return (
    <div className="title-unlock">
      <span className="mono">NEW TITLE UNLOCKED</span>
      <strong>{name}</strong>
    </div>
  );
}

/** Everything else this action earned, consolidated on the one screen. */
function Spoils({ item }: { item: CeremonyItem }) {
  const showRanks = item.attributeUps.length > 0;
  if (!showRanks && item.honors.length === 0) return null;
  return (
    <div className="spoils">
      {showRanks && (
        <div className="spoils__ranks mono">
          {item.attributeUps.map((a) => (
            <span key={a.attribute} style={{ color: `var(--attr-${a.attribute})` }}>
              <AttributeIcon attribute={a.attribute} size={14} /> {a.attribute} {a.from}→<strong>{a.to}</strong>
            </span>
          ))}
        </div>
      )}
      {item.honors.map((h) => (
        <div key={h.achievement.id} className={`honor rarity--${h.achievement.rarity}`}>
          <span className="honor__medal">
            <Glyph name="signal" size={16} />
          </span>
          <span className="honor__text">
            <span className="honor__kicker mono">
              {h.achievement.rarity.toUpperCase()} {h.achievement.hidden ? 'SECRET' : 'ACHIEVEMENT'}
            </span>
            <strong className="mono">{h.achievement.name}</strong>
            {h.titleName && <span className="honor__title mono">+ TITLE · {h.titleName}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════ Banners: a moment that never blocks input ═══════════ */

export const BANNER_MS = { chapter: 3400, honor: 4600 } as const;

export function Banner({ item, onDone }: { item: BannerItem; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    sfx.play(item.kind === 'chapter' ? 'chapter' : 'achievement');
    const leave = window.setTimeout(() => setLeaving(true), BANNER_MS[item.kind]);
    return () => window.clearTimeout(leave);
  }, [item]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, 380);
    return () => window.clearTimeout(t);
  }, [leaving, onDone]);

  if (item.kind === 'chapter') {
    const { campaign, chapterIndex } = item;
    const next = campaign.chapters[chapterIndex + 1];
    return (
      <div
        className={`banner banner--chapter ${leaving ? 'is-leaving' : ''}`}
        style={{ '--accent': `var(--attr-${campaign.attribute})` } as React.CSSProperties}
        role="status"
        onClick={() => setLeaving(true)}
      >
        <div className="banner__sweep" aria-hidden />
        <div className="banner__numeral mono" aria-hidden>
          {ROMAN[chapterIndex] ?? chapterIndex + 1}
        </div>
        <div className="banner__body">
          <div className="banner__kicker mono">CHAPTER {ROMAN[chapterIndex] ?? chapterIndex + 1} CLEARED · +{item.xp} XP</div>
          <div className="banner__title">{campaign.chapters[chapterIndex]!.title}</div>
          <div className="banner__pips" aria-label={`${chapterIndex + 1} of ${campaign.chapters.length} chapters`}>
            {campaign.chapters.map((c, i) => (
              <i key={c.id} className={i < chapterIndex ? 'is-on' : i === chapterIndex ? 'is-new' : ''} />
            ))}
          </div>
          <div className="banner__next mono">
            {campaign.name}
            {next && (
              <>
                {' '}
                · NEXT: <span>{next.title}</span>
              </>
            )}
          </div>
          {item.honors.map((h) => (
            <div key={h.achievement.id} className={`banner__honor mono rarity--${h.achievement.rarity}`}>
              ◆ {h.achievement.name}
              {h.titleName ? ` · TITLE: ${h.titleName}` : ''}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const [first, ...rest] = item.honors;
  const a = first!.achievement;
  return (
    <div className={`banner banner--honor rarity--${a.rarity} ${leaving ? 'is-leaving' : ''}`} role="status" onClick={() => setLeaving(true)}>
      <div className="banner__sweep" aria-hidden />
      <div className="banner__medal" aria-hidden>
        <Glyph name="signal" size={26} />
      </div>
      <div className="banner__body">
        <div className="banner__kicker mono">
          {a.rarity.toUpperCase()} · {a.hidden ? 'SECRET DISCOVERED' : 'ACHIEVEMENT UNLOCKED'}
        </div>
        <div className="banner__title banner__title--mono mono">{a.name}</div>
        <div className="banner__desc">{a.description}</div>
        {first!.titleName && <div className="banner__unlock mono">NEW TITLE · {first!.titleName}</div>}
        {rest.map((h) => (
          <div key={h.achievement.id} className={`banner__honor mono rarity--${h.achievement.rarity}`}>
            ◆ {h.achievement.name}
          </div>
        ))}
      </div>
    </div>
  );
}
