import { useEffect, useMemo, useRef, useState } from 'react';
import { TIER_INFO } from '../../engine/constants';
import { briefing, suggestQuests, type SuggestedQuest } from '../../engine/gameMaster';
import type { GameState } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';

/** Typewriter text. Runs once per distinct text; click to reveal instantly. */
function Transmission({ text, delay = 0, speed = 16 }: { text: string; delay?: number; speed?: number }) {
  const [count, setCount] = useState(0);
  const skipped = useRef(false);
  useEffect(() => {
    skipped.current = false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        i += 1;
        if (skipped.current || i >= text.length) {
          window.clearInterval(interval);
          if (!skipped.current) setCount(i);
          return;
        }
        setCount(i);
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [text, delay, speed]);
  const typing = count < text.length;
  const reveal = () => {
    skipped.current = true;
    setCount(text.length);
  };
  return (
    <span className={`transmission ${typing ? 'is-typing' : ''}`} onClick={reveal}>
      {text.slice(0, count)}
      <span className="transmission__ghost" aria-hidden>
        {text.slice(count)}
      </span>
    </span>
  );
}

export function GameMasterPanel({ state, now, onFocusQuest }: { state: GameState; now: Date; onFocusQuest: (id: string) => void }) {
  const { act, reaction, clearReaction } = useCelebration();
  const [reroll, setReroll] = useState(0);
  const [askedForQuests, setAskedForQuests] = useState(false);
  // Briefing recomputes on the hour, not every tick — the GM shouldn't babble.
  const hourKey = `${now.toDateString()}:${now.getHours()}:${state.deeds.length}:${state.questOrder.length}`;
  const brief = useMemo(() => briefing(state, now), [hourKey]);

  const activeCount = state.questOrder.filter((id) => state.quests[id]!.status === 'active').length;
  const showSuggestions = askedForQuests || activeCount < 3;
  const suggestions = useMemo(
    () => (showSuggestions ? suggestQuests(state, now, 3, reroll) : []),
    [showSuggestions, reroll, state.questOrder.length, state.deeds.length, now.toDateString()],
  );

  // Reactions fade back to the briefing after a while.
  useEffect(() => {
    if (!reaction) return;
    const t = window.setTimeout(clearReaction, 45_000);
    return () => window.clearTimeout(t);
  }, [reaction, clearReaction]);

  const accept = (s: SuggestedQuest, el: HTMLElement) => {
    const { pitch: _pitch, ...draft } = s;
    const r = act({ type: 'createQuest', quest: draft }, { origin: el });
    if (r.ok) setAskedForQuests(false);
  };

  return (
    <Frame
      className={`gm ${reaction ? 'gm--reacting' : ''}`}
      label={
        <>
          <span className="gm__sigil" aria-hidden>
            <Glyph name="signal" size={12} />
          </span>
          GAME MASTER
        </>
      }
      index="00"
    >
      <div className="gm__body" aria-live="polite">
        {reaction ? (
          <div className="gm__reaction" key={reaction.deedId}>
            <div className="gm__salutation mono">{reaction.headline}</div>
            <p className="gm__line">
              <Transmission text={reaction.line} />
            </p>
          </div>
        ) : (
          <div key={brief.salutation + brief.lines.join()}>
            <div className="gm__salutation mono">
              <Transmission text={brief.salutation} speed={28} />
            </div>
            {brief.lines.map((line, i) => (
              <p className="gm__line" key={line}>
                <Transmission text={line} delay={500 + i * 900} />
              </p>
            ))}
          </div>
        )}
      </div>

      {brief.spotlight && !reaction && state.quests[brief.spotlight.questId]?.status === 'active' && (
        <div className="spotlight">
          <div className="spotlight__kicker mono">SIDE STORY DETECTED</div>
          <div className="spotlight__codename">⚔ {brief.spotlight.codename}</div>
          <div className="spotlight__quest">{state.quests[brief.spotlight.questId]!.title}</div>
          {brief.spotlight.lines.map((l) => (
            <p key={l} className="spotlight__line">
              {l}
            </p>
          ))}
          <button className="btn btn--gm" onClick={() => onFocusQuest(brief.spotlight!.questId)}>
            OPEN THE DOOR
          </button>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="offers">
          <div className="offers__head mono">
            <span>PROPOSED QUESTS</span>
            <button className="offers__reroll" onClick={() => setReroll((r) => r + 1)} title="Different quests">
              <Glyph name="dice" size={13} /> REROLL
            </button>
          </div>
          <ul>
            {suggestions.map((s) => (
              <li key={s.title} className="offer" style={{ '--accent': `var(--attr-${s.attribute})` } as React.CSSProperties}>
                <div className="offer__main">
                  <div className="offer__title">{s.title}</div>
                  <div className="offer__pitch">{s.pitch}</div>
                  <div className="offer__meta mono">
                    <span style={{ color: 'var(--accent)' }}>
                      <AttributeIcon attribute={s.attribute} size={11} /> {s.attribute}
                    </span>
                    <span>
                      <TierIcon tier={s.tier} size={11} /> {TIER_INFO[s.tier].label.toUpperCase()}
                    </span>
                    {s.cadence === 'daily' && (
                      <span>
                        <Glyph name="repeat" size={11} /> DAILY
                      </span>
                    )}
                    <span className="gold">+{TIER_INFO[s.tier].xp} XP</span>
                  </div>
                </div>
                <button className="btn btn--small" onClick={(e) => accept(s, e.currentTarget)}>
                  ACCEPT
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showSuggestions && (
        <button className="gm__ask mono" onClick={() => setAskedForQuests(true)}>
          <Glyph name="dice" size={13} /> ASK THE GM FOR A QUEST
        </button>
      )}
    </Frame>
  );
}
