/**
 * Today's board: three system-issued contracts. They can't be edited — the
 * point is that the game sets the challenge — and they're the only source of
 * the day's contract XP. Missing them costs nothing; midnight brings new ones.
 */
import { useRef } from 'react';
import { CLASSES } from '../../engine/classes';
import { ATTRIBUTE_INFO } from '../../engine/constants';
import { toLocalDate } from '../../engine/dates';
import type { Contract, GameState } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { AttributeIcon, Glyph } from '../components/Icon';

function untilMidnight(now: Date): string {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function kindLabel(c: Contract, state: GameState): string {
  if (c.kind === 'challenge') return c.interest ? `GM CHALLENGE · ${c.interest.toUpperCase()}` : 'GM CHALLENGE';
  if (c.kind === 'interest' && c.interest) return c.interest.toUpperCase();
  if (c.kind === 'class') {
    const cls = state.character?.classId;
    return cls ? CLASSES[cls].name.toUpperCase() : 'CRAFT';
  }
  return 'DAILY';
}

export function DailyContracts({ state, now, onFocusQuest }: { state: GameState; now: Date; onFocusQuest: (id: string) => void }) {
  const today = toLocalDate(now);
  const board = state.dailies[today];
  const earned = board ? board.contracts.filter((c) => board.completed.includes(c.id)).reduce((s, c) => s + c.xp, 0) : 0;
  const swept = !!board && board.contracts.length > 0 && board.completed.length === board.contracts.length;

  return (
    <Frame
      className={`contracts ${swept ? 'is-swept' : ''}`}
      label="DAILY CONTRACTS"
      index="02"
      id="daily-contracts"
      actions={
        <span className="contracts__meta mono">
          <span className="gold">{earned}</span>
          <span className="dim">/{board?.budget ?? '—'} XP</span>
          <span className="contracts__clock dim" title="New contracts at midnight">
            ⟳ {untilMidnight(now)}
          </span>
        </span>
      }
    >
      {!board ? (
        <p className="contracts__posting mono dim">POSTING TODAY’S BOARD…</p>
      ) : (
        <>
          <div className="contracts__bar" aria-hidden>
            {board.contracts.map((c) => (
              <span key={c.id} style={{ flexGrow: c.xp }} className={board.completed.includes(c.id) ? 'is-done' : ''} />
            ))}
          </div>
          <ul className="contracts__list">
            {board.contracts.map((c) => (
              <ContractRow
                key={c.id}
                contract={c}
                done={board.completed.includes(c.id)}
                label={kindLabel(c, state)}
                questOpen={!!c.questId && state.quests[c.questId]?.status === 'active'}
                onFocusQuest={onFocusQuest}
              />
            ))}
          </ul>
          <p className="contracts__foot mono">
            {swept ? (
              <span className="gold">◆ BOARD CLEARED. EVERYTHING ELSE TODAY IS BONUS.</span>
            ) : (
              <>
                <Glyph name="lock" size={10} /> ISSUED BY THE SYSTEM · CAN’T BE EDITED · NO PENALTY FOR MISSING
              </>
            )}
          </p>
        </>
      )}
    </Frame>
  );
}

function ContractRow({
  contract: c,
  done,
  label,
  questOpen,
  onFocusQuest,
}: {
  contract: Contract;
  done: boolean;
  label: string;
  questOpen: boolean;
  onFocusQuest: (id: string) => void;
}) {
  const { act } = useCelebration();
  const socket = useRef<HTMLButtonElement>(null);
  return (
    <li className={`contract contract--${c.kind} ${done ? 'is-done' : ''}`} style={{ '--accent': `var(--attr-${c.attribute})` } as React.CSSProperties}>
      {done ? (
        <span className="socket is-done" aria-label="Fulfilled">
          <Glyph name="check" size={16} />
        </span>
      ) : (
        <button
          ref={socket}
          className="socket"
          aria-label={`Fulfil contract: ${c.title}`}
          onClick={() => act({ type: 'completeContract', contractId: c.id }, { origin: socket.current })}
        >
          <Glyph name="check" size={16} />
        </button>
      )}
      <div className="contract__main">
        <div className="contract__kind mono">
          <span className="contract__tag">{label}</span>
          <span className="contract__attr" title={ATTRIBUTE_INFO[c.attribute].name}>
            <AttributeIcon attribute={c.attribute} size={11} /> {c.attribute}
          </span>
        </div>
        <div className="contract__title">{c.title}</div>
        {c.detail && <div className="contract__detail">{c.detail}</div>}
        {c.questId && questOpen && !done && (
          <button className="contract__goto mono" onClick={() => onFocusQuest(c.questId!)}>
            SHOW THE QUEST →
          </button>
        )}
      </div>
      <div className="contract__xp mono">
        +{c.xp}
        <small>XP</small>
      </div>
    </li>
  );
}
