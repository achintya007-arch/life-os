import type { SaveFile } from '../../store/eventStore';

/** Hand the player their save as a file. */
export function downloadSave(file: SaveFile, name = `life-os-save-${new Date().toISOString().slice(0, 10)}.json`) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
