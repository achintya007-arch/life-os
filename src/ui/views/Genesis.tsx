import { useEffect, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { CLASSES, type ClassId } from '../../engine/classes';
import { LIMITS } from '../../engine/constants';
import { ClassGrid, classSummary } from '../hq/ClassPicker';
import { InterestPicker, type InterestDraft } from '../hq/InterestPicker';
import { useCelebration } from '../celebration/Celebration';
import { submitOnEnter } from '../components/submitOnEnter';

const BOOT: [string, string][] = [
  ['mounting reality', 'ok'],
  ['calibrating attributes', 'ok'],
  ['loading character file', 'not found'],
  ['scanning for excuses', 'none detected'],
  ['preparing adventure', 'ready'],
];

export function Genesis({
  onSignIn,
  account,
}: {
  onSignIn?: () => void;
  /** Signed in, but this account has no character yet. */
  account?: { email: string; onSignOut: () => void };
}) {
  const { act } = useCelebration();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [igniting, setIgniting] = useState(false);
  const [phase, setPhase] = useState<'name' | 'class' | 'interests'>('name');
  const [classId, setClassId] = useState<ClassId | null>(null);
  const [interests, setInterests] = useState<InterestDraft>({ interests: [], levels: {} });
  const ready = step >= BOOT.length;

  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : 260);
    return () => window.clearTimeout(t);
  }, [step, ready]);

  const toClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    sfx.play('accept');
    setPhase('class');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toInterests = (chosen: ClassId | null) => {
    setClassId(chosen);
    sfx.play('accept');
    setPhase('interests');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const begin = (withInterests: boolean) => {
    if (igniting) return;
    setIgniting(true);
    sfx.play('levelUp');
    window.setTimeout(() => {
      const r = act({ type: 'createCharacter', name }, { silent: true });
      if (!r.ok) return;
      if (classId) act({ type: 'chooseClass', classId }, { silent: true });
      if (withInterests && interests.interests.length)
        act({ type: 'setInterests', interests: interests.interests, levels: interests.levels }, { silent: true });
    }, 900);
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

        {ready && phase === 'class' && (
          <div className="genesis__form genesis__class">
            <div className="genesis__kicker mono">CHOOSE YOUR CLASS</div>
            <h1 className="genesis__headline genesis__headline--small">
              How does <span className="genesis__accent">{name.trim()}</span> grow?
            </h1>
            <p className="genesis__copy">
              Your class boosts the attributes you care about most and shapes your daily contracts. It never locks you out of anything — you
              can change it later.
            </p>
            <ClassGrid selected={classId} onSelect={setClassId} />
            {classId && <p className="genesis__copy genesis__class-summary">{classSummary(classId)}</p>}
            <div className="genesis__input-row genesis__class-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setPhase('name')} disabled={igniting}>
                BACK
              </button>
              <button type="button" className="btn btn--gold btn--lg" disabled={!classId || igniting} onClick={() => toInterests(classId)}>
                {classId ? `CONTINUE AS ${CLASSES[classId].name.toUpperCase()}` : 'PICK A CLASS'}
              </button>
            </div>
            <button type="button" className="genesis__signin mono" onClick={() => toInterests(null)} disabled={igniting}>
              CAN’T DECIDE? <span className="gold">CONTINUE WITHOUT A CLASS →</span>
            </button>
          </div>
        )}

        {ready && phase === 'interests' && (
          <div className="genesis__form genesis__class">
            <div className="genesis__kicker mono">YOUR INTERESTS</div>
            <h1 className="genesis__headline genesis__headline--small">
              What does <span className="genesis__accent">{name.trim()}</span> love doing?
            </h1>
            <p className="genesis__copy">
              Pick a few, or type your own. Your daily contracts are built around them: play guitar and you’ll get guitar challenges;
              solve cubes and you’ll get cubing ones. Tell us how experienced you are so the first ones fit.
            </p>
            <InterestPicker value={interests} onChange={setInterests} />
            <div className="genesis__input-row genesis__class-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setPhase('class')} disabled={igniting}>
                BACK
              </button>
              <button
                type="button"
                className="btn btn--gold btn--lg"
                disabled={!interests.interests.length || igniting}
                onClick={() => begin(true)}
              >
                {interests.interests.length ? 'BEGIN' : 'PICK AT LEAST ONE'}
              </button>
            </div>
            <button type="button" className="genesis__signin mono" onClick={() => begin(false)} disabled={igniting}>
              NOTHING COMES TO MIND? <span className="gold">SKIP FOR NOW →</span>
            </button>
          </div>
        )}

        {ready && phase === 'name' && (
          <form className="genesis__form" onSubmit={toClass} onKeyDown={submitOnEnter}>
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
                NEXT
              </button>
            </div>
            {account ? (
              <>
                <p className="genesis__privacy mono">
                  <span className="sync-dot" /> Signed in as {account.email}. This character will sync to all your devices.
                </p>
                <button type="button" className="genesis__signin mono" onClick={account.onSignOut}>
                  NOT YOU? <span className="gold">SIGN OUT →</span>
                </button>
              </>
            ) : (
              <>
                <p className="genesis__privacy mono">
                  <span className="dim">◇</span> Plays instantly as a guest. Your save stays on this device unless you choose to sync it.
                </p>
                {onSignIn && (
                  <button type="button" className="genesis__signin mono" onClick={onSignIn}>
                    ALREADY PLAYING ON ANOTHER DEVICE? <span className="gold">SIGN IN →</span>
                  </button>
                )}
              </>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
