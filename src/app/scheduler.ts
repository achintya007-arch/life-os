/**
 * When to sync. Gameplay never waits on any of this.
 *   • shortly after local progress (debounced, so a burst of deeds = one push)
 *   • when the connection comes back
 *   • when the tab/app becomes visible again (picking up the phone)
 *   • every minute while visible, to pick up other devices' progress
 *   • with exponential backoff while offline or failing
 */
import type { Runtime } from './runtime';

const DEBOUNCE_MS = 1500;
const POLL_MS = 60_000;
const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export function startSyncScheduler(runtime: Runtime): () => void {
  let timer: number | null = null;
  let backoff = 0;
  let running = false;
  let disposed = false;

  const clear = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    timer = window.setTimeout(() => void run(), ms);
  };

  async function run() {
    clear();
    if (disposed || running || !runtime.session) return;
    running = true;
    try {
      await runtime.sync();
    } finally {
      running = false;
    }
    const s = runtime.status();
    if (s.kind !== 'account') return;
    if (s.connection === 'needs-sign-in') return; // waits for the player to sign in again
    if (s.connection === 'connecting' || s.phase === 'offline' || s.phase === 'error') {
      backoff = backoff ? Math.min(backoff * 3, BACKOFF_MAX_MS) : BACKOFF_START_MS;
      // Expired sessions won't fix themselves by retrying fast.
      schedule(s.errorKind === 'auth' ? BACKOFF_MAX_MS : backoff);
    } else {
      backoff = 0;
      if (s.pending > 0) schedule(DEBOUNCE_MS); // progress made during the pass
    }
  }

  const now = () => {
    backoff = 0;
    void run();
  };

  // New local progress → debounced push (unless we're backing off).
  const unsubscribe = runtime.subscribe(() => {
    const s = runtime.status();
    if (s.kind === 'account' && s.pending > 0 && s.phase === 'idle' && !running && backoff === 0 && timer === null) {
      schedule(DEBOUNCE_MS);
    }
  });

  const onVisible = () => {
    if (document.visibilityState === 'visible') now();
  };
  window.addEventListener('online', now);
  document.addEventListener('visibilitychange', onVisible);
  const poll = window.setInterval(() => {
    if (document.visibilityState === 'visible' && backoff === 0) void run();
  }, POLL_MS);

  void runtime.connect().then(run);

  return () => {
    disposed = true;
    clear();
    unsubscribe();
    window.removeEventListener('online', now);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(poll);
  };
}
