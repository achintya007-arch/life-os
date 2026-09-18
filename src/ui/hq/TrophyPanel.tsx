import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../../engine/achievements';
import type { GameState } from '../../engine/types';
import { Frame } from '../components/Frame';
import { Glyph } from '../components/Icon';

export function TrophyPanel({ state, onOpenVault }: { state: GameState; onOpenVault: () => void }) {
  const unlocked = Object.values(state.achievements).sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
  const visibleTotal = ACHIEVEMENTS.filter((a) => !a.hidden).length;
  const secretsFound = unlocked.filter((u) => ACHIEVEMENT_BY_ID.get(u.achievementId)?.hidden).length;

  return (
    <Frame
      className="trophies"
      label="ACHIEVEMENTS"
      index="05"
      actions={
        <button className="link mono" onClick={onOpenVault}>
          VAULT →
        </button>
      }
    >
      <div className="trophies__count mono">
        <strong>{unlocked.length - secretsFound}</strong>
        <span className="dim">/{visibleTotal}</span>
        <span className="trophies__secrets">
          + {secretsFound} SECRET{secretsFound === 1 ? '' : 'S'} FOUND
        </span>
      </div>
      {unlocked.length === 0 ? (
        <p className="trophies__empty">Nothing yet. Some achievements are listed in the vault. Others must be stumbled into.</p>
      ) : (
        <ul className="trophies__list">
          {unlocked.slice(0, 4).map((u) => {
            const a = ACHIEVEMENT_BY_ID.get(u.achievementId);
            if (!a) return null;
            return (
              <li key={a.id} className={`trophy rarity--${a.rarity}`}>
                <span className="trophy__medal">
                  <Glyph name="signal" size={14} />
                </span>
                <span className="trophy__text">
                  <span className="trophy__name">{a.name}</span>
                  <span className="trophy__desc">{a.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}
