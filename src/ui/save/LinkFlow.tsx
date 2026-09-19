/**
 * Binding a character to an account (or signing in on a new device).
 *
 *   email → code → scan cloud → [choose, if both sides have a character]
 *         → upload → verify → bound
 *
 * Every failure path says where the progress is. The guest save is never
 * touched until the cloud provably holds it (see sync/migration.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { useRuntime } from '../../app/RuntimeContext';
import { browserCloud, currentUser, sendSignInCode, signOutCloud, verifySignInCode, type CloudUser } from '../../sync/cloud';
import { executeLink, inspectLink, type LinkChoice, type LinkPlan, type SaveSummary } from '../../sync/migration';
import { Glyph } from '../components/Icon';
import { Modal } from '../components/Modal';
import { submitOnEnter } from '../components/submitOnEnter';

type Step =
  | { id: 'email' }
  | { id: 'continue'; user: CloudUser }
  | { id: 'code' }
  | { id: 'scanning' }
  | { id: 'choose'; plan: Extract<LinkPlan, { kind: 'choose' }> }
  | { id: 'working'; label: string }
  | { id: 'done'; name: string | null; uploaded: number; keptBackup: boolean; loaded?: boolean }
  | { id: 'error'; message: string; retry: 'email' | 'scan' };

export type LinkFlowMode = 'link' | 'reauth';

export function LinkFlow({
  onClose,
  mode = 'link',
  resumeFromRedirect = false,
}: {
  onClose: () => void;
  mode?: LinkFlowMode;
  /** The player came back from an emailed sign-in link: skip straight to scanning. */
  resumeFromRedirect?: boolean;
}) {
  const runtime = useRuntime();
  const [step, setStep] = useState<Step>(resumeFromRedirect ? { id: 'scanning' } : { id: 'email' });
  const [email, setEmail] = useState(runtime.mode.kind === 'account' ? runtime.mode.email : '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const user = useRef<CloudUser | null>(null);
  // Captured once: linking swaps the save mid-flow, and the title must not change under the player.
  const [guestName] = useState(() => (runtime.mode.kind === 'guest' ? runtime.store.getState().character?.name ?? null : null));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Already verified earlier (flow closed before linking, or an expired game session with a live
  // auth session)? Offer to continue instead of spending another rate-limited email.
  useEffect(() => {
    if (resumeFromRedirect) return;
    let alive = true;
    void currentUser()
      .then((u) => {
        if (!alive || !u) return;
        if (mode === 'reauth' && runtime.mode.kind === 'account' && u.userId !== runtime.mode.userId) return;
        setStep((s) => (s.id === 'email' ? { id: 'continue', user: u } : s));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [resumeFromRedirect, mode, runtime]);

  // Returning from a magic link: the session is already established by the client.
  useEffect(() => {
    if (!resumeFromRedirect) return;
    void (async () => {
      const u = await currentUser().catch(() => null);
      if (!u) return setStep({ id: 'error', message: 'That sign-in link didn’t work (it may have expired or been opened in another browser). Use the 6-digit code instead.', retry: 'email' });
      user.current = u;
      setEmail(u.email);
      await afterVerified(u);
    })();
  }, []);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || cooldown > 0) return;
    setBusy(true);
    setInlineError(null);
    try {
      await sendSignInCode(email);
      setCooldown(60);
      setStep({ id: 'code' });
      sfx.play('accept');
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Could not send the code.');
      sfx.play('error');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setInlineError(null);
    try {
      const u = await verifySignInCode(email, code);
      user.current = u;
      await afterVerified(u);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'That code didn’t work.');
      sfx.play('error');
    } finally {
      setBusy(false);
    }
  };

  async function afterVerified(u: CloudUser) {
    if (mode === 'reauth') {
      setStep({ id: 'working', label: 'RECONNECTING…' });
      try {
        await runtime.resume(u);
        sfx.play('achievement');
        setStep({ id: 'done', name: runtime.store.getState().character?.name ?? null, uploaded: 0, keptBackup: false });
      } catch (err) {
        setStep({ id: 'error', message: err instanceof Error ? err.message : 'Could not reconnect.', retry: 'email' });
      }
      return;
    }
    await scan(u);
  }

  async function scan(u: CloudUser) {
    setStep({ id: 'scanning' });
    try {
      const transport = await browserCloud.transport();
      const guestEvents = runtime.mode.kind === 'guest' ? [...runtime.store.getEvents()] : [];
      const plan = await inspectLink(guestEvents, transport);
      if (plan.kind === 'choose') return setStep({ id: 'choose', plan });
      await link(u, plan, plan.kind === 'upload' ? 'upload' : 'adopt');
    } catch (err) {
      setStep({ id: 'error', message: friendly(err), retry: 'scan' });
    }
  }

  async function link(u: CloudUser, plan: LinkPlan, choice: LinkChoice) {
    const guestEvents = runtime.mode.kind === 'guest' ? [...runtime.store.getEvents()] : [];
    setStep({ id: 'working', label: choice === 'upload' || choice === 'merge' ? `TRANSMITTING ${guestEvents.length} EVENTS…` : 'LOADING YOUR CHARACTER…' });
    try {
      const transport = await browserCloud.transport();
      const result = await executeLink({ storage: runtime.storage, transport, userId: u.userId, email: u.email, deviceId: runtime.deviceId, guestEvents, plan, choice });
      runtime.enterAccount(u);
      sfx.play('levelUp');
      setStep({ id: 'done', name: runtime.store.getState().character?.name ?? null, uploaded: result.uploaded, keptBackup: result.keptBackupId !== null, loaded: choice === 'adopt' });
    } catch (err) {
      setStep({ id: 'error', message: friendly(err), retry: 'scan' });
    }
  }

  const title =
    mode === 'reauth' ? 'Sign In Again' : guestName ? `Bind ${guestName} to an Account` : 'Continue Your Character';

  return (
    <Modal title={title} kicker={mode === 'reauth' ? 'CLOUD SAVE · SESSION' : 'CLOUD SAVE'} onClose={onClose}>
      <div className="link-flow">
        {step.id === 'email' && (
          <form className="link-flow__form" onSubmit={sendCode} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              {mode === 'reauth'
                ? 'Your session ended. Your progress is safe on this device — sign in to resume syncing.'
                : guestName
                  ? 'One character, every device. Your progress keeps working offline and syncs whenever you’re connected.'
                  : 'Sign in to load your character on this device. New here? The same step creates your account.'}
            </p>
            <label className="field">
              <span className="field__label mono">EMAIL</span>
              <input
                className="field__input field__input--big"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-autofocus
                required
              />
            </label>
            {inlineError && <div className="composer__error mono">{inlineError}</div>}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || !/.+@.+\..+/.test(email)}>
                {busy ? 'SENDING…' : 'SEND SIGN-IN CODE'}
              </button>
            </div>
            <p className="link-flow__fine mono">No password. We email you a one-time code. Your save data is private to your account.</p>
          </form>
        )}

        {step.id === 'continue' && (
          <div className="link-flow__form">
            <p className="link-flow__copy">
              You’re already verified as <strong>{step.user.email}</strong>.
            </p>
            <div className="link-flow__actions">
              <button
                className="btn btn--gold btn--lg"
                data-autofocus
                onClick={() => {
                  user.current = step.user;
                  setEmail(step.user.email);
                  void afterVerified(step.user);
                }}
              >
                CONTINUE AS {step.user.email.split('@')[0]!.toUpperCase()}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  void signOutCloud().catch(() => undefined);
                  setEmail('');
                  setStep({ id: 'email' });
                }}
              >
                USE A DIFFERENT EMAIL
              </button>
            </div>
          </div>
        )}

        {step.id === 'code' && (
          <form className="link-flow__form" onSubmit={verify} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              A code is on its way to <strong>{email}</strong>. Enter it below — or just tap the link in the email on this device.
            </p>
            <label className="field">
              <span className="field__label mono">SIGN-IN CODE</span>
              <input
                className="field__input field__input--big link-flow__code mono"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                data-autofocus
              />
            </label>
            {inlineError && <div className="composer__error mono">{inlineError}</div>}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || code.length < 6}>
                {busy ? 'VERIFYING…' : 'VERIFY'}
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
                {cooldown > 0 ? `RESEND IN ${cooldown}s` : 'RESEND CODE'}
              </button>
              <button type="button" className="link mono" onClick={() => setStep({ id: 'email' })}>
                CHANGE EMAIL
              </button>
            </div>
          </form>
        )}

        {step.id === 'scanning' && <Working label="SCANNING THE CLOUD…" />}
        {step.id === 'working' && <Working label={step.label} />}

        {step.id === 'choose' && (
          <ChooseCharacter
            plan={step.plan}
            onChoose={(choice) => user.current && void link(user.current, step.plan, choice)}
          />
        )}

        {step.id === 'done' && (
          <div className="link-flow__done">
            <div className="link-flow__seal" aria-hidden>
              <Glyph name="signal" size={34} />
            </div>
            <div className="link-flow__done-kicker mono">
              <span className="sync-dot" /> SYNCED
            </div>
            <h3 className="link-flow__done-title">
              {mode === 'reauth'
                ? 'Back in sync.'
                : step.loaded && step.name
                  ? `${step.name} is here.`
                  : step.name
                    ? `${step.name} is bound to your account.`
                    : 'Your account is ready.'}
            </h3>
            <p className="link-flow__copy">
              {mode === 'reauth'
                ? 'Everything you did while signed out is on its way to the cloud.'
                : step.loaded
                  ? 'Loaded from your account, exactly where you left off. Everything you do here syncs to your other devices.'
                  : 'Same character on every device. Sign in with this email on your phone or laptop and pick up exactly where you left off.'}
              {step.keptBackup && ' Your previous guest save was kept as a backup on this device (System → Backups).'}
            </p>
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" onClick={onClose} data-autofocus>
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {step.id === 'error' && (
          <div className="link-flow__form">
            <div className="composer__error mono">{step.message}</div>
            <p className="link-flow__copy">
              {runtime.mode.kind === 'guest' && guestName ? `${guestName}'s progress is safe on this device. ` : ''}
              Nothing was lost.
            </p>
            <div className="link-flow__actions">
              <button
                className="btn btn--gold"
                onClick={() => (step.retry === 'scan' && user.current ? void scan(user.current) : setStep({ id: 'email' }))}
              >
                TRY AGAIN
              </button>
              <button className="btn btn--ghost" onClick={onClose}>
                NOT NOW
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Working({ label }: { label: string }) {
  return (
    <div className="link-flow__working" role="status">
      <span className="link-flow__spinner" aria-hidden />
      <span className="mono">{label}</span>
    </div>
  );
}

function ChooseCharacter({
  plan,
  onChoose,
}: {
  plan: Extract<LinkPlan, { kind: 'choose' }>;
  onChoose: (choice: LinkChoice) => void;
}) {
  return (
    <div className="link-flow__form">
      <p className="link-flow__copy">This account already has a character. Two legends, one account — you decide how their stories combine.</p>
      <div className="save-compare">
        <SaveCard kicker="IN YOUR ACCOUNT" summary={plan.account} />
        <SaveCard kicker="ON THIS DEVICE (GUEST)" summary={plan.guest} />
      </div>
      <div className="choice-list">
        <button className="choice" onClick={() => onChoose('merge')}>
          <span className="choice__title">Merge guest progress into {plan.account.name}</span>
          <span className="choice__desc">
            {plan.guest.name}'s quests, deeds and XP join {plan.account.name}. The account keeps its name and title.
          </span>
        </button>
        <button className="choice" onClick={() => onChoose('keep-account')}>
          <span className="choice__title">Keep {plan.account.name} only</span>
          <span className="choice__desc">
            Nothing is uploaded. {plan.guest.name}'s save stays on this device as a backup you can export or restore later.
          </span>
        </button>
      </div>
    </div>
  );
}

function SaveCard({ kicker, summary }: { kicker: string; summary: SaveSummary }) {
  return (
    <div className="save-card">
      <div className="save-card__kicker mono">{kicker}</div>
      <div className="save-card__name">{summary.name ?? 'Unnamed'}</div>
      <div className="save-card__stats mono">
        LV {summary.level} · {summary.totalXp.toLocaleString()} XP · {summary.deeds} {summary.deeds === 1 ? 'DEED' : 'DEEDS'}
      </div>
    </div>
  );
}

function friendly(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong talking to the cloud.';
}
