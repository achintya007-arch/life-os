import type { SaveStatus } from '../../app/runtime';

export type StatusTone = 'guest' | 'synced' | 'syncing' | 'offline' | 'attention';

export interface StatusView {
  tone: StatusTone;
  glyph: string;
  label: string;
  /** One reassuring sentence: where the progress is, and what happens next. */
  detail: string;
}

/** Turn raw sync state into what the player needs to know: is my progress safe? */
export function describeStatus(s: SaveStatus): StatusView {
  if (s.kind === 'guest') {
    return {
      tone: 'guest',
      glyph: '◇',
      label: 'GUEST SAVE',
      detail: 'This character lives only in this browser. Bind it to an account to keep it safe and play on any device.',
    };
  }
  if (s.connection === 'needs-sign-in') {
    return {
      tone: 'attention',
      glyph: '!',
      label: 'SIGN IN TO SYNC',
      detail: `Your session ended. Progress is safe on this device${s.pending ? ` (${s.pending} waiting)` : ''} and will sync after you sign in again.`,
    };
  }
  if (s.phase === 'error') {
    return {
      tone: 'attention',
      glyph: '!',
      label: 'SYNC ERROR',
      detail: 'Your progress is safe on this device. Sync will retry automatically — or retry now.',
    };
  }
  if (s.phase === 'offline' || (s.connection === 'connecting' && s.pending > 0 && s.lastSyncedAt !== null)) {
    return {
      tone: 'offline',
      glyph: '○',
      label: 'OFFLINE · SAVED LOCALLY',
      detail: 'Saved on this device. It will sync when you’re back online.',
    };
  }
  if (s.phase === 'syncing' || s.pending > 0 || s.connection === 'connecting') {
    return {
      tone: 'syncing',
      glyph: '↻',
      label: 'SYNCING',
      detail: s.pending ? `Sending ${s.pending} ${s.pending === 1 ? 'event' : 'events'} to the cloud…` : 'Checking the cloud for progress from your other devices…',
    };
  }
  return {
    tone: 'synced',
    glyph: '●',
    label: 'SYNCED',
    detail: 'Everything is safe in the cloud and on this device.',
  };
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
