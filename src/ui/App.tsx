import { useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import { LIMITS } from '../engine/constants';
import { levelInfo } from '../engine/leveling';
import { useGameState, useNow, useStore } from '../store/GameContext';
import { SaveError, parseSave, toSaveFile } from '../store/eventStore';
import { useCelebration } from './celebration/Celebration';
import { Glyph } from './components/Icon';
import { Modal } from './components/Modal';
import { Chronicle } from './views/Chronicle';
import { Genesis } from './views/Genesis';
import { Headquarters } from './views/Headquarters';
import { Vault } from './views/Vault';
import { submitOnEnter } from './components/submitOnEnter';

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
  const state = useGameState();
  const now = useNow();
  const [view, setView] = useState<View>(readHash);

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

  if (!state.character) return <Genesis />;

  return (
    <div className="shell">
      <TopBar view={view} onNavigate={navigate} now={now} />
      <div className="shell__view" key={view}>
        {view === 'character' && <Headquarters state={state} now={now} onNavigate={navigate} />}
        {view === 'vault' && <Vault state={state} />}
        {view === 'chronicle' && <Chronicle state={state} now={now} />}
      </div>
    </div>
  );
}

function TopBar({ view, onNavigate, now }: { view: View; onNavigate: (v: View) => void; now: Date }) {
  const state = useGameState();
  const [soundOn, setSoundOn] = useState(sfx.enabled);
  const [systemOpen, setSystemOpen] = useState(false);
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
        <button className="icon-btn" onClick={() => setSystemOpen(true)} aria-label="System menu" title="System">
          <Glyph name="menu" size={17} />
        </button>
      </div>
      {systemOpen && <SystemMenu onClose={() => setSystemOpen(false)} />}
    </header>
  );
}

function SystemMenu({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const state = useGameState();
  const { act, notify } = useCelebration();
  const [name, setName] = useState(state.character?.name ?? '');
  const [confirmReset, setConfirmReset] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportSave = () => {
    const blob = new Blob([JSON.stringify(toSaveFile(store.getEvents()), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life-os-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Save exported. Your whole story, in one file.');
  };

  const importSave = async (file: File) => {
    try {
      const events = parseSave(JSON.parse(await file.text()));
      store.replaceAll(events);
      notify(`Save loaded: ${events.length} events restored.`);
      onClose();
    } catch (e) {
      notify(e instanceof SaveError ? e.message : 'That file could not be read.', 'error');
    }
  };

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== state.character?.name) {
      const r = act({ type: 'renameCharacter', name });
      if (r.ok) notify('The chronicle has been amended.');
    }
  };

  const resetWord = state.character?.name.toUpperCase() ?? 'RESET';

  return (
    <Modal title="System" kicker="LIFE//OS · SETTINGS & DATA" onClose={onClose}>
      <div className="system">
        <form className="system__section" onSubmit={rename} onKeyDown={submitOnEnter}>
          <label className="field">
            <span className="field__label mono">CHARACTER NAME</span>
            <div className="system__row">
              <input className="field__input" value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={!name.trim() || name.trim() === state.character?.name}>
                RENAME
              </button>
            </div>
          </label>
        </form>

        <div className="system__section">
          <div className="field__label mono">YOUR DATA</div>
          <p className="system__copy">
            Everything lives in this browser on this device. No accounts, no servers, no tracking. Export a save to back it
            up or move it to another machine.
          </p>
          <div className="system__row">
            <button className="btn" onClick={exportSave}>
              EXPORT SAVE
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              IMPORT SAVE
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importSave(f);
                e.target.value = '';
              }}
            />
          </div>
          <p className="system__meta mono dim">
            {store.getEvents().length} EVENTS · {state.deeds.length} DEEDS · {state.transactions.length} XP TRANSACTIONS
          </p>
        </div>

        <div className="system__section system__danger">
          <div className="field__label mono">NEW GAME</div>
          <p className="system__copy">
            Erases this character and all history from this device. This cannot be undone — export a save first if you
            might want it back. Type <strong className="mono">{resetWord}</strong> to confirm.
          </p>
          <div className="system__row">
            <input className="field__input" value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} placeholder={resetWord} />
            <button
              className="btn btn--danger"
              disabled={confirmReset.trim().toUpperCase() !== resetWord}
              onClick={() => {
                store.replaceAll([]);
                onClose();
              }}
            >
              ERASE
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
