import { useSaveStatus } from '../../app/RuntimeContext';
import { describeStatus } from './saveStatus';

/** A quiet status light in the top bar. Tapping it opens the System menu. */
export function SyncIndicator({ onOpen }: { onOpen: () => void }) {
  const view = describeStatus(useSaveStatus());
  return (
    <button className={`sync-light sync-light--${view.tone} mono`} onClick={onOpen} title={view.detail} aria-label={`Save status: ${view.label}. ${view.detail}`}>
      <span className="sync-light__glyph" aria-hidden>
        {view.glyph}
      </span>
      <span className="sync-light__label">{view.label}</span>
    </button>
  );
}
