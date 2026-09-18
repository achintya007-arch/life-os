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

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False in builds without cloud configuration: the game runs guest-only. */
export const cloudAvailable = Boolean(URL && ANON_KEY);

export interface CloudUser {
  userId: string;
  email: string;
}

let clientPromise: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  if (!cloudAvailable) return Promise.reject(new SyncError('server', 'Cloud saves are not configured in this build.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL!, ANON_KEY!, {
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

/** Did this page load come back from an emailed sign-in link? */
export function isAuthRedirect(): boolean {
  const { search, hash } = window.location;
  return /[?&]code=/.test(search) || /access_token=|error_description=/.test(hash);
}

/* ─────────────────────────── auth ─────────────────────────── */

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
  const user = data.user ?? data.session?.user;
  if (!user?.email) throw new SyncError('auth', 'Sign-in did not return a user.');
  return { userId: user.id, email: user.email };
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

function authError(e: ErrorLike): SyncError {
  if (looksOffline(e)) return new SyncError('offline', 'You’re offline. Connect to the internet to sign in.');
  const msg = e.message ?? '';
  if (e.status === 429 || /rate limit/i.test(msg)) return new SyncError('server', 'Too many sign-in emails. Wait a few minutes and try again.');
  if (/expired|invalid/i.test(msg)) return new SyncError('auth', 'That code is invalid or has expired. Request a new one.');
  if (/email/i.test(msg) && /valid/i.test(msg)) return new SyncError('auth', 'That doesn’t look like a valid email address.');
  return new SyncError('server', msg || 'Sign-in failed.');
}

/* ─────────────────────────── runtime binding ─────────────────────────── */

export const browserCloud: CloudApi = {
  available: cloudAvailable,
  currentUser,
  transport: async () => supabaseTransport(await getClient()),
  signOut: signOutCloud,
  deleteAccount: deleteCloudAccount,
  updateProfileName,
};
