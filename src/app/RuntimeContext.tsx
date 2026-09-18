import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { GameProvider } from '../store/GameContext';
import { startSyncScheduler } from './scheduler';
import type { Runtime, SaveStatus } from './runtime';

const RuntimeContext = createContext<Runtime | null>(null);

/** Renders the game against whichever save is active; remounts it when the save changes. */
export function RuntimeProvider({
  runtime,
  persistent,
  children,
}: {
  runtime: Runtime;
  /** UI that must survive save swaps (rendered outside the remounting game tree). */
  persistent?: ReactNode;
  children: ReactNode;
}) {
  const generation = useSyncExternalStore(runtime.subscribe, () => runtime.generation);

  // One scheduler per active account session.
  useEffect(() => (runtime.session ? startSyncScheduler(runtime) : undefined), [runtime, generation]);

  return (
    <RuntimeContext.Provider value={runtime}>
      {persistent}
      <GameProvider store={runtime.store} key={generation}>
        {children}
      </GameProvider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime must be used inside <RuntimeProvider>');
  return runtime;
}

/** Save/sync status, re-rendering only when it changes. */
export function useSaveStatus(): SaveStatus {
  const runtime = useRuntime();
  const snapshot = useSyncExternalStore(runtime.subscribe, () => statusKey(runtime.status()));
  return JSON.parse(snapshot) as SaveStatus;
}

const statusKey = (s: SaveStatus) => JSON.stringify(s);
