import { useEffect, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { LIMITS } from '../../engine/constants';
import { useCelebration } from '../celebration/Celebration';
import { submitOnEnter } from '../components/submitOnEnter';

const BOOT: [string, string][] = [
  ['mounting reality', 'ok'],
  ['calibrating attributes', 'ok'],
  ['loading character file', 'not found'],
  ['scanning for excuses', 'none detected'],
  ['preparing adventure', 'ready'],
];

export function Genesis({ onSignIn }: { onSignIn?: () => void }) {
  const { act } = useCelebration();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [igniting, setIgniting] = useState(false);
  const ready = step >= BOOT.length;

  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : 260);
    return () => window.clearTimeout(t);
  }, [step, ready]);

  const begin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || igniting) return;
    setIgniting(true);
    sfx.play('levelUp');
    window.setTimeout(() => act({ type: 'createCharacter', name }, { silent: true }), 900);
  };

  return (
    <main className={`genesis ${igniting ? 'is-igniting' : ''}`}>
      <div className="genesis__inner">
        <div className="genesis__logo">
          <span className="logo-mark" aria-hidden />
          LIFE<span className="logo-slash">//</span>OS
        </div>

        <ol className="genesis__boot mono" aria-hidden>
          {BOOT.slice(0, step).map(([task, result]) => (
            <li key={task}>
              <span className="dim">&gt;</span> {task}
              <span className="genesis__dots" />
              <span className={result === 'not found' ? 'genesis__warn' : 'genesis__ok'}>{result}</span>
            </li>
          ))}
        </ol>

        {ready && (
          <form className="genesis__form" onSubmit={begin} onKeyDown={submitOnEnter}>
            <div className="genesis__kicker mono">NEW CHARACTER</div>
            <h1 className="genesis__headline">
              Your life is the game.
              <br />
              <span className="genesis__accent">You are the main character.</span>
            </h1>
            <p className="genesis__copy">
              Real quests. Real XP. No streaks to lose, no guilt, no spreadsheets. Just a character that grows every time
              you do something that matters to you.
            </p>
            <label className="genesis__label mono" htmlFor="genesis-name">
              WHAT SHOULD THE CHRONICLE CALL YOU?
            </label>
            <div className="genesis__input-row">
              <input
                id="genesis-name"
                className="genesis__input"
                value={name}
                maxLength={LIMITS.nameMax}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name, alias, or legend"
                autoComplete="off"
                autoFocus
                spellCheck={false}
              />
              <button className="btn btn--gold btn--lg" disabled={!name.trim() || igniting}>
                BEGIN
              </button>
            </div>
            <p className="genesis__privacy mono">
              <span className="dim">◇</span> Plays instantly as a guest. Your save stays on this device unless you choose to sync it.
            </p>
            {onSignIn && (
              <button type="button" className="genesis__signin mono" onClick={onSignIn}>
                ALREADY PLAYING ON ANOTHER DEVICE? <span className="gold">SIGN IN →</span>
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
