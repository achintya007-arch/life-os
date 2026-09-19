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
import './styles/save.css';
import './styles/progression.css';
import { Runtime } from './app/runtime';
import { RuntimeProvider } from './app/RuntimeContext';
import { browserStorage } from './store/keyValue';
import { browserCloud } from './sync/cloud';
import { deviceId } from './sync/deviceSession';
import { CelebrationProvider } from './ui/celebration/Celebration';
import { App } from './ui/App';
import { LinkFlowHost } from './ui/save/LinkFlowHost';

const storage = browserStorage();
const runtime = new Runtime(storage, browserCloud, deviceId(storage)).boot();

if (runtime.recoveredCorruptSave) {
  window.setTimeout(() => alert('LIFE//OS could not read part of your save. A copy was kept on this device, and nothing was deleted.'), 0);
}

// Debug handles, development builds only.
if (import.meta.env.DEV) {
  const w = window as unknown as { lifeos: Runtime; lifeosSeed: () => void };
  w.lifeos = runtime;
  w.lifeosSeed = () => void import('./dev/seed').then((m) => runtime.importEvents(m.buildDemoHistory(), runtime.mode.kind === 'guest' ? 'replace' : 'merge'));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeProvider runtime={runtime} persistent={<LinkFlowHost />}>
      <CelebrationProvider>
        <App />
      </CelebrationProvider>
    </RuntimeProvider>
  </StrictMode>,
);
