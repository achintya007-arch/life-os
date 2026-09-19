/**
 * Up to three goals for the week — "guitar 3×", "move 4×". Optional, light,
 * and forgiving: reaching one pays a bonus; missing one costs nothing, and next
 * week starts fresh.
 */
import { useState } from 'react';
import { ATTRIBUTES, ATTRIBUTE_INFO, WEEKLY_BONUS_PER_TARGET, WEEKLY_MAX_GOALS, WEEKLY_MAX_TARGET, type Attribute } from '../../engine/constants';
import { addDays, startOfWeek, toLocalDate } from '../../engine/dates';
import type { GameState, GoalMatch, WeeklyGoal } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph } from '../components/Icon';
import { Modal } from '../components/Modal';

export function WeeklyGoals({ state, now }: { state: GameState; now: Date }) {
  const { act } = useCelebration();
  const [adding, setAdding] = useState(false);
  const week = startOfWeek(toLocalDate(now));
  const goals = state.weeklyGoalOrder.map((id) => state.weeklyGoals[id]!).filter((g) => g.weekStart === week && g.status !== 'removed');
  const lastWeek = state.weeklyGoalOrder
    .map((id) => state.weeklyGoals[id]!)
    .filter((g) => g.weekStart === addDays(week, -7) && g.status !== 'removed');
  const canRepeat = goals.length === 0 && lastWeek.length > 0;
  const daysLeft = 7 - ((new Date(now).getDay() + 6) % 7);

  const repeatLastWeek = () => {
    for (const g of lastWeek.slice(0, WEEKLY_MAX_GOALS)) {
      if ('questId' in g.match && state.quests[g.match.questId]?.status !== 'active') continue;
      act({ type: 'setWeeklyGoal', label: g.label, target: g.target, match: g.match }, { silent: true });
    }
  };

  return (
    <Frame
      className="goals"
      label="THIS WEEK"
      index="G"
      actions={
        goals.length < WEEKLY_MAX_GOALS && (
          <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Add a weekly goal" title="Add a weekly goal">
            <Glyph name="plus" size={16} />
          </button>
        )
      }
    >
      {goals.length === 0 ? (
        <div className="goals__empty">
          <p>Set up to {WEEKLY_MAX_GOALS} goals for the week. Hit one for bonus XP. Miss one and nothing happens.</p>
          <div className="system__row">
            <button className="btn btn--ghost btn--small" onClick={() => setAdding(true)}>
              <Glyph name="plus" size={12} /> SET A GOAL
            </button>
            {canRepeat && (
              <button className="btn btn--small" onClick={repeatLastWeek}>
                <Glyph name="repeat" size={12} /> REPEAT LAST WEEK
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="goals__list">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} onRemove={() => act({ type: 'removeWeeklyGoal', goalId: g.id })} />
          ))}
        </ul>
      )}
      <p className="goals__foot mono dim">
        {daysLeft} {daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT · RESETS MONDAY
      </p>
      {adding && <GoalComposer state={state} onClose={() => setAdding(false)} />}
    </Frame>
  );
}

function GoalRow({ goal, onRemove }: { goal: WeeklyGoal; onRemove: () => void }) {
  const met = goal.status === 'met';
  const accent = 'attribute' in goal.match ? `var(--attr-${goal.match.attribute})` : 'var(--gold)';
  return (
    <li className={`goal ${met ? 'is-met' : ''}`} style={{ '--accent': accent } as React.CSSProperties}>
      <div className="goal__head">
        <span className="goal__label">{goal.label}</span>
        <span className="goal__count mono">
          {Math.min(goal.progress, goal.target)}/{goal.target}
        </span>
      </div>
      <div className="goal__pips" aria-label={`${goal.progress} of ${goal.target}`}>
        {Array.from({ length: goal.target }, (_, i) => (
          <i key={i} className={i < goal.progress ? 'is-on' : ''} />
        ))}
      </div>
      <div className="goal__foot mono">
        {met ? <span className="gold">◆ MET · +{goal.bonus} XP</span> : <span className="dim">+{goal.bonus} XP WHEN MET</span>}
        {!met && (
          <button className="goal__remove" onClick={onRemove} aria-label={`Remove goal ${goal.label}`}>
            REMOVE
          </button>
        )}
      </div>
    </li>
  );
}

function GoalComposer({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { act } = useCelebration();
  const quests = state.questOrder.map((id) => state.quests[id]!).filter((q) => q.status === 'active');
  const [source, setSource] = useState<string>(quests.find((q) => q.cadence === 'daily')?.id ?? quests[0]?.id ?? 'attr:STR');
  const [target, setTarget] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const match: GoalMatch = source.startsWith('attr:') ? { attribute: source.slice(5) as Attribute } : { questId: source };
  const label =
    'attribute' in match
      ? `${ATTRIBUTE_INFO[match.attribute].name} ${target}×`
      : `${state.quests[match.questId]?.title ?? 'Quest'} ${target}×`;

  const save = () => {
    const r = act({ type: 'setWeeklyGoal', label: label.slice(0, 60), target, match });
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Modal title="Set a Weekly Goal" kicker="THIS WEEK" onClose={onClose}>
      <div className="composer">
        <label className="field">
          <span className="field__label mono">WHAT COUNTS</span>
          <select className="field__input" value={source} onChange={(e) => setSource(e.target.value)} data-autofocus>
            {quests.length > 0 && (
              <optgroup label="One of your quests">
                {quests.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Any deed in an attribute">
              {ATTRIBUTES.map((a) => (
                <option key={a} value={`attr:${a}`}>
                  {a} — {ATTRIBUTE_INFO[a].name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="field">
          <span className="field__label mono">HOW MANY TIMES THIS WEEK</span>
          <div className="goal-target">
            {Array.from({ length: WEEKLY_MAX_TARGET }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={`goal-target__n mono ${n === target ? 'is-selected' : ''}`} onClick={() => setTarget(n)} aria-pressed={n === target}>
                {n}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="composer__error mono">{error}</div>}
        <footer className="composer__footer">
          <span className="composer__preview mono">
            {'attribute' in match && <AttributeIcon attribute={match.attribute} size={14} />} {label} ·{' '}
            <span className="gold">+{target * WEEKLY_BONUS_PER_TARGET} XP</span>
          </span>
          <button className="btn btn--gold btn--lg" onClick={save}>
            SET GOAL
          </button>
        </footer>
      </div>
    </Modal>
  );
}
