/**
 * What the player loves doing — picked from the catalog or typed in their own
 * words — plus how experienced they are at each. Used at character creation
 * and from the character sheet.
 */
import { useMemo, useState } from 'react';
import { LIMITS } from '../../engine/constants';
import { INTEREST_CATALOG, RANK_NAMES, type InterestRank } from '../../engine/interestCatalog';
import {
  declaredInterests,
  guessAttribute,
  inferredInterests,
  interestLevelKey,
  matchInterest,
  toNextRank,
  type ResolvedInterest,
} from '../../engine/interests';
import { useGameState } from '../../store/GameContext';
import { useCelebration } from '../celebration/Celebration';
import { AttributeIcon, Glyph } from '../components/Icon';
import { Modal } from '../components/Modal';

export interface InterestDraft {
  interests: string[];
  levels: Record<string, InterestRank>;
}

const LEVELS: [InterestRank, string][] = [
  [1, 'NEW TO IT'],
  [2, 'SOME'],
  [3, 'SEASONED'],
];

/** The catalog id (or null) that a piece of player text resolves to. */
const idOf = (text: string) => matchInterest(text)?.id ?? null;

export function InterestPicker({
  value,
  onChange,
  resolved,
}: {
  value: InterestDraft;
  onChange: (next: InterestDraft) => void;
  /** In-game: resolved interests, to show earned rank. */
  resolved?: ResolvedInterest[];
}) {
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const full = value.interests.length >= LIMITS.interestsMax;
  const selectedIds = new Set(value.interests.map(idOf).filter(Boolean));

  const add = (text: string) => {
    const clean = text.trim().slice(0, LIMITS.interestLengthMax);
    if (!clean) return;
    const def = matchInterest(clean);
    const exists = value.interests.some((i) => (def ? idOf(i) === def.id : interestLevelKey(i) === interestLevelKey(clean)));
    if (exists) return setNote(`${def?.name ?? clean} is already on your list.`);
    if (full) return setNote(`Up to ${LIMITS.interestsMax} interests — remove one first.`);
    setNote(def && normalize(def.name) !== normalize(clean) ? `Got it — that’s ${def.name}.` : null);
    onChange({ ...value, interests: [...value.interests, def ? def.name : clean] });
  };

  const remove = (text: string) => {
    const levels = { ...value.levels };
    delete levels[interestLevelKey(text)];
    onChange({ interests: value.interests.filter((i) => i !== text), levels });
  };

  const toggle = (name: string, id: string) => {
    const existing = value.interests.find((i) => idOf(i) === id);
    if (existing) remove(existing);
    else add(name);
  };

  const setLevel = (text: string, level: InterestRank) =>
    onChange({ ...value, levels: { ...value.levels, [interestLevelKey(text)]: level } });

  return (
    <div className="interest-picker">
      <div className="interest-cloud" role="group" aria-label="Interests">
        {INTEREST_CATALOG.map((d) => {
          const on = selectedIds.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={`interest-tag ${on ? 'is-on' : ''}`}
              style={{ '--accent': `var(--attr-${d.attribute})` } as React.CSSProperties}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(d.name, d.id)}
            >
              {on ? <Glyph name="check" size={11} /> : <AttributeIcon attribute={d.attribute} size={11} />} {d.name}
            </button>
          );
        })}
      </div>

      <form
        className="interest-custom"
        onSubmit={(e) => {
          e.preventDefault();
          add(custom);
          setCustom('');
        }}
      >
        <input
          className="field__input"
          value={custom}
          maxLength={LIMITS.interestLengthMax}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Something else? Pottery, skating, astronomy…"
          aria-label="Add your own interest"
        />
        <button className="btn btn--ghost" disabled={!custom.trim() || full}>
          <Glyph name="plus" size={12} /> ADD
        </button>
      </form>
      {note && <p className="interest-note mono">{note}</p>}

      {value.interests.length > 0 && (
        <ul className="interest-list">
          {value.interests.map((text) => {
            const def = matchInterest(text);
            const attr = def?.attribute ?? guessAttribute(text);
            const level = value.levels[interestLevelKey(text)] ?? 1;
            const r = resolved?.find((x) => x.id === (def ? def.id : undefined) || (!def && x.name === text));
            const next = r ? toNextRank(r) : null;
            return (
              <li key={text} className="interest-row" style={{ '--accent': `var(--attr-${attr})` } as React.CSSProperties}>
                <div className="interest-row__head">
                  <span className="interest-row__name">
                    <AttributeIcon attribute={attr} size={13} /> {def?.name ?? text}
                    {!def && <span className="interest-row__custom mono">CUSTOM</span>}
                  </span>
                  <button type="button" className="interest-row__remove" onClick={() => remove(text)} aria-label={`Remove ${def?.name ?? text}`}>
                    <Glyph name="close" size={12} />
                  </button>
                </div>
                <div className="interest-level" role="radiogroup" aria-label={`Experience with ${def?.name ?? text}`}>
                  {LEVELS.map(([n, label]) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={level === n}
                      className={`interest-level__opt mono ${level === n ? 'is-selected' : ''}`}
                      onClick={() => setLevel(text, n)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {r && (
                  <div className="interest-row__rank mono">
                    <span className="gold">{RANK_NAMES[r.rank].toUpperCase()}</span>
                    <span className="dim">
                      {' '}
                      · {r.experience} {r.experience === 1 ? 'DEED' : 'DEEDS'}
                      {next !== null ? ` · ${next} TO ${RANK_NAMES[(r.rank + 1) as InterestRank].toUpperCase()}` : ' · MAX RANK'}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Edit interests in-game, and confirm or dismiss the ones the GM has noticed. */
export function InterestsModal({ onClose }: { onClose: () => void }) {
  const state = useGameState();
  const { act, notify } = useCelebration();
  const [draft, setDraft] = useState<InterestDraft>(() => ({
    interests: [...state.interests],
    levels: Object.fromEntries(
      state.interests.map((i) => [interestLevelKey(i), (state.interestLevels[interestLevelKey(i)] ?? 1) as InterestRank]),
    ),
  }));
  const [dismissed, setDismissed] = useState<string[]>(state.dismissedInterests);
  const [error, setError] = useState<string | null>(null);

  const resolved = useMemo(() => declaredInterests(state), [state]);
  const draftIds = new Set(draft.interests.map(idOf));
  const noticed = inferredInterests(state).filter((i) => !draftIds.has(i.id) && !dismissed.includes(i.id));

  const save = () => {
    const r = act({ type: 'setInterests', interests: draft.interests, levels: draft.levels, dismissed });
    if (!r.ok) return setError(r.error);
    notify(
      draft.interests.length
        ? 'Noted. Your contracts will follow your interests from tomorrow’s board.'
        : 'Interests cleared. The board goes back to your class.',
    );
    onClose();
  };

  return (
    <Modal title="What You Love Doing" kicker="CHARACTER · INTERESTS" onClose={onClose} wide>
      <div className="interests-modal">
        <p className="link-flow__copy">
          The Game Master builds your daily contracts around these — a guitarist gets guitar, a cuber gets cubing. Tasks get harder as your
          rank in each interest grows.
        </p>

        {noticed.length > 0 && (
          <section className="interest-noticed">
            <div className="field__label mono">NOTICED IN YOUR QUEST LOG</div>
            {noticed.map((i) => (
              <div key={i.id} className="interest-noticed__row" style={{ '--accent': `var(--attr-${i.attribute})` } as React.CSSProperties}>
                <span className="interest-noticed__name">
                  <AttributeIcon attribute={i.attribute} size={13} /> {i.name}
                  <span className="dim mono"> · {i.experience} {i.experience === 1 ? 'DEED' : 'DEEDS'}</span>
                </span>
                <span className="interest-noticed__actions">
                  <button
                    className="btn btn--small"
                    disabled={draft.interests.length >= LIMITS.interestsMax}
                    onClick={() => setDraft({ ...draft, interests: [...draft.interests, i.name] })}
                  >
                    <Glyph name="plus" size={11} /> ADD
                  </button>
                  <button className="btn btn--ghost btn--small" onClick={() => setDismissed([...dismissed, i.id])}>
                    NOT ME
                  </button>
                </span>
              </div>
            ))}
          </section>
        )}

        <InterestPicker value={draft} onChange={setDraft} resolved={resolved} />

        {error && <div className="composer__error mono">{error}</div>}
        <footer className="composer__footer">
          <span className="mono dim">
            {draft.interests.length}/{LIMITS.interestsMax} INTERESTS
          </span>
          <button className="btn btn--gold btn--lg" onClick={save}>
            SAVE
          </button>
        </footer>
      </div>
    </Modal>
  );
}
