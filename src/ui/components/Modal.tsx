import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from './Icon';

/** Open modals, so nested ones (System → Link) only release the page when the last closes. */
let openModals = 0;

export function Modal({
  title,
  kicker,
  onClose,
  children,
  wide,
}: {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    // Hold the page still: on iOS a swipe past the end of a modal otherwise scrolls the HQ behind it.
    if (openModals++ === 0) document.documentElement.classList.add('is-modal-open');
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>('input, textarea, button');
    first?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      if (--openModals === 0) document.documentElement.classList.remove('is-modal-open');
      previouslyFocused?.focus?.();
    };
  }, []);

  // Portaled to <body>: panels are isolated stacking contexts (and the view animates with a
  // transform), so a modal rendered in place would sit under later panels and the top bar.
  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal__panel frame ${wide ? 'modal__panel--wide' : ''}`} ref={panelRef} role="dialog" aria-modal="true" aria-label={title}>
        <i className="frame__corner frame__corner--tl" aria-hidden />
        <i className="frame__corner frame__corner--br" aria-hidden />
        <header className="modal__header">
          <div>
            {kicker && <div className="modal__kicker mono">{kicker}</div>}
            <h2 className="modal__title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Glyph name="close" size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
