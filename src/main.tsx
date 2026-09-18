import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/hq.css';
import './styles/views.css';
import './styles/celebration.css';
import { GameStore } from './store/gameStore';
import { LocalEventStore, SaveError } from './store/eventStore';
import { GameProvider } from './store/GameContext';
import { CelebrationProvider } from './ui/celebration/Celebration';
import { App } from './ui/App';

function bootStore(): { store: GameStore; recovered: boolean } {
  const persistence = new LocalEventStore(window.localStorage);
  try {
    return { store: new GameStore(persistence), recovered: false };
  } catch (e) {
    if (!(e instanceof SaveError)) throw e;
    // Never destroy unreadable data: set it aside and start clean.
    console.error('LIFE//OS: save could not be loaded and was quarantined.', e);
    persistence.quarantine();
    return { store: new GameStore(persistence), recovered: true };
  }
}

const { store, recovered } = bootStore();
if (recovered) {
  window.setTimeout(() => alert('LIFE//OS could not read your save. A backup copy was kept in local storage.'), 0);
}

// Debug handles, development builds only.
if (import.meta.env.DEV) {
  const w = window as unknown as { lifeos: GameStore; lifeosSeed: () => void };
  w.lifeos = store;
  w.lifeosSeed = () => void import('./dev/seed').then((m) => store.replaceAll(m.buildDemoHistory()));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider store={store}>
      <CelebrationProvider>
        <App />
      </CelebrationProvider>
    </GameProvider>
  </StrictMode>,
);
