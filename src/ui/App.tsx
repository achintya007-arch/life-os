import { useEffect, useState } from 'react';
import { sfx } from '../audio/sfx';
import { useRuntime } from '../app/RuntimeContext';
import { levelInfo } from '../engine/leveling';
import { useGameState, useNow } from '../store/GameContext';
import { cloudAvailable } from '../sync/cloud';
import { useCelebration } from './celebration/Celebration';
import { Glyph } from './components/Icon';
import type { LinkFlowMode } from './save/LinkFlow';
import { openLinkFlow } from './save/LinkFlowHost';
import { SyncIndicator } from './save/SyncIndicator';
import { SystemMenu } from './save/SystemMenu';
import { Chronicle } from './views/Chronicle';
import { Genesis } from './views/Genesis';
import { Headquarters } from './views/Headquarters';
import { Vault } from './views/Vault';

type View = 'character' | 'vault' | 'chronicle';
const VIEWS: { id: View; label: string }[] = [
  { id: 'character', label: 'CHARACTER' },
  { id: 'vault', label: 'VAULT' },
  { id: 'chronicle', label: 'CHRONICLE' },
];

function readHash(): View {
  const v = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.some((x) => x.id === v) ? (v as View) : 'character';
}

export function App() {
  const runtime = useRuntime();
  const state = useGameState();
  const now = useNow();
  const [view, setView] = useState<View>(readHash);
  const [systemOpen, setSystemOpen] = useState(false);
  useSyncNotices();

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (v: View) => {
    window.location.hash = `/${v}`;
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const openLink = (mode: LinkFlowMode) => {
    setSystemOpen(false);
    openLinkFlow(mode);
  };

  const overlays = (
    <>
      {systemOpen && <SystemMenu onClose={() => setSystemOpen(false)} onLink={openLink} />}
    </>
  );

  if (!state.character) {
    return (
      <>
        <Genesis
          onSignIn={cloudAvailable && runtime.mode.kind === 'guest' ? () => openLink('link') : undefined}
          account={runtime.mode.kind === 'account' ? { email: runtime.mode.email, onSignOut: () => void runtime.signOut() } : undefined}
        />
        {overlays}
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar view={view} onNavigate={navigate} now={now} onOpenSystem={() => setSystemOpen(true)} />
      <div className="shell__view" key={view}>
        {view === 'character' && <Headquarters state={state} now={now} onNavigate={navigate} />}
        {view === 'vault' && <Vault state={state} />}
        {view === 'chronicle' && <Chronicle state={state} now={now} />}
      </div>
      {overlays}
    </div>
  );
}

/** Sync outcomes worth telling the player about, as quiet toasts. */
function useSyncNotices() {
  const runtime = useRuntime();
  const { notify } = useCelebration();
  useEffect(
    () =>
      runtime.onNotice((n) => {
        if (n.kind === 'arrived') {
          notify(`↻ Progress from your other device arrived (${n.count} ${n.count === 1 ? 'event' : 'events'}).`);
        } else {
          for (const c of n.conflicts) {
            notify(`“${c.title}” was ${c.reason}, so it only counts once. Nothing else changed.`);
          }
        }
      }),
    [runtime, notify],
  );
}

function TopBar({
  view,
  onNavigate,
  now,
  onOpenSystem,
}: {
  view: View;
  onNavigate: (v: View) => void;
  now: Date;
  onOpenSystem: () => void;
}) {
  const state = useGameState();
  const [soundOn, setSoundOn] = useState(sfx.enabled);
  const level = levelInfo(state.totalXp).level;

  return (
    <header className="topbar">
      <button className="topbar__logo" onClick={() => onNavigate('character')} aria-label="LIFE//OS home">
        <span className="logo-mark" aria-hidden />
        LIFE<span className="logo-slash">//</span>OS
      </button>
      <nav className="topbar__nav" aria-label="Main">
        {VIEWS.map((v) => (
          <button key={v.id} className={`topbar__tab mono ${view === v.id ? 'is-active' : ''}`} onClick={() => onNavigate(v.id)} aria-current={view === v.id ? 'page' : undefined}>
            {v.label}
          </button>
        ))}
      </nav>
      <div className="topbar__status mono">
        <span className="topbar__who">
          {state.character?.name} <span className="gold">LV{level}</span>
        </span>
        <SyncIndicator onOpen={onOpenSystem} />
        <span className="topbar__clock">
          {now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()} ·{' '}
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          className="icon-btn"
          onClick={() => {
            sfx.setEnabled(!soundOn);
            setSoundOn(!soundOn);
            if (!soundOn) sfx.play('tick');
          }}
          aria-label={soundOn ? 'Mute sound' : 'Enable sound'}
          title={soundOn ? 'Sound on' : 'Sound off'}
        >
          <Glyph name={soundOn ? 'sound-on' : 'sound-off'} size={17} />
        </button>
        <button className="icon-btn" onClick={onOpenSystem} aria-label="System menu" title="System">
          <Glyph name="menu" size={17} />
        </button>
      </div>
    </header>
  );
}
