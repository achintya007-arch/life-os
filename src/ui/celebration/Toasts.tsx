import { ATTRIBUTE_INFO, type Attribute } from '../../engine/constants';
import type { Deed } from '../../engine/types';
import { AttributeIcon, Glyph, TierIcon } from '../components/Icon';
import type { Honor } from './Overlays';

export type Toast =
  | { id: number; kind: 'deed'; deed: Deed; restedBonus: number; headline: string; ttl: number }
  | { id: number; kind: 'achievement'; honors: Honor[] }
  | { id: number; kind: 'rank'; attribute: Attribute; from: number; to: number }
  | { id: number; kind: 'info' | 'error'; text: string };

export function Toasts({
  toasts,
  onDismiss,
  onUndo,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  onUndo: (deedId: string) => void;
}) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} onUndo={onUndo} />
      ))}
    </div>
  );
}

function ToastView({ toast, onDismiss, onUndo }: { toast: Toast; onDismiss: (id: number) => void; onUndo: (deedId: string) => void }) {
  switch (toast.kind) {
    case 'deed': {
      const { deed } = toast;
      return (
        <div className={`toast toast--deed toast--${deed.tier}`} style={{ '--accent': `var(--attr-${deed.attribute})` } as React.CSSProperties}>
          <div className="toast__timer" style={{ animationDuration: `${toast.ttl}ms` }} />
          <TierIcon tier={deed.tier} size={18} className="toast__icon" />
          <div className="toast__body">
            <div className="toast__kicker mono">{toast.headline}</div>
            <div className="toast__title">{deed.title}</div>
          </div>
          <div className="toast__xp mono">
            +{deed.xp}
            <small>XP</small>
          </div>
          <button className="toast__undo mono" onClick={() => onUndo(deed.id)}>
            UNDO
          </button>
        </div>
      );
    }
    case 'achievement': {
      const [first, ...rest] = toast.honors;
      const a = first!.achievement;
      const kicker =
        toast.honors.length > 1 ? `${toast.honors.length} ACHIEVEMENTS UNLOCKED` : a.hidden ? 'SECRET ACHIEVEMENT DISCOVERED' : 'ACHIEVEMENT UNLOCKED';
      return (
        <div className={`toast toast--achievement rarity--${a.rarity}`} onClick={() => onDismiss(toast.id)}>
          <div className="toast__medal">
            <Glyph name="signal" size={20} />
          </div>
          <div className="toast__body">
            <div className="toast__kicker mono">{kicker}</div>
            <div className="toast__title toast__title--achievement">{a.name}</div>
            <div className="toast__desc">{a.description}</div>
            {first!.titleName && <div className="toast__title-unlock mono">NEW TITLE · {first!.titleName}</div>}
            {rest.map((h) => (
              <div key={h.achievement.id} className={`toast__also mono rarity--${h.achievement.rarity}`}>
                + {h.achievement.name}
                {h.titleName ? ` · TITLE: ${h.titleName}` : ''}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'rank':
      return (
        <div className="toast toast--rank" style={{ '--accent': `var(--attr-${toast.attribute})` } as React.CSSProperties}>
          <AttributeIcon attribute={toast.attribute} size={18} className="toast__icon" />
          <div className="toast__body">
            <div className="toast__kicker mono">{ATTRIBUTE_INFO[toast.attribute].name.toUpperCase()} RISES</div>
            <div className="toast__rank mono">
              {toast.attribute} <span className="dim">{toast.from}</span> → <strong>{toast.to}</strong>
            </div>
          </div>
        </div>
      );
    case 'info':
    case 'error':
      return (
        <div className={`toast toast--${toast.kind}`} onClick={() => onDismiss(toast.id)}>
          <div className="toast__body">
            <div className="toast__text">{toast.text}</div>
          </div>
        </div>
      );
  }
}
