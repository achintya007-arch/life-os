import { useEffect, useRef, useState } from 'react';
import { levelInfo } from '../../engine/leveling';

const SEGMENTS = 24;

type Phase = 'idle' | 'filling' | 'overflow' | 'reset';

/**
 * Segmented XP bar. When XP crosses a level, it fills to the brim, flashes,
 * empties, and fills again with the remainder — the classic, correct feeling.
 */
export function XpBar({ totalXp }: { totalXp: number }) {
  const info = levelInfo(totalXp);
  const [shown, setShown] = useState({ progress: info.progress, level: info.level });
  const [phase, setPhase] = useState<Phase>('idle');
  const [gain, setGain] = useState<{ key: number; amount: number } | null>(null);
  const prevXp = useRef(totalXp);

  useEffect(() => {
    const before = prevXp.current;
    prevXp.current = totalXp;
    if (before === totalXp) return;
    const target = levelInfo(totalXp);
    const timers: number[] = [];

    if (totalXp > before) setGain({ key: Date.now(), amount: totalXp - before });

    if (target.level > levelInfo(before).level) {
      setPhase('overflow');
      setShown((s) => ({ ...s, progress: 1 }));
      timers.push(
        window.setTimeout(() => {
          setPhase('reset');
          setShown({ progress: 0, level: target.level });
        }, 750),
        window.setTimeout(() => {
          setPhase('filling');
          setShown({ progress: target.progress, level: target.level });
        }, 820),
        window.setTimeout(() => setPhase('idle'), 1700),
      );
    } else {
      setPhase(totalXp > before ? 'filling' : 'reset');
      setShown({ progress: target.progress, level: target.level });
      timers.push(window.setTimeout(() => setPhase('idle'), 900));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [totalXp]);

  const litExact = shown.progress * SEGMENTS;

  return (
    <div className={`xpbar xpbar--${phase}`}>
      <div className="xpbar__track" role="progressbar" aria-valuemin={0} aria-valuemax={info.xpForLevel} aria-valuenow={info.xpIntoLevel} aria-label="Experience toward next level">
        <div className="xpbar__fill" style={{ width: `${shown.progress * 100}%` }} />
        <div className="xpbar__segments">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={i < Math.floor(litExact) ? 'is-lit' : i < litExact ? 'is-partial' : ''} />
          ))}
        </div>
        {gain && (
          <span key={gain.key} className="xpbar__gain mono">
            +{gain.amount}
          </span>
        )}
      </div>
    </div>
  );
}
