/**
 * Signing in, creating an account, and binding a guest character to it.
 *
 *   email + password ──▶ scan cloud ──▶ [choose, if both sides have a character]
 *                    ──▶ upload ──▶ verify ──▶ bound
 *
 * Password sign-in is the main path because it never depends on email
 * delivery (the built-in mailer is heavily rate-limited). Emailed links remain
 * for "forgot password" and for passwordless sign-in.
 *
 * Every failure path says where the progress is. The guest save is never
 * touched until the cloud provably holds it (see sync/migration.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { useRuntime } from '../../app/RuntimeContext';
import {
  MIN_PASSWORD,
  browserCloud,
  completeAuthRedirect,
  currentUser,
  sendPasswordReset,
  sendSignInCode,
  signInWithPassword,
  signOutCloud,
  signUpWithPassword,
  updatePassword,
  verifySignInCode,
  type CloudUser,
} from '../../sync/cloud';
import { executeLink, inspectLink, type LinkChoice, type LinkPlan, type SaveSummary } from '../../sync/migration';
import { Glyph } from '../components/Icon';
import { Modal } from '../components/Modal';
import { submitOnEnter } from '../components/submitOnEnter';

type AuthMode = 'signin' | 'signup';

type Step =
  | { id: 'auth' }
  | { id: 'continue'; user: CloudUser }
  | { id: 'forgot' }
  | { id: 'link-email' }
  | { id: 'email-sent'; purpose: 'reset' | 'link' }
  | { id: 'new-password'; user: CloudUser }
  | { id: 'scanning' }
  | { id: 'choose'; plan: Extract<LinkPlan, { kind: 'choose' }> }
  | { id: 'working'; label: string }
  | { id: 'done'; name: string | null; uploaded: number; keptBackup: boolean; loaded?: boolean }
  | { id: 'error'; message: string; retry: 'auth' | 'scan' };

export type LinkFlowMode = 'link' | 'reauth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_COOLDOWN = 60;

export function LinkFlow({
  onClose,
  mode = 'link',
  resumeFromRedirect = false,
}: {
  onClose: () => void;
  mode?: LinkFlowMode;
  /** The player came back from an emailed link (sign-in or password reset). */
  resumeFromRedirect?: boolean;
}) {
  const runtime = useRuntime();
  // Captured once: linking swaps the save mid-flow, and the title must not change under the player.
  const [guestName] = useState(() => (runtime.mode.kind === 'guest' ? runtime.store.getState().character?.name ?? null : null));
  const [authMode, setAuthMode] = useState<AuthMode>(() => (guestName && mode === 'link' ? 'signup' : 'signin'));
  const [step, setStep] = useState<Step>(resumeFromRedirect ? { id: 'working', label: 'FINISHING SIGN-IN…' } : { id: 'auth' });
  const [email, setEmail] = useState(runtime.mode.kind === 'account' ? runtime.mode.email : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const user = useRef<CloudUser | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  // Already signed in to the cloud (e.g. the flow was closed before linking)? Offer to continue.
  useEffect(() => {
    if (resumeFromRedirect) return;
    let alive = true;
    void currentUser()
      .then((u) => {
        if (!alive || !u) return;
        if (mode === 'reauth' && runtime.mode.kind === 'account' && u.userId !== runtime.mode.userId) return;
        setStep((s) => (s.id === 'auth' ? { id: 'continue', user: u } : s));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [resumeFromRedirect, mode, runtime]);

  // Returning from an emailed link: let the cloud client consume it, then carry on.
  useEffect(() => {
    if (!resumeFromRedirect) return;
    void (async () => {
      const { user: u, error, recovery } = await completeAuthRedirect();
      if (!u) return setStep({ id: 'error', message: error ?? 'That link didn’t work.', retry: 'auth' });
      user.current = u;
      setEmail(u.email);
      if (recovery) return setStep({ id: 'new-password', user: u });
      await afterVerified(u);
    })();
    // Runs once for the redirect that opened the flow.
  }, []);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setInlineError(null);
    try {
      await fn();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Something went wrong.');
      sfx.play('error');
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!EMAIL_RE.test(email.trim())) throw new Error('That doesn’t look like a valid email address.');
      if (authMode === 'signup' && password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`);
      const u = authMode === 'signup' ? await signUpWithPassword(email, password) : await signInWithPassword(email, password);
      user.current = u;
      setPassword('');
      await afterVerified(u);
    });
  };

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!EMAIL_RE.test(email.trim())) throw new Error('That doesn’t look like a valid email address.');
      await sendPasswordReset(email);
      setCooldown(EMAIL_COOLDOWN);
      setStep({ id: 'email-sent', purpose: 'reset' });
      sfx.play('accept');
    });
  };

  const submitLinkEmail = (e?: React.FormEvent) => {
    e?.preventDefault();
    void run(async () => {
      if (!EMAIL_RE.test(email.trim())) throw new Error('That doesn’t look like a valid email address.');
      await sendSignInCode(email);
      setCooldown(EMAIL_COOLDOWN);
      setStep({ id: 'email-sent', purpose: 'link' });
      sfx.play('accept');
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const u = await verifySignInCode(email, code);
      user.current = u;
      await afterVerified(u);
    });
  };

  const submitNewPassword = (e: React.FormEvent, u: CloudUser) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`);
      await updatePassword(password);
      setPassword('');
      sfx.play('accept');
      await afterVerified(u);
    });
  };

  async function afterVerified(u: CloudUser) {
    if (mode === 'reauth') {
      setStep({ id: 'working', label: 'RECONNECTING…' });
      try {
        await runtime.resume(u);
        sfx.play('achievement');
        setStep({ id: 'done', name: runtime.store.getState().character?.name ?? null, uploaded: 0, keptBackup: false });
      } catch (err) {
        setStep({ id: 'error', message: err instanceof Error ? err.message : 'Could not reconnect.', retry: 'auth' });
      }
      return;
    }
    if (runtime.mode.kind === 'account' && runtime.mode.userId !== u.userId) {
      setStep({ id: 'error', message: `This device is signed in as ${runtime.mode.email}. Sign out first to switch accounts.`, retry: 'auth' });
      return;
    }
    if (runtime.mode.kind === 'account') {
      // Already playing this account (e.g. a password reset while signed in): nothing to link.
      setStep({ id: 'done', name: runtime.store.getState().character?.name ?? null, uploaded: 0, keptBackup: false, loaded: true });
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
    setStep({
      id: 'working',
      label: choice === 'upload' || choice === 'merge' ? `TRANSMITTING ${guestEvents.length} EVENTS…` : 'LOADING YOUR CHARACTER…',
    });
    try {
      const transport = await browserCloud.transport();
      const result = await executeLink({ storage: runtime.storage, transport, userId: u.userId, email: u.email, deviceId: runtime.deviceId, guestEvents, plan, choice });
      runtime.enterAccount(u);
      sfx.play('levelUp');
      setStep({
        id: 'done',
        name: runtime.store.getState().character?.name ?? null,
        uploaded: result.uploaded,
        keptBackup: result.keptBackupId !== null,
        loaded: choice === 'adopt',
      });
    } catch (err) {
      setStep({ id: 'error', message: friendly(err), retry: 'scan' });
    }
  }

  const goAuth = () => {
    setInlineError(null);
    setStep({ id: 'auth' });
  };

  const title =
    mode === 'reauth'
      ? 'Sign In Again'
      : step.id === 'new-password'
        ? 'Choose a New Password'
        : guestName
          ? `Bind ${guestName} to an Account`
          : 'Continue Your Character';

  const emailField = (
    <label className="field">
      <span className="field__label mono">EMAIL</span>
      <input
        className="field__input field__input--big"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        data-autofocus
        required
      />
    </label>
  );

  const passwordField = (autoComplete: 'current-password' | 'new-password', label = 'PASSWORD') => (
    <label className="field">
      <span className="field__label mono">
        {label}
        {autoComplete === 'new-password' && <span className="dim"> · at least {MIN_PASSWORD} characters</span>}
      </span>
      <div className="password-row">
        <input
          className="field__input field__input--big"
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={autoComplete === 'new-password' ? 'Make it memorable' : '••••••••'}
          minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined}
          required
        />
        <button type="button" className="password-row__toggle mono" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
          {showPassword ? 'HIDE' : 'SHOW'}
        </button>
      </div>
    </label>
  );

  const error = inlineError && <div className="composer__error mono" role="alert">{inlineError}</div>;

  return (
    <Modal title={title} kicker={mode === 'reauth' ? 'CLOUD SAVE · SESSION' : 'CLOUD SAVE'} onClose={onClose}>
      <div className="link-flow">
        {step.id === 'auth' && (
          <form className="link-flow__form" onSubmit={submitAuth} onKeyDown={submitOnEnter}>
            {mode !== 'reauth' && (
              <div className="segmented link-flow__modes" role="tablist">
                <button type="button" role="tab" aria-selected={authMode === 'signup'} className={authMode === 'signup' ? 'is-selected' : ''} onClick={() => setAuthMode('signup')}>
                  NEW ACCOUNT
                </button>
                <button type="button" role="tab" aria-selected={authMode === 'signin'} className={authMode === 'signin' ? 'is-selected' : ''} onClick={() => setAuthMode('signin')}>
                  I HAVE AN ACCOUNT
                </button>
              </div>
            )}
            <p className="link-flow__copy">
              {mode === 'reauth'
                ? 'Your session ended. Your progress is safe on this device — sign in to resume syncing.'
                : authMode === 'signup'
                  ? guestName
                    ? `${guestName} will follow you to every device. Progress keeps working offline and syncs whenever you’re connected.`
                    : 'One character, every device. Progress keeps working offline and syncs whenever you’re connected.'
                  : 'Sign in with the same email and password you use on your other device.'}
            </p>
            {emailField}
            {passwordField(authMode === 'signup' ? 'new-password' : 'current-password')}
            {error}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || !email.trim() || !password}>
                {busy ? 'ONE MOMENT…' : authMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </button>
              {authMode === 'signin' && (
                <button type="button" className="link mono" onClick={() => setStep({ id: 'forgot' })}>
                  FORGOT PASSWORD?
                </button>
              )}
            </div>
            <p className="link-flow__fine mono">
              No email needed — you’re in instantly.{' '}
              <button type="button" className="link-flow__alt" onClick={() => setStep({ id: 'link-email' })}>
                Prefer a sign-in link by email?
              </button>
            </p>
          </form>
        )}

        {step.id === 'continue' && (
          <div className="link-flow__form">
            <p className="link-flow__copy">
              You’re already signed in as <strong>{step.user.email}</strong>.
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
                  goAuth();
                }}
              >
                USE ANOTHER ACCOUNT
              </button>
            </div>
          </div>
        )}

        {step.id === 'forgot' && (
          <form className="link-flow__form" onSubmit={submitForgot} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              We’ll email you a link to choose a new password. <strong>Open it on this device, in this browser.</strong>
            </p>
            {emailField}
            {error}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || cooldown > 0 || !email.trim()}>
                {busy ? 'SENDING…' : cooldown > 0 ? `WAIT ${cooldown}s` : 'EMAIL ME A RESET LINK'}
              </button>
              <button type="button" className="link mono" onClick={goAuth}>
                BACK
              </button>
            </div>
          </form>
        )}

        {step.id === 'link-email' && (
          <form className="link-flow__form" onSubmit={submitLinkEmail} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              We’ll email you a sign-in link. <strong>Open it on this device, in this browser</strong> — links opened inside a mail app’s own browser can’t reach your game.
            </p>
            {emailField}
            {error}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || cooldown > 0 || !email.trim()}>
                {busy ? 'SENDING…' : cooldown > 0 ? `WAIT ${cooldown}s` : 'EMAIL ME A LINK'}
              </button>
              <button type="button" className="link mono" onClick={goAuth}>
                USE A PASSWORD INSTEAD
              </button>
            </div>
          </form>
        )}

        {step.id === 'email-sent' && (
          <form className="link-flow__form" onSubmit={submitCode} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              Sent to <strong>{email}</strong>. Open the link <strong>on this device, in this browser</strong> (on a phone, choose “Open in Safari/Chrome”
              if your mail app opens its own browser).
            </p>
            {step.purpose === 'link' && (
              <label className="field">
                <span className="field__label mono">
                  GOT A CODE INSTEAD? <span className="dim">· optional</span>
                </span>
                <input
                  className="field__input field__input--big link-flow__code mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                />
              </label>
            )}
            {error}
            <div className="link-flow__actions">
              {step.purpose === 'link' && (
                <button className="btn btn--gold" disabled={busy || code.length < 6}>
                  {busy ? 'VERIFYING…' : 'VERIFY CODE'}
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy || cooldown > 0}
                onClick={() => (step.purpose === 'link' ? submitLinkEmail() : setStep({ id: 'forgot' }))}
              >
                {cooldown > 0 ? `RESEND IN ${cooldown}s` : 'SEND AGAIN'}
              </button>
              <button type="button" className="link mono" onClick={goAuth}>
                USE A PASSWORD INSTEAD
              </button>
            </div>
            <p className="link-flow__fine mono">Emails can take a minute. Check spam. Only a few can be sent per hour.</p>
          </form>
        )}

        {step.id === 'new-password' && (
          <form className="link-flow__form" onSubmit={(e) => submitNewPassword(e, step.user)} onKeyDown={submitOnEnter}>
            <p className="link-flow__copy">
              Signed in as <strong>{step.user.email}</strong>. Choose a new password — you’ll use it to sign in on every device.
            </p>
            {passwordField('new-password', 'NEW PASSWORD')}
            {error}
            <div className="link-flow__actions">
              <button className="btn btn--gold btn--lg" disabled={busy || password.length < MIN_PASSWORD}>
                {busy ? 'SAVING…' : 'SAVE PASSWORD & CONTINUE'}
              </button>
            </div>
          </form>
        )}

        {step.id === 'scanning' && <Working label="SCANNING THE CLOUD…" />}
        {step.id === 'working' && <Working label={step.label} />}

        {step.id === 'choose' && (
          <ChooseCharacter plan={step.plan} onChoose={(choice) => user.current && void link(user.current, step.plan, choice)} />
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
                  : 'Same character on every device. Sign in with this email and password on your phone or laptop and pick up exactly where you left off.'}
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
            <div className="composer__error mono" role="alert">
              {step.message}
            </div>
            <p className="link-flow__copy">
              {runtime.mode.kind === 'guest' && guestName ? `${guestName}'s progress is safe on this device. ` : ''}
              Nothing was lost.
            </p>
            <div className="link-flow__actions">
              <button className="btn btn--gold" onClick={() => (step.retry === 'scan' && user.current ? void scan(user.current) : goAuth())}>
                {step.retry === 'scan' ? 'TRY AGAIN' : 'SIGN IN WITH PASSWORD'}
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

function ChooseCharacter({ plan, onChoose }: { plan: Extract<LinkPlan, { kind: 'choose' }>; onChoose: (choice: LinkChoice) => void }) {
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
