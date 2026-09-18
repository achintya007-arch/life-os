/**
 * Which save this device is currently playing: the guest save, or a signed-in
 * account's cloud-backed save. Stored locally so the game can boot instantly
 * and offline — the cloud client loads in the background.
 */
import type { KeyValue } from '../store/keyValue';

export type DeviceMode = { kind: 'guest' } | { kind: 'account'; userId: string; email: string };

const MODE_KEY = 'life-os.session.v1';
const DEVICE_KEY = 'life-os.device-id';
export const GUEST_SAVE_KEY = 'life-os.save.v1';

export function readMode(storage: KeyValue): DeviceMode {
  const text = storage.getItem(MODE_KEY);
  if (!text) return { kind: 'guest' };
  try {
    const m = JSON.parse(text) as DeviceMode;
    if (m.kind === 'account' && typeof m.userId === 'string' && typeof m.email === 'string') return m;
  } catch {
    /* fall through */
  }
  return { kind: 'guest' };
}

export function writeMode(storage: KeyValue, mode: DeviceMode): void {
  if (mode.kind === 'guest') storage.removeItem(MODE_KEY);
  else storage.setItem(MODE_KEY, JSON.stringify(mode));
}

/** A stable, random, non-identifying id for this browser. Used only to tag pushes. */
export function deviceId(storage: KeyValue, make: () => string = () => crypto.randomUUID()): string {
  let id = storage.getItem(DEVICE_KEY);
  if (!id) {
    id = make();
    storage.setItem(DEVICE_KEY, id);
  }
  return id;
}
