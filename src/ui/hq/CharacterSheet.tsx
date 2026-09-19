import { useMemo, useState } from 'react';
import { weekActivity } from '../../engine/chronicle';
import { ATTRIBUTES, ATTRIBUTE_INFO, RESTED_GAP_DAYS } from '../../engine/constants';
import { daysBetween, startOfWeek, toLocalDate } from '../../engine/dates';
import { attributeRankInfo, levelInfo } from '../../engine/leveling';
import { displayTitle } from '../../engine/titles';
import type { GameState } from '../../engine/types';
import { CountUp } from '../components/CountUp';
import { Frame } from '../components/Frame';
import { CLASSES } from '../../engine/classes';
import { RANK_NAMES } from '../../engine/interestCatalog';
import { activeInterests } from '../../engine/interests';
import { AttributeIcon, ClassIcon, Glyph } from '../components/Icon';
import { ClassModal } from './ClassPicker';
import { InterestsModal } from './InterestPicker';
import { XpBar } from '../components/XpBar';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The character, front and centre: who you are, how far to the next level,
 * what today has already earned, and your shape at a glance.
 */
export function CharacterHero({ state, now, onOpenVault }: { state: GameState; now: Date; onOpenVault: () => void }) {
  const info = levelInfo(state.totalXp);
  const title = displayTitle(state);
  const today = toLocalDate(now);
  const week = weekActivity(state, startOfWeek(today));
  const todayIndex = (now.getDay() + 6) % 7;
  const activeDays = week.filter(Boolean).length;
  const rested = state.lastActiveDate !== null && daysBetween(state.lastActiveDate, today) >= RESTED_GAP_DAYS;
  const xpToday = state.transactions.reduce((sum, t) => (t.localDate === today ? sum + t.amount : sum), 0);
  const deedsToday = state.deeds.filter((d) => d.localDate === today).length;
  const [classOpen, setClassOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const interests = useMemo(() => activeInterests(state), [state]);
  const classId = state.character?.classId ?? null;

  return (
    <Frame className="hero" as="section" label="CHARACTER FILE" index="01">
      {classOpen && <ClassModal onClose={() => setClassOpen(false)} />}
      {interestsOpen && <InterestsModal onClose={() => setInterestsOpen(false)} />}
      <div className="hero__identity">
        <div className="level-badge level-badge--hero" key={info.level}>
          <span className="level-badge__label mono">LVL</span>
          <span className="level-badge__num mono">{info.level}</span>
        </div>
        <div className="hero__who">
          <h1 className="hero__name">{state.character?.name}</h1>
          <div className="hero__tags">
            {classId ? (
              <button
                className="class-badge"
                style={{ '--accent': CLASSES[classId].primary ? `var(--attr-${CLASSES[classId].primary})` : 'var(--gold)' } as React.CSSProperties}
                onClick={() => setClassOpen(true)}
                title="Your class — tap to change"
              >
                <ClassIcon classId={classId} size={14} /> {CLASSES[classId].name.toUpperCase()}
              </button>
            ) : (
              <button className="class-badge class-badge--empty" onClick={() => setClassOpen(true)}>
                ◇ CHOOSE YOUR CLASS
              </button>
            )}
            <button className="sheet__title" onClick={onOpenVault} title="Change title">
              {title.name}
            </button>
          </div>
          <div className="hero__interests">
            {interests.slice(0, 4).map((i) => (
              <button
                key={i.id}
                className={`interest-chip ${i.source === 'inferred' ? 'is-inferred' : ''}`}
                style={{ '--accent': `var(--attr-${i.attribute})` } as React.CSSProperties}
                onClick={() => setInterestsOpen(true)}
                title={i.source === 'inferred' ? `Noticed in your quest log — tap to confirm` : `${RANK_NAMES[i.rank]} · tap to edit interests`}
              >
                <AttributeIcon attribute={i.attribute} size={11} /> {i.name}
                <span className="interest-chip__rank">{i.source === 'inferred' ? '?' : 'I'.repeat(i.rank)}</span>
              </button>
            ))}
            {interests.length > 4 && (
              <button className="interest-chip" onClick={() => setInterestsOpen(true)}>
                +{interests.length - 4}
              </button>
            )}
            {state.interests.length === 0 && (
              <button className="interest-chip interest-chip--empty" onClick={() => setInterestsOpen(true)}>
                <Glyph name="plus" size={10} /> {interests.length ? 'ADD YOUR INTERESTS' : 'WHAT DO YOU LOVE DOING?'}
              </button>
            )}
          </div>
          <div className="hero__lifetime mono dim">
            LIFETIME <CountUp to={state.totalXp} /> XP
          </div>
        </div>
      </div>

      <div className="hero__progress">
        <div className="hero__xp-row mono">
          <span>
            <strong className="gold">
              <CountUp to={info.xpIntoLevel} />
            </strong>
            <span className="dim"> / {info.xpForLevel.toLocaleString()} XP</span>
          </span>
          <span className="dim">
            {(info.xpForLevel - info.xpIntoLevel).toLocaleString()} TO <span className="hero__next">LV{info.level + 1}</span>
          </span>
        </div>
        <XpBar totalXp={state.totalXp} />
        <ul className="chips" aria-label="Attributes">
          {ATTRIBUTES.map((a) => {
            const { rank, progress } = attributeRankInfo(state.attributeXp[a]);
            return (
              <li
                key={a}
                className="chip"
                style={{ '--accent': `var(--attr-${a})` } as React.CSSProperties}
                title={`${ATTRIBUTE_INFO[a].name} rank ${rank}: ${ATTRIBUTE_INFO[a].domain}`}
              >
                <AttributeIcon attribute={a} size={13} className="chip__icon" />
                <span className="chip__code mono">{a}</span>
                <span className="chip__rank mono" key={rank}>
                  {rank}
                </span>
                <span className="chip__bar">
                  <span style={{ width: `${progress * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="hero__today">
        <div className="today">
          <span className="today__label mono">TODAY</span>
          <span className={`today__xp mono ${xpToday > 0 ? 'is-on' : ''}`}>
            +<CountUp to={xpToday} />
            <small>XP</small>
          </span>
          <span className="today__deeds mono dim">
            {deedsToday === 0 ? 'the day is unwritten' : `${deedsToday} ${deedsToday === 1 ? 'deed' : 'deeds'} done`}
          </span>
        </div>
        <div className="rhythm">
          <div className="rhythm__head mono">
            <span>THIS WEEK</span>
            <span className="dim">
              {activeDays === 0 ? 'a fresh week' : `${activeDays} ${activeDays === 1 ? 'day' : 'days'} in motion`}
            </span>
          </div>
          <div className="rhythm__days">
            {week.map((on, i) => (
              <div key={i} className={`rhythm__day ${on ? 'is-on' : ''} ${i === todayIndex ? 'is-today' : ''} ${i > todayIndex ? 'is-future' : ''}`}>
                <i />
                <span className="mono">{WEEKDAYS[i]}</span>
              </div>
            ))}
          </div>
        </div>
        {rested && (
          <div className="rested mono">
            <span className="rested__glyph">☾</span>
            <span>
              <strong>RESTED</strong> · next deed earns +50% XP
            </span>
          </div>
        )}
      </div>
    </Frame>
  );
}

/** The character's shape: radar plus the detailed attribute ledger. */
export function AttributePanel({ state }: { state: GameState }) {
  return (
    <Frame className="attributes" label="ATTRIBUTES" index="03">
      <AttributeRadar state={state} />
      <ul className="attrs">
        {ATTRIBUTES.map((a) => (
          <AttributeRow key={a} attribute={a} xp={state.attributeXp[a]} />
        ))}
      </ul>
    </Frame>
  );
}

function AttributeRow({ attribute, xp }: { attribute: (typeof ATTRIBUTES)[number]; xp: number }) {
  const { rank, progress, xpToNext } = attributeRankInfo(xp);
  const [hover, setHover] = useState(false);
  return (
    <li
      className="attr"
      style={{ '--accent': `var(--attr-${attribute})` } as React.CSSProperties}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${ATTRIBUTE_INFO[attribute].name}: ${ATTRIBUTE_INFO[attribute].domain}`}
    >
      <AttributeIcon attribute={attribute} size={15} className="attr__icon" />
      <span className="attr__code mono">{attribute}</span>
      <span className="attr__name">{hover ? `${xpToNext} XP to ${rank + 1}` : ATTRIBUTE_INFO[attribute].name}</span>
      <span className="attr__rank mono" key={rank}>
        {rank}
      </span>
      <span className="attr__bar">
        <span style={{ width: `${progress * 100}%` }} />
      </span>
    </li>
  );
}

/** A pentagon of the five attributes — the character's shape at a glance. */
function AttributeRadar({ state }: { state: GameState }) {
  const size = 180;
  const c = size / 2;
  const r = 66;
  const ranks = ATTRIBUTES.map((a) => {
    const info = attributeRankInfo(state.attributeXp[a]);
    return info.rank + info.progress - 1; // continuous, starts at 0
  });
  const max = Math.max(4, ...ranks) * 1.1;
  const point = (i: number, scale: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [c + Math.cos(angle) * r * scale, c + Math.sin(angle) * r * scale] as const;
  };
  const ring = (scale: number) => ATTRIBUTES.map((_, i) => point(i, scale).join(',')).join(' ');
  const shape = ranks.map((v, i) => point(i, Math.max(0.06, v / max)).join(',')).join(' ');
  const empty = ranks.every((v) => v === 0);

  return (
    <div className="radar">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Attribute shape">
        {[1, 0.66, 0.33].map((s) => (
          <polygon key={s} points={ring(s)} className="radar__ring" />
        ))}
        {ATTRIBUTES.map((a, i) => {
          const [x, y] = point(i, 1);
          return <line key={a} x1={c} y1={c} x2={x} y2={y} className="radar__spoke" />;
        })}
        <polygon points={shape} className={`radar__shape ${empty ? 'is-empty' : ''}`} />
        {ATTRIBUTES.map((a, i) => {
          const [x, y] = point(i, Math.max(0.06, ranks[i]! / max));
          return <circle key={a} cx={x} cy={y} r={2.6} style={{ fill: `var(--attr-${a})` }} />;
        })}
        {ATTRIBUTES.map((a, i) => {
          const [x, y] = point(i, 1.24);
          return (
            <text key={a} x={x} y={y} className="radar__label" style={{ fill: `var(--attr-${a})` }} textAnchor="middle" dominantBaseline="middle">
              {a}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
