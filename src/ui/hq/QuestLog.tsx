import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { ATTRIBUTE_INFO, TIER_INFO } from '../../engine/constants';
import { toLocalDate } from '../../engine/dates';
import type { GameState, Quest } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';

const CLEAR_ANIMATION_MS = 1100;
const BOSS_HOLD_MS = 1100;

export function QuestLog({
  state,
  now,
  spotlightId,
  highlightId,
  onNewQuest,
  onEditQuest,
}: {
  state: GameState;
  now: Date;
  spotlightId: string | null;
  highlightId: string | null;
  onNewQuest: () => void;
  onEditQuest: (quest: Quest) => void;
}) {
  const today = toLocalDate(now);
  // Quests stay visible briefly after clearing so the player sees the strike land.
  const [clearing, setClearing] = useState<Set<string>>(new Set());
  const [showCleared, setShowCleared] = useState(false);

  const markClearing = (id: string) => {
    setClearing((s) => new Set(s).add(id));
    window.setTimeout(() => {
      setClearing((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, CLEAR_ANIMATION_MS);
  };

  const all = state.questOrder.map((id) => state.quests[id]!);
  const visible = all.filter((q) => q.status === 'active' || clearing.has(q.id));
  const dailies = visible.filter((q) => q.cadence === 'daily');
  const quests = visible.filter((q) => q.cadence === 'once');
  // Order never changes on completion: rows sliding under the cursor invite accidental double-completes.
  const dailySorted = dailies;
  const dailyDone = dailies.filter((q) => q.lastCompletedDate === today).length;
  const cleared = all
    .filter((q) => q.status === 'cleared' && !clearing.has(q.id))
    .sort((a, b) => (b.clearedAt ?? '').localeCompare(a.clearedAt ?? ''));

  return (
    <Frame
      className="questlog"
      label="QUEST LOG"
      index="02"
      id="quest-log"
      actions={
        <button className="btn btn--gold" onClick={onNewQuest}>
          <Glyph name="plus" size={14} /> NEW QUEST <kbd className="kbd">N</kbd>
        </button>
      }
    >
      {visible.length === 0 && (
        <div className="questlog__empty">
          <div className="questlog__empty-mark mono">[ NO ACTIVE QUESTS ]</div>
          <p>The log is empty. Suspiciously peaceful. Accept a quest from the Game Master, or forge your own.</p>
          <button className="btn btn--ghost" onClick={onNewQuest}>
            <Glyph name="plus" size={14} /> FORGE A QUEST
          </button>
        </div>
      )}

      {dailies.length > 0 && (
        <div className="questlog__group">
          <div className="questlog__group-head mono">
            <span>
              <Glyph name="repeat" size={12} /> DAILY RITUALS
            </span>
            <span className="questlog__tally">
              {dailyDone}/{dailies.length}
              <span className="questlog__tally-bar">
                <span style={{ width: `${(dailyDone / dailies.length) * 100}%` }} />
              </span>
            </span>
          </div>
          <ul className="quests">
            {dailySorted.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                doneToday={q.lastCompletedDate === today && !clearing.has(q.id)}
                clearing={clearing.has(q.id)}
                spotlight={q.id === spotlightId}
                highlight={q.id === highlightId}
                onCleared={() => markClearing(q.id)}
                onEdit={() => onEditQuest(q)}
              />
            ))}
          </ul>
        </div>
      )}

      {quests.length > 0 && (
        <div className="questlog__group">
          <div className="questlog__group-head mono">
            <span>
              <Glyph name="flag" size={12} /> OPEN QUESTS
            </span>
            <span className="questlog__tally">{quests.filter((q) => !clearing.has(q.id)).length}</span>
          </div>
          <ul className="quests">
            {quests.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                doneToday={false}
                clearing={clearing.has(q.id)}
                spotlight={q.id === spotlightId}
                highlight={q.id === highlightId}
                onCleared={() => markClearing(q.id)}
                onEdit={() => onEditQuest(q)}
              />
            ))}
          </ul>
        </div>
      )}

      {cleared.length > 0 && (
        <div className="questlog__cleared">
          <button className="questlog__cleared-toggle mono" onClick={() => setShowCleared((v) => !v)} aria-expanded={showCleared}>
            <Glyph name={showCleared ? 'chevron-left' : 'chevron-right'} size={12} className={showCleared ? 'rot-90' : ''} />
            CLEARED · {cleared.length}
          </button>
          {showCleared && (
            <ul className="cleared-list">
              {cleared.slice(0, 12).map((q) => (
                <li key={q.id} style={{ '--accent': `var(--attr-${q.attribute})` } as React.CSSProperties}>
                  <Glyph name="check" size={12} className="cleared-list__check" />
                  <span className="cleared-list__title">{q.title}</span>
                  <span className="mono dim">{formatShortDate(q.clearedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Frame>
  );
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function QuestRow({
  quest,
  doneToday,
  clearing,
  spotlight,
  highlight,
  onCleared,
  onEdit,
}: {
  quest: Quest;
  doneToday: boolean;
  clearing: boolean;
  spotlight: boolean;
  highlight: boolean;
  onCleared: () => void;
  onEdit: () => void;
}) {
  const { act } = useCelebration();
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (highlight) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  const complete = (origin: Element | null) => {
    const r = act({ type: 'completeQuest', questId: quest.id }, { origin });
    if (r.ok) onCleared();
  };

  const retire = () => {
    setMenuOpen(false);
    act({ type: 'retireQuest', questId: quest.id });
  };

  const done = doneToday;
  const classes = [
    'quest',
    `quest--${quest.tier}`,
    `quest--${quest.cadence}`,
    done && 'is-done',
    clearing && 'is-clearing',
    spotlight && 'is-spotlight',
    highlight && 'is-highlight',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li ref={rowRef} className={classes} style={{ '--accent': `var(--attr-${quest.attribute})` } as React.CSSProperties}>
      <CompleteButton quest={quest} done={done || clearing} onComplete={complete} />
      <div className="quest__main">
        <div className="quest__title">
          {quest.title}
          <span className="quest__strike" aria-hidden />
        </div>
        <div className="quest__meta mono">
          <span className="quest__attr" title={ATTRIBUTE_INFO[quest.attribute].name}>
            <AttributeIcon attribute={quest.attribute} size={12} /> {quest.attribute}
          </span>
          <span className={`quest__tier quest__tier--${quest.tier}`}>
            <TierIcon tier={quest.tier} size={11} /> {TIER_INFO[quest.tier].label.toUpperCase()}
          </span>
          {quest.cadence === 'daily' && quest.timesCompleted > 0 && (
            <span className="dim" title="Times completed">
              ×{quest.timesCompleted}
            </span>
          )}
          {spotlight && <span className="quest__spotlight">◉ GM SPOTLIGHT</span>}
          {done && <span className="quest__done">DONE TODAY<span className="quest__done-extra"> · RESETS TOMORROW</span></span>}
        </div>
        {quest.notes && <div className="quest__notes">{quest.notes}</div>}
      </div>
      <div className="quest__xp mono">
        +{TIER_INFO[quest.tier].xp}
        <small>XP</small>
      </div>
      <div className="quest__menu">
        <button className="icon-btn" aria-label="Quest options" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          <Glyph name="more" size={16} />
        </button>
        {menuOpen && (
          <>
            <div className="popover-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="popover mono" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                EDIT QUEST
              </button>
              <button role="menuitem" onClick={retire} title="Priorities change. That's allowed.">
                RETIRE QUEST
                <small>no penalty · priorities change</small>
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The completion socket. Boss quests must be *held* — ending something big
 * should take a moment of commitment. Keyboard activation completes directly.
 */
function CompleteButton({ quest, done, onComplete }: { quest: Quest; done: boolean; onComplete: (origin: Element | null) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [charging, setCharging] = useState(false);
  const timer = useRef<number | null>(null);
  const stopHum = useRef<(() => void) | null>(null);
  const needsHold = quest.tier === 'boss';

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stopHum.current?.();
    stopHum.current = null;
    setCharging(false);
  };
  useEffect(() => cancel, []);

  if (done) {
    return (
      <span className="socket is-done" aria-label="Completed">
        <Glyph name="check" size={16} />
      </span>
    );
  }

  if (!needsHold) {
    return (
      <button ref={ref} className="socket" aria-label={`Complete quest: ${quest.title}`} onClick={() => onComplete(ref.current)}>
        <Glyph name="check" size={16} />
      </button>
    );
  }

  return (
    <button
      ref={ref}
      className={`socket socket--boss ${charging ? 'is-charging' : ''}`}
      style={{ '--hold': `${BOSS_HOLD_MS}ms` } as React.CSSProperties}
      aria-label={`Hold to defeat boss: ${quest.title}`}
      title="Hold to defeat"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        setCharging(true);
        stopHum.current = sfx.charge(BOSS_HOLD_MS / 1000);
        timer.current = window.setTimeout(() => {
          stopHum.current?.();
          stopHum.current = null;
          timer.current = null;
          setCharging(false);
          onComplete(ref.current);
        }, BOSS_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onComplete(ref.current);
        }
      }}
    >
      <svg className="socket__ring" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="17" />
      </svg>
      <TierIcon tier="boss" size={16} />
    </button>
  );
}
