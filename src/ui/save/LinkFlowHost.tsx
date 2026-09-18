/**
 * The account flow lives outside the game tree: linking swaps the active save,
 * which remounts the game — and the flow must survive that to show its ending.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { cloudAvailable, isAuthRedirect } from '../../sync/cloud';
import { LinkFlow, type LinkFlowMode } from './LinkFlow';

type Request = { mode: LinkFlowMode; resume: boolean } | null;

let request: Request = cloudAvailable && typeof window !== 'undefined' && isAuthRedirect() ? { mode: 'link', resume: true } : null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openLinkFlow(mode: LinkFlowMode = 'link') {
  request = { mode, resume: false };
  emit();
}

function close() {
  request = null;
  emit();
}

export function LinkFlowHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => request,
  );
  const resume = current?.resume ?? false;
  useEffect(() => {
    // Tidy the URL left behind by the emailed sign-in link (after the client has read it).
    if (resume) window.setTimeout(() => window.history.replaceState(null, '', window.location.pathname + '#/character'), 0);
  }, [resume]);
  if (!current) return null;
  return <LinkFlow mode={current.mode} resumeFromRedirect={current.resume} onClose={close} />;
}
