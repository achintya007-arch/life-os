/**
 * The account flow lives outside the game tree: linking swaps the active save,
 * which remounts the game — and the flow must survive that to show its ending.
 */
import { useSyncExternalStore } from 'react';
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
  // URL cleanup after an emailed link happens in completeAuthRedirect(), once the cloud client has consumed it.
  if (!current) return null;
  return <LinkFlow mode={current.mode} resumeFromRedirect={current.resume} onClose={close} />;
}
