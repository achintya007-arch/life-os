import { ACHIEVEMENTS, type Rarity } from '../../engine/achievements';
import { TITLES, displayTitle, isTitleUnlocked } from '../../engine/titles';
import type { GameState } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { Frame } from '../components/Frame';
import { Glyph } from '../components/Icon';

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function Vault({ state }: { state: GameState }) {
  const { act } = useCelebration();
  const current = displayTitle(state);
  const unlockedCount = Object.keys(state.achievements).length;
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const ua = state.achievements[a.id] ? 0 : 1;
    const ub = state.achievements[b.id] ? 0 : 1;
    return ua - ub || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  });

  return (
    <main className="view vault">
      <header className="view__header">
        <div className="view__kicker mono">THE VAULT</div>
        <h1 className="view__title">Achievements & Titles</h1>
        <p className="view__sub">
          {unlockedCount} of {ACHIEVEMENTS.length} discovered. Some are written on the wall. Others you have to trip over in
          the dark.
        </p>
      </header>

      <div className="medals">
        {sorted.map((a) => {
          const unlock = state.achievements[a.id];
          const secret = a.hidden && !unlock;
          return (
            <article key={a.id} className={`medal-card rarity--${a.rarity} ${unlock ? 'is-unlocked' : 'is-locked'} ${secret ? 'is-secret' : ''}`}>
              <div className="medal">
                {unlock ? <Glyph name="signal" size={26} /> : secret ? <span className="mono">?</span> : <Glyph name="lock" size={18} />}
              </div>
              <div className="medal-card__body">
                <div className="medal-card__rarity mono">
                  {a.rarity.toUpperCase()}
                  {a.hidden && ' · SECRET'}
                </div>
                <h3 className="medal-card__name">{secret ? 'CLASSIFIED' : a.name}</h3>
                <p className="medal-card__desc">{secret ? `“${a.hint}”` : a.description}</p>
                {unlock && (
                  <div className="medal-card__date mono">
                    UNLOCKED {new Date(unlock.unlockedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Frame className="titles" label="TITLES" index="T">
        <p className="titles__intro">Your title is how the world introduces you. Wear the one you've earned — or the one you like.</p>
        <ul className="titles__list">
          {TITLES.map((t) => {
            const unlocked = isTitleUnlocked(state, t);
            const equipped = current.id === t.id;
            const source = t.source.kind === 'level' ? `LEVEL ${t.source.level}` : 'ACHIEVEMENT';
            return (
              <li key={t.id}>
                <button
                  className={`title-chip ${equipped ? 'is-equipped' : ''} ${unlocked ? '' : 'is-locked'}`}
                  disabled={!unlocked || equipped}
                  onClick={() => act({ type: 'equipTitle', titleId: t.id })}
                  title={unlocked ? (equipped ? 'Equipped' : 'Equip this title') : `Locked · ${source}`}
                >
                  <span className="title-chip__name">{unlocked ? t.name : '— — —'}</span>
                  <span className="title-chip__source mono">{equipped ? 'EQUIPPED' : source}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Frame>
    </main>
  );
}
