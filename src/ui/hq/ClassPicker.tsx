import { useState } from 'react';
import { CLASSES, CLASS_BONUS, CLASS_IDS, type ClassId } from '../../engine/classes';
import { ATTRIBUTE_INFO } from '../../engine/constants';
import { useGameState } from '../../store/GameContext';
import { useCelebration } from '../celebration/Celebration';
import { AttributeIcon, ClassIcon } from '../components/Icon';
import { Modal } from '../components/Modal';

const pct = (r: number) => `+${Math.round(r * 100)}%`;

/** The six paths, as cards. Used at character creation and in-game. */
export function ClassGrid({ selected, onSelect }: { selected: ClassId | null; onSelect: (id: ClassId) => void }) {
  return (
    <div className="class-grid" role="radiogroup" aria-label="Class">
      {CLASS_IDS.map((id) => {
        const c = CLASSES[id];
        const accent = c.primary ? `var(--attr-${c.primary})` : 'var(--gold)';
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected === id}
            className={`class-card ${selected === id ? 'is-selected' : ''}`}
            style={{ '--accent': accent } as React.CSSProperties}
            onClick={() => onSelect(id)}
          >
            <span className="class-card__sigil">
              <ClassIcon classId={id} size={26} />
            </span>
            <span className="class-card__name">{c.name}</span>
            <span className="class-card__tagline">{c.tagline}</span>
            <span className="class-card__bonus mono">
              {c.primary && c.secondary ? (
                <>
                  <span style={{ color: `var(--attr-${c.primary})` }}>
                    <AttributeIcon attribute={c.primary} size={11} /> {pct(CLASS_BONUS.primary)} {c.primary}
                  </span>
                  <span style={{ color: `var(--attr-${c.secondary})` }}>
                    <AttributeIcon attribute={c.secondary} size={11} /> {pct(CLASS_BONUS.secondary)} {c.secondary}
                  </span>
                </>
              ) : (
                <span className="gold">{pct(CLASS_BONUS.wanderer)} EVERYTHING</span>
              )}
            </span>
            <span className="class-card__plays">{c.plays}</span>
          </button>
        );
      })}
    </div>
  );
}

export function classSummary(id: ClassId): string {
  const c = CLASSES[id];
  if (!c.primary || !c.secondary) return `${c.lore} ${pct(CLASS_BONUS.wanderer)} XP on every quest you complete.`;
  return `${c.lore} ${pct(CLASS_BONUS.primary)} XP on ${ATTRIBUTE_INFO[c.primary].name} quests, ${pct(CLASS_BONUS.secondary)} on ${ATTRIBUTE_INFO[c.secondary].name}.`;
}

/** Choose (or change) class from inside the game. */
export function ClassModal({ onClose }: { onClose: () => void }) {
  const state = useGameState();
  const { act, notify } = useCelebration();
  const current = state.character?.classId ?? null;
  const [selected, setSelected] = useState<ClassId | null>(current);

  const confirm = () => {
    if (!selected || selected === current) return onClose();
    const r = act({ type: 'chooseClass', classId: selected });
    if (r.ok) {
      notify(current ? `You now walk the path of the ${CLASSES[selected].name}. New bonuses apply from your next quest.` : `The ${CLASSES[selected].name}. A fine choice.`);
      onClose();
    }
  };

  return (
    <Modal title={current ? 'Change Your Path' : 'Choose Your Class'} kicker="CHARACTER · CLASS" onClose={onClose} wide>
      <div className="class-modal">
        <p className="link-flow__copy">
          Your class shapes which attributes grow fastest and flavors your daily contracts. It never locks you out of anything, and you can
          change it any time — past XP stays exactly as earned.
        </p>
        <ClassGrid selected={selected} onSelect={setSelected} />
        {selected && <p className="class-modal__summary">{classSummary(selected)}</p>}
        <footer className="composer__footer">
          <span className="mono dim">{current ? `CURRENT: ${CLASSES[current].name.toUpperCase()}` : 'NO CLASS YET'}</span>
          <button className="btn btn--gold btn--lg" disabled={!selected || selected === current} onClick={confirm}>
            {selected ? `BECOME ${CLASSES[selected].name.toUpperCase()}` : 'PICK A CLASS'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
