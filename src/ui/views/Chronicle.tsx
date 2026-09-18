import { useMemo, useState } from 'react';
import { ACHIEVEMENT_BY_ID } from '../../engine/achievements';
import { chronicleFor } from '../../engine/chronicle';
import { ATTRIBUTES, ATTRIBUTE_INFO } from '../../engine/constants';
import { monthKey, shiftMonth, toLocalDate, weekdayIndex } from '../../engine/dates';
import type { Deed, GameState } from '../../engine/types';
import { CountUp } from '../components/CountUp';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 'S'}`;

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase();
}

export function Chronicle({ state, now }: { state: GameState; now: Date }) {
  const currentMonth = monthKey(toLocalDate(now));
  const firstMonth = state.character ? monthKey(toLocalDate(new Date(state.character.createdAt))) : currentMonth;
  const [month, setMonth] = useState(currentMonth);
  const c = useMemo(() => chronicleFor(state, month), [state, month]);
  const maxDaily = Math.max(1, ...c.dailyXp);
  const firstWeekday = weekdayIndex(`${month}-01`);

  const byDay = useMemo(() => {
    const groups = new Map<string, Deed[]>();
    for (const d of [...c.deeds].reverse()) {
      const list = groups.get(d.localDate) ?? [];
      list.push(d);
      groups.set(d.localDate, list);
    }
    return [...groups.entries()];
  }, [c.deeds]);

  const levelsGained = c.levelEnd - c.levelStart;

  return (
    <main className="view chronicle">
      <header className="view__header chronicle__header">
        <div>
          <div className="view__kicker mono">THE CHRONICLE</div>
          <h1 className="view__title chronicle__month">{monthLabel(month)}</h1>
        </div>
        <div className="chronicle__nav">
          <button className="icon-btn" disabled={month <= firstMonth} onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            <Glyph name="chevron-left" size={18} />
          </button>
          <button className="icon-btn" disabled={month >= currentMonth} onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
            <Glyph name="chevron-right" size={18} />
          </button>
        </div>
      </header>

      {c.deeds.length === 0 ? (
        <Frame className="chronicle__blank">
          <div className="mono dim">[ BLANK PAGES ]</div>
          <p>
            {month === currentMonth
              ? 'Nothing written here yet. Blank pages are just potential with good posture.'
              : 'A quiet month. Rest is part of the story too.'}
          </p>
        </Frame>
      ) : (
        <>
          <section className="ledger">
            <div className="ledger__stat ledger__stat--hero">
              <span className="ledger__label mono">XP EARNED</span>
              <span className="ledger__value mono gold">
                +<CountUp to={c.xp} duration={900} />
              </span>
            </div>
            <div className="ledger__stat">
              <span className="ledger__label mono">LEVEL</span>
              <span className="ledger__value mono">
                {levelsGained > 0 ? (
                  <>
                    {c.levelStart} <span className="dim">→</span> {c.levelEnd}
                  </>
                ) : (
                  c.levelEnd
                )}
              </span>
            </div>
            <div className="ledger__stat">
              <span className="ledger__label mono">DEEDS</span>
              <span className="ledger__value mono">{c.deeds.length}</span>
            </div>
            <div className="ledger__stat">
              <span className="ledger__label mono">DAYS IN MOTION</span>
              <span className="ledger__value mono">{c.activeDays}</span>
            </div>
            <div className="ledger__stat">
              <span className="ledger__label mono">ACHIEVEMENTS</span>
              <span className="ledger__value mono">{c.achievements.length}</span>
            </div>
          </section>

          <div className="chronicle__grid">
            <Frame label="THE MONTH" index="I" className="calendar-frame">
              <div className="calendar">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="calendar__dow mono">
                    {d}
                  </span>
                ))}
                {Array.from({ length: firstWeekday }, (_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {c.dailyXp.map((xp, i) => {
                  const intensity = xp === 0 ? 0 : 0.25 + 0.75 * (xp / maxDaily);
                  return (
                    <span
                      key={i}
                      className={`calendar__day ${xp > 0 ? 'is-active' : ''}`}
                      style={{ '--intensity': intensity } as React.CSSProperties}
                      title={xp > 0 ? `${i + 1}: +${xp} XP` : `${i + 1}`}
                    >
                      <span className="mono">{i + 1}</span>
                    </span>
                  );
                })}
              </div>
            </Frame>

            <Frame label="BY ATTRIBUTE" index="II">
              <ul className="attr-ledger">
                {ATTRIBUTES.map((a) => {
                  const entry = c.byAttribute[a];
                  const share = c.xp > 0 ? entry.xp / c.xp : 0;
                  return (
                    <li key={a} style={{ '--accent': `var(--attr-${a})` } as React.CSSProperties} className={entry.count === 0 ? 'is-empty' : ''}>
                      <AttributeIcon attribute={a} size={15} />
                      <span className="attr-ledger__name">{ATTRIBUTE_INFO[a].name}</span>
                      <span className="attr-ledger__count mono">{entry.count}×</span>
                      <span className="attr-ledger__bar">
                        <span style={{ width: `${share * 100}%` }} />
                      </span>
                      <span className="attr-ledger__xp mono">{entry.xp.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
              {c.topRepeats.length > 0 && (
                <div className="repeats">
                  <div className="repeats__label mono">RITUALS KEPT</div>
                  {c.topRepeats.map((r) => (
                    <div key={r.title} className="repeats__row" style={{ '--accent': `var(--attr-${r.attribute})` } as React.CSSProperties}>
                      <span className="repeats__count mono">×{r.count}</span>
                      <span>{r.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </Frame>

            {c.biggestWin && (
              <Frame label="BIGGEST WIN" index="III" className="biggest-win">
                <div className="biggest-win__body" style={{ '--accent': `var(--attr-${c.biggestWin.attribute})` } as React.CSSProperties}>
                  <TierIcon tier={c.biggestWin.tier} size={28} />
                  <div>
                    <div className="biggest-win__title">{c.biggestWin.title}</div>
                    <div className="mono dim">
                      {new Date(c.biggestWin.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                    </div>
                  </div>
                  <div className="biggest-win__xp mono gold">+{c.biggestWin.xp}</div>
                </div>
              </Frame>
            )}

            {c.achievements.length > 0 && (
              <Frame label="UNLOCKED" index="IV">
                <ul className="chronicle__achievements">
                  {c.achievements.map((id) => {
                    const a = ACHIEVEMENT_BY_ID.get(id);
                    return a ? (
                      <li key={id} className={`rarity--${a.rarity}`}>
                        <Glyph name="signal" size={12} /> {a.name}
                      </li>
                    ) : null;
                  })}
                </ul>
              </Frame>
            )}
          </div>

          <Frame label="THE LOG" index="V" className="log-frame">
            <ol className="log">
              {byDay.map(([date, deeds]) => (
                <li key={date} className="log__day">
                  <div className="log__date mono">
                    {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                    <span className="gold">+{deeds.reduce((s, d) => s + d.xp, 0)}</span>
                  </div>
                  <ul>
                    {deeds.map((d) => (
                      <li key={d.id} className="log__deed" style={{ '--accent': `var(--attr-${d.attribute})` } as React.CSSProperties}>
                        <TierIcon tier={d.tier} size={12} />
                        <span className="log__title">
                          {d.kind === 'chapter' && <span className="mono dim">CHAPTER · </span>}
                          {d.title}
                        </span>
                        <span className="mono dim">{new Date(d.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="mono log__xp">+{d.xp}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Frame>
        </>
      )}

      <AllTime state={state} />
    </main>
  );
}

function AllTime({ state }: { state: GameState }) {
  if (state.deeds.length === 0 || !state.character) return null;
  const since = new Date(state.character.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const days = new Set(state.deeds.map((d) => d.localDate)).size;
  return (
    <p className="alltime mono">
      SINCE {since.toUpperCase()} · {plural(state.deeds.length, 'DEED')} · {plural(days, 'DAY')} IN MOTION ·{' '}
      {state.totalXp.toLocaleString()} XP · {plural(Object.keys(state.achievements).length, 'ACHIEVEMENT')}
    </p>
  );
}
