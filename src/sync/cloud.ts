/**
 * The Supabase adapter: authentication + the SyncTransport. Loaded lazily, so
 * guests (and first paint for everyone) never pay for the client library.
 *
 * Only the project URL and the *publishable* anon key ship to the browser —
 * both are designed to be public. All authorization happens in Postgres via
 * Row-Level Security and the SECURITY DEFINER functions in supabase/migrations.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudApi } from '../app/runtime';
import type { GameEvent } from '../engine/types';
import { SyncError, type RemoteEvent, type SyncTransport } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False in builds without cloud configuration: the game runs guest-only. */
export const cloudAvailable = Boolean(SUPABASE_URL && ANON_KEY);

export interface CloudUser {
  userId: string;
  email: string;
}

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!cloudAvailable) return Promise.reject(new SyncError('server', 'Cloud saves are not configured in this build.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'life-os.auth',
      },
    }),
  );
  return clientPromise;
}

/* ─────────────────────────── returning from an emailed link ─────────────────────────── */

export interface AuthRedirect {
  /** Supabase reported an error in the URL (expired link, already used…). */
  error: string | null;
  /** This is a password-reset link: the player should choose a new password. */
  recovery: boolean;
}

/**
 * Read (without consuming) what an emailed link put in the URL. Pure, so it can be
 * captured at boot — before anything else touches the URL — and tested.
 */
export function parseAuthRedirect(href: string): AuthRedirect | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const errorDescription = url.searchParams.get('error_description') ?? hash.get('error_description');
  const hasCredential = url.searchParams.has('code') || hash.has('access_token');
  if (!hasCredential && !errorDescription) return null;
  return {
    error: errorDescription ? friendlyLinkError(errorDescription) : null,
    recovery: url.searchParams.get('flow') === 'recovery' || hash.get('type') === 'recovery',
  };
}

function friendlyLinkError(description: string): string {
  if (/expired|invalid/i.test(description)) return 'That email link has expired or was already used. Links work once, within an hour.';
  return description.replace(/\+/g, ' ');
}

/** Captured once at module load, before any code can rewrite the URL. */
export const bootRedirect: AuthRedirect | null = typeof window !== 'undefined' ? parseAuthRedirect(window.location.href) : null;

/**
 * Whether THIS browser requested the emailed link (it holds the PKCE verifier).
 * Read at boot, because a successful exchange removes it.
 */
const bootHadVerifier: boolean = (() => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('life-os.auth-code-verifier') !== null;
  } catch {
    return false;
  }
})();

export function isAuthRedirect(): boolean {
  return bootRedirect !== null;
}

/**
 * Finish an emailed-link sign-in. The client is created here (if it wasn't
 * already) and fully initialized — which exchanges the one-time code in the URL
 * for a session — and only THEN is the URL tidied. (Tidying first destroyed the
 * code before the lazily loaded client could read it.)
 */
export async function completeAuthRedirect(): Promise<{ user: CloudUser | null; error: string | null; recovery: boolean }> {
  const redirect = bootRedirect ?? { error: null, recovery: false };
  let user: CloudUser | null = null;
  let error = redirect.error;
  if (!error) {
    try {
      user = await currentUser(); // getSession() awaits initialization, including the code exchange
    } catch {
      error = 'Could not reach the cloud to finish signing in. Check your connection and try again.';
    }
  }
  if (!user && !error) {
    error = bootHadVerifier
      ? 'That link has expired or was already used (some mail apps open links to scan them). Sign in with your email and password instead.'
      : 'That link was opened in a different browser than the one it was requested from, so it can’t sign you in here. Sign in with your email and password instead.';
  }
  window.history.replaceState(null, '', window.location.pathname + '#/character');
  return { user, error, recovery: redirect.recovery };
}

/* ─────────────────────────── auth ─────────────────────────── */

export const MIN_PASSWORD = 8;

function toUser(u: { id: string; email?: string } | null | undefined): CloudUser {
  if (!u?.email) throw new SyncError('auth', 'Sign-in did not return a user.');
  return { userId: u.id, email: u.email };
}

/** Create an account. Email confirmation is off, so this signs the player in immediately — no email is sent. */
export async function signUpWithPassword(email: string, password: string): Promise<CloudUser> {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error);
  // An already-registered email comes back without a session (and without identities).
  if (!data.session || (data.user && data.user.identities?.length === 0)) {
    throw new SyncError('auth', 'An account with this email already exists. Sign in instead.');
  }
  return toUser(data.user);
}

export async function signInWithPassword(email: string, password: string): Promise<CloudUser> {
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw authError(error);
  return toUser(data.user);
}

/** Emails a link that signs the player in and asks for a new password. */
export async function sendPasswordReset(email: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/?flow=recovery`,
  });
  if (error) throw authError(error);
}

/** Set or change the signed-in player's password (also how link-created accounts get one). */
export async function updatePassword(password: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw authError(error);
}

/** Passwordless: emails a sign-in link (plus a code, if the email template includes one). */
export async function sendSignInCode(email: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error);
}

export async function verifySignInCode(email: string, code: string): Promise<CloudUser> {
  const client = await getClient();
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw authError(error);
  return toUser(data.user ?? data.session?.user);
}

/** The signed-in user from the locally stored session (no network round-trip). */
export async function currentUser(): Promise<CloudUser | null> {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user?.email ? { userId: user.id, email: user.email } : null;
}

export async function signOutCloud(): Promise<void> {
  const client = await getClient();
  // Local scope: sign this device out even if the network is down.
  await client.auth.signOut({ scope: 'local' });
}

export async function deleteCloudAccount(): Promise<void> {
  const client = await getClient();
  const { error } = await client.rpc('delete_my_account');
  if (error) throw dbError(error);
  await client.auth.signOut({ scope: 'local' });
}

export async function updateProfileName(userId: string, name: string): Promise<void> {
  const client = await getClient();
  const { error } = await client
    .from('profiles')
    .update({ display_name: name.slice(0, 64), updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw dbError(error);
}

/* ─────────────────────────── transport ─────────────────────────── */

export function supabaseTransport(client: SupabaseClient): SyncTransport {
  return {
    async push(events: readonly GameEvent[], deviceId: string) {
      const { data, error } = await client.rpc('push_events', { p_events: events, p_device_id: deviceId });
      if (error) throw dbError(error);
      return ((data ?? []) as { event_id: string; seq: number | string }[]).map((r) => ({ id: r.event_id, seq: Number(r.seq) }));
    },
    async pull(afterSeq: number, limit: number) {
      const { data, error } = await client
        .from('game_events')
        .select('seq, payload')
        .gt('seq', afterSeq)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw dbError(error);
      return ((data ?? []) as { seq: number | string; payload: GameEvent }[]).map(
        (r): RemoteEvent => ({ seq: Number(r.seq), event: r.payload }),
      );
    },
  };
}

/* ─────────────────────────── realtime ─────────────────────────── */

/**
 * Get told the moment another device writes to this player's log. Realtime
 * enforces the same Row-Level Security as queries, so only this user's rows
 * can ever arrive. The payload is only used as a nudge: the actual events are
 * always fetched through the normal pull path (validated, ordered, deduped).
 */
export async function subscribeToLog(userId: string, onRemoteWrite: (deviceId: string | null) => void): Promise<() => void> {
  const client = await getClient();
  const channel = client
    .channel(`life-os:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_events', filter: `user_id=eq.${userId}` },
      (payload) => onRemoteWrite(((payload.new ?? {}) as { device_id?: string | null }).device_id ?? null),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/* ─────────────────────────── errors ─────────────────────────── */

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

function looksOffline(e: ErrorLike): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e.message ?? '');
}

function dbError(e: ErrorLike): SyncError {
  if (looksOffline(e)) return new SyncError('offline', 'You’re offline.');
  if (e.status === 401 || e.code === 'PGRST301' || e.code === '28000' || /jwt|not authenticated/i.test(e.message ?? '')) {
    return new SyncError('auth', 'Your session expired. Sign in again to resume syncing.');
  }
  return new SyncError('server', e.message ?? 'The cloud returned an error.');
}

export function authError(e: ErrorLike): SyncError {
  if (looksOffline(e)) return new SyncError('offline', 'You’re offline. Connect to the internet to sign in.');
  const text = `${e.message ?? ''} ${e.code ?? ''}`;
  if (e.status === 429 || /rate.?limit/i.test(text)) {
    return new SyncError('server', 'Too many emails were requested recently. Wait a few minutes — or sign in with your password, which never needs an email.');
  }
  if (/invalid login credentials|invalid_credentials/i.test(text)) return new SyncError('auth', 'Wrong email or password.');
  if (/already registered|user_already_exists|email_exists/i.test(text)) return new SyncError('auth', 'An account with this email already exists. Sign in instead.');
  if (/weak_password|password should|password is (too|known)/i.test(text)) return new SyncError('auth', `Choose a stronger password (at least ${MIN_PASSWORD} characters).`);
  if (/same_password|different from the old/i.test(text)) return new SyncError('auth', 'That’s already your password.');
  if (/email not confirmed|email_not_confirmed/i.test(text)) {
    return new SyncError('auth', 'This account was never confirmed. Use “Forgot password?” to set a password and sign in.');
  }
  if (/signups? not allowed|signup_disabled/i.test(text)) return new SyncError('server', 'New accounts are temporarily disabled.');
  if (/expired|invalid/i.test(text) && /otp|token|code/i.test(text)) return new SyncError('auth', 'That code is invalid or has expired. Request a new one.');
  if (/email/i.test(text) && /valid/i.test(text)) return new SyncError('auth', 'That doesn’t look like a valid email address.');
  return new SyncError('server', e.message || 'Sign-in failed.');
}

/* ─────────────────────────── runtime binding ─────────────────────────── */

export const browserCloud: CloudApi = {
  available: cloudAvailable,
  currentUser,
  transport: async () => supabaseTransport(await getClient()),
  signOut: signOutCloud,
  deleteAccount: deleteCloudAccount,
  updateProfileName,
  subscribe: subscribeToLog,
};
