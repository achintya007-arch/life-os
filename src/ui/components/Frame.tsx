import type { ReactNode } from 'react';

/** The HUD panel: hairline border, clipped corner, bracket accents. Not a card. */
export function Frame({
  label,
  index,
  actions,
  className = '',
  children,
  as: Tag = 'section',
  id,
}: {
  label?: ReactNode;
  index?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  as?: 'section' | 'aside' | 'div';
  id?: string;
}) {
  return (
    <Tag className={`frame ${className}`} id={id}>
      <i className="frame__corner frame__corner--tl" aria-hidden />
      <i className="frame__corner frame__corner--br" aria-hidden />
      {(label || actions) && (
        <header className="frame__header">
          {label && (
            <h2 className="frame__label mono">
              {index && <span className="frame__index">{index}</span>}
              {label}
            </h2>
          )}
          {actions && <div className="frame__actions">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
