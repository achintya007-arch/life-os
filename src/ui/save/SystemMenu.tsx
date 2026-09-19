import { useRef, useState } from 'react';
import { useRuntime, useSaveStatus } from '../../app/RuntimeContext';
import { LIMITS } from '../../engine/constants';
import type { GameEvent } from '../../engine/types';
import { deleteBackup, listBackups, readBackupFile } from '../../store/backups';
import { SaveError, parseSave } from '../../store/eventStore';
import { useGameState, useNow } from '../../store/GameContext';
import { MIN_PASSWORD, cloudAvailable, updatePassword } from '../../sync/cloud';
import { useCelebration } from '../celebration/Celebration';
import { Modal } from '../components/Modal';
import { submitOnEnter } from '../components/submitOnEnter';
import { downloadSave } from './download';
import { ago, describeStatus } from './saveStatus';
import type { LinkFlowMode } from './LinkFlow';

export function SystemMenu({
  onClose,
  onLink,
  onTutorial,
}: {
  onClose: () => void;
  onLink: (mode: LinkFlowMode) => void;
  onTutorial?: () => void;
}) {
  const runtime = useRuntime();
  const status = useSaveStatus();
  const state = useGameState();
  const { act, notify } = useCelebration();
  useNow(15_000); // keep "synced 2 min ago" honest
  const view = describeStatus(status);
  const isAccount = status.kind === 'account';

  const [name, setName] = useState(state.character?.name ?? '');
  const [pendingImport, setPendingImport] = useState<{ events: GameEvent[]; fileName: string } | null>(null);
  const [backups, setBackups] = useState(() => listBackups(runtime.storage));
  const [confirm, setConfirm] = useState<null | 'sign-out' | 'delete' | 'new-game'>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshBackups = () => setBackups(listBackups(runtime.storage));

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== state.character?.name) {
      const r = act({ type: 'renameCharacter', name });
      if (r.ok) notify('The chronicle has been amended.');
    }
  };

  const exportSave = () => {
    downloadSave(runtime.exportFile());
    notify('Save exported. Your whole story, in one file.');
  };

  const pickFile = async (file: File) => {
    try {
      const events = parseSave(JSON.parse(await file.text()));
      setPendingImport({ events, fileName: file.name });
    } catch (e) {
      notify(e instanceof SaveError ? e.message : 'That file could not be read as a LIFE//OS save.', 'error');
    }
  };

  const applyImport = (how: 'merge' | 'replace') => {
    if (!pendingImport) return;
    try {
      const { added, backupId } = runtime.importEvents(pendingImport.events, how);
      setPendingImport(null);
      refreshBackups();
      notify(
        how === 'replace'
          ? `Save loaded.${backupId ? ' Your previous save was kept as a backup.' : ''}`
          : added
            ? `Merged ${added} events into this save.`
            : 'Nothing new in that file — it’s already part of this save.',
      );
      if (how === 'replace') onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import failed.', 'error');
    }
  };

  const restore = (id: string) => {
    try {
      const { added } = runtime.restoreBackup(id);
      refreshBackups();
      notify(isAccount ? `Merged ${added} events from the backup.` : 'Backup restored. The save it replaced was backed up too.');
      if (!isAccount) onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That backup could not be restored.', 'error');
    }
  };

  const signOut = async () => {
    setBusy(true);
    const { backupId } = await runtime.signOut();
    setBusy(false);
    notify(backupId ? 'Signed out. Unsynced progress was kept as a backup on this device.' : 'Signed out. Your character is safe in the cloud.');
    onClose();
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await runtime.deleteAccount();
      notify('Account deleted. Every trace of it is gone from the cloud.');
      onClose();
    } catch {
      notify('Could not delete the account (are you online?). Nothing was changed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const newGame = () => {
    const backupId = runtime.newGuestGame();
    notify(backupId ? 'New game. The old character was kept as a backup.' : 'New game.');
    onClose();
  };

  const unsynced = runtime.unsyncedCount();

  return (
    <Modal title="System" kicker="LIFE//OS · SAVE & SETTINGS" onClose={onClose}>
      <div className="system">
        {/* ── SAVE ── */}
        <section className="system__section">
          <div className="field__label mono">SAVE</div>
          <div className={`save-status save-status--${view.tone}`}>
            <div className="save-status__head mono">
              <span className="save-status__glyph">{view.glyph}</span> {view.label}
            </div>
            {isAccount && (
              <div className="save-status__who mono">
                {status.email} · synced {ago(status.lastSyncedAt)}
              </div>
            )}
            <p className="save-status__detail">{view.detail}</p>
            <div className="system__row">
              {!isAccount && cloudAvailable && (
                <button className="btn btn--gold" onClick={() => onLink('link')}>
                  CREATE ACCOUNT &amp; SYNC
                </button>
              )}
              {!isAccount && !cloudAvailable && <p className="system__meta mono dim">CLOUD SAVES ARE NOT AVAILABLE IN THIS BUILD</p>}
              {isAccount && status.connection === 'needs-sign-in' && (
                <button className="btn btn--gold" onClick={() => onLink('reauth')}>
                  SIGN IN AGAIN
                </button>
              )}
              {isAccount && status.connection !== 'needs-sign-in' && (
                <button className="btn" disabled={status.phase === 'syncing'} onClick={() => void runtime.sync()}>
                  {status.phase === 'syncing' ? 'SYNCING…' : 'SYNC NOW'}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── CHARACTER ── */}
        {state.character && (
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
        )}

        {/* ── HOW TO PLAY ── */}
        {state.character && onTutorial && (
          <section className="system__section">
            <div className="field__label mono">HOW TO PLAY</div>
            <div className="system__row">
              <button className="btn" onClick={onTutorial}>
                REPLAY THE TUTORIAL
              </button>
            </div>
          </section>
        )}

        {/* ── DATA ── */}
        <section className="system__section">
          <div className="field__label mono">YOUR DATA</div>
          <p className="system__copy">
            {isAccount
              ? 'Your save lives in your account and is cached on this device for offline play. Export it any time — it’s yours.'
              : 'Everything lives in this browser. Export a save to back it up, or bind an account to keep it safe everywhere.'}
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
                if (f) void pickFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {pendingImport && (
            <div className="system__confirm">
              <p className="system__copy">
                <strong>{pendingImport.fileName}</strong> · {pendingImport.events.length} events.{' '}
                {isAccount
                  ? 'It will be merged into your account: its quests and deeds are added, your character keeps its name.'
                  : state.character
                    ? 'Replace this save with it, or merge its progress into this character?'
                    : 'Load it as this device’s save?'}
              </p>
              <div className="system__row">
                {isAccount || state.character ? (
                  <button className="btn btn--gold" onClick={() => applyImport('merge')}>
                    MERGE
                  </button>
                ) : null}
                {!isAccount && (
                  <button className={`btn ${state.character ? '' : 'btn--gold'}`} onClick={() => applyImport('replace')}>
                    {state.character ? 'REPLACE (BACKS UP CURRENT)' : 'LOAD SAVE'}
                  </button>
                )}
                <button className="btn btn--ghost" onClick={() => setPendingImport(null)}>
                  CANCEL
                </button>
              </div>
            </div>
          )}
          <p className="system__meta mono dim">
            {runtime.store.getEvents().length} EVENTS · {state.deeds.length} DEEDS · {state.transactions.length} XP TRANSACTIONS
            {isAccount && unsynced > 0 ? ` · ${unsynced} NOT YET SYNCED` : ''}
          </p>
        </section>

        {/* ── BACKUPS ── */}
        {backups.length > 0 && (
          <section className="system__section">
            <div className="field__label mono">BACKUPS ON THIS DEVICE</div>
            <ul className="backups">
              {backups.map((b) => (
                <li key={b.id} className="backup">
                  <div className="backup__info">
                    <span className="backup__label">{b.label}</span>
                    <span className="backup__meta mono">
                      {b.characterName ?? 'No character'} · {b.eventCount} events · {ago(b.createdAt)}
                    </span>
                  </div>
                  <div className="backup__actions">
                    <button className="btn btn--small" onClick={() => restore(b.id)} title={isAccount ? 'Merge into your account' : 'Restore (current save is backed up)'}>
                      {isAccount ? 'MERGE' : 'RESTORE'}
                    </button>
                    <button className="btn btn--small" onClick={() => downloadSave(readBackupFile(runtime.storage, b.id), `life-os-backup-${b.id}.json`)}>
                      EXPORT
                    </button>
                    <button
                      className="btn btn--small btn--ghost"
                      onClick={() => {
                        deleteBackup(runtime.storage, b.id);
                        refreshBackups();
                      }}
                      aria-label={`Delete backup ${b.label}`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── ACCOUNT ── */}
        {isAccount && (
          <section className="system__section">
            <div className="field__label mono">ACCOUNT</div>
            {status.connection === 'connected' && <PasswordSetter />}
            {confirm === 'sign-out' ? (
              <div className="system__confirm">
                <p className="system__copy">
                  {unsynced > 0
                    ? `${unsynced} ${unsynced === 1 ? 'event hasn’t' : 'events haven’t'} reached the cloud yet. We’ll try once more; anything still unsynced is kept as a backup on this device.`
                    : 'Your character stays safe in the cloud. Its local copy is removed from this device.'}
                </p>
                <div className="system__row">
                  <button className="btn btn--gold" disabled={busy} onClick={() => void signOut()}>
                    {busy ? 'SIGNING OUT…' : 'SIGN OUT'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <div className="system__row">
                <button className="btn" onClick={() => setConfirm('sign-out')}>
                  SIGN OUT
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── DANGER ── */}
        <section className="system__section system__danger">
          <div className="field__label mono">{isAccount ? 'DELETE ACCOUNT' : 'NEW GAME'}</div>
          {confirm === (isAccount ? 'delete' : 'new-game') ? (
            <>
              <p className="system__copy">
                {isAccount ? (
                  <>
                    Permanently deletes your account and <strong>all</strong> cloud history on every device. This cannot be undone.
                    Export your save first if you might want it back. Type <strong className="mono">DELETE</strong> to confirm.
                  </>
                ) : (
                  <>
                    Starts a brand-new character on this device. The current one is kept as a backup you can restore. Type{' '}
                    <strong className="mono">NEW</strong> to confirm.
                  </>
                )}
              </p>
              <div className="system__row">
                <input className="field__input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={isAccount ? 'DELETE' : 'NEW'} autoCapitalize="characters" />
                <button
                  className="btn btn--danger"
                  disabled={busy || typed.trim().toUpperCase() !== (isAccount ? 'DELETE' : 'NEW')}
                  onClick={() => (isAccount ? void deleteAccount() : newGame())}
                >
                  {isAccount ? (busy ? 'DELETING…' : 'DELETE FOREVER') : 'START OVER'}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    setConfirm(null);
                    setTyped('');
                  }}
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <div className="system__row">
              <button className="btn btn--danger" onClick={() => setConfirm(isAccount ? 'delete' : 'new-game')}>
                {isAccount ? 'DELETE ACCOUNT…' : 'NEW GAME…'}
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** Set or change the account password — also how accounts created by an emailed link get one. */
function PasswordSetter() {
  const { notify } = useCelebration();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="system__row system__row--spaced">
        <button className="btn" onClick={() => setOpen(true)}>
          SET / CHANGE PASSWORD
        </button>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      notify('Password saved. Use it to sign in on any device.');
      setOpen(false);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="system__confirm" onSubmit={save} onKeyDown={submitOnEnter}>
      <label className="field">
        <span className="field__label mono">
          NEW PASSWORD <span className="dim">· at least {MIN_PASSWORD} characters</span>
        </span>
        <input
          className="field__input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-autofocus
        />
      </label>
      {error && <div className="composer__error mono">{error}</div>}
      <div className="system__row system__row--spaced">
        <button className="btn btn--gold" disabled={busy || password.length < MIN_PASSWORD}>
          {busy ? 'SAVING…' : 'SAVE PASSWORD'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
