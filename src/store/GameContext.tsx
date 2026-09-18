import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { GameState } from '../engine/types';
import type { GameStore } from './gameStore';

const StoreContext = createContext<GameStore | null>(null);

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): GameStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <GameProvider>');
  return store;
}

export function useGameState(): GameState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Current time, refreshed every `intervalMs`. Keeps date-dependent UI (dailies, clock) honest. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
