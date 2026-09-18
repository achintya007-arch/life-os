/**
 * On-device safety copies. Taken automatically before anything that could
 * replace a save (import, guest → account linking, choosing the account's
 * character over a guest one), and restorable from the System menu.
 * Each backup is a complete, versioned save file.
 */
import type { GameEvent } from '../engine/types';
import { parseSave, toSaveFile, type SaveFile } from './eventStore';
import type { KeyValue } from './keyValue';

const PREFIX = 'life-os.backup.';
export const MAX_BACKUPS = 5;

export interface BackupInfo {
  id: string;
  label: string;
  createdAt: string;
  eventCount: number;
  /** Character name at the time, if there was one. */
  characterName: string | null;
}

interface StoredBackup extends BackupInfo {
  save: SaveFile;
}

export function createBackup(
  storage: KeyValue,
  events: readonly GameEvent[],
  label: string,
  source: SaveFile['source'] = 'guest',
  now = new Date(),
): BackupInfo {
  const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let characterName: string | null = null;
  for (const e of events) if (e.type === 'character.created' || e.type === 'character.renamed') characterName = e.name;
  const backup: StoredBackup = {
    id,
    label,
    createdAt: now.toISOString(),
    eventCount: events.length,
    characterName,
    save: toSaveFile(events, now, source),
  };
  storage.setItem(PREFIX + id, JSON.stringify(backup));
  prune(storage);
  const { save: _save, ...info } = backup;
  return info;
}

export function listBackups(storage: KeyValue): BackupInfo[] {
  const out: BackupInfo[] = [];
  for (const key of storage.keys()) {
    if (!key.startsWith(PREFIX)) continue;
    try {
      const { save: _save, ...info } = JSON.parse(storage.getItem(key) ?? '') as StoredBackup;
      if (typeof info.id === 'string' && typeof info.createdAt === 'string') out.push(info);
    } catch {
      /* unreadable backup: ignore in the list, never delete automatically */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Validated events of a backup (throws SaveError if it can't be trusted). */
export function readBackup(storage: KeyValue, id: string): GameEvent[] {
  const text = storage.getItem(PREFIX + id);
  if (!text) throw new Error('Backup not found.');
  return parseSave((JSON.parse(text) as StoredBackup).save);
}

export function readBackupFile(storage: KeyValue, id: string): SaveFile {
  const text = storage.getItem(PREFIX + id);
  if (!text) throw new Error('Backup not found.');
  return (JSON.parse(text) as StoredBackup).save;
}

export function deleteBackup(storage: KeyValue, id: string): void {
  storage.removeItem(PREFIX + id);
}

function prune(storage: KeyValue) {
  const all = listBackups(storage);
  for (const old of all.slice(MAX_BACKUPS)) storage.removeItem(PREFIX + old.id);
}
