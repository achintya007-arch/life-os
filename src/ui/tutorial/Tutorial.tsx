/**
 * A short first-run tour: a spotlight walks the new player through the
 * headquarters one panel at a time. Skippable at any point, replayable from
 * the System menu, and shown automatically only once per character on a device.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';

interface Step {
  /** CSS selector for the panel to spotlight; none = a centered card. */
  target?: string;
  kicker: string;
  title: string;
  body: string[];
}

const steps = (name: string): Step[] => [
  {
    kicker: 'TUTORIAL · 60 SECONDS',
    title: `Welcome, ${name}.`,
    body: [
      'LIFE//OS turns your real life into an RPG. Do real things, tick them off here, earn XP, level up.',
      'Here’s the quick tour of your headquarters.',
    ],
  },
  {
    target: '.hero',
    kicker: 'YOUR CHARACTER',
    title: 'This is you.',
    body: [
      'Your level, your XP, and five attributes: Strength, Intellect, Dexterity, Vitality, Charisma. Every deed grows one of them.',
      'Tap your class or interest chips any time to change them.',
    ],
  },
  {
    target: '#daily-contracts',
    kicker: 'DAILY CONTRACTS',
    title: 'Three jobs from the system, every day.',
    body: [
      'The game picks these for you, based on your class, your interests and what you’ve been avoiding. You can’t edit them. That’s the challenge.',
      'Did it in real life? Tap the ◇ to claim the XP. Miss them and nothing bad happens; midnight brings a new board.',
    ],
  },
  {
    target: '#quest-log',
    kicker: 'QUEST LOG',
    title: 'Your own quests live here.',
    body: [
      'Add anything that matters to you with + (or press N). Daily quests repeat, one-time quests clear, and boss quests take several days to defeat.',
      'Bigger quests pay more XP. Be honest: the only person you can cheat here is you.',
    ],
  },
  {
    target: '.gm',
    kicker: 'GAME MASTER',
    title: 'Your guide has opinions.',
    body: [
      'The Game Master briefs you each day, reacts to what you do, and proposes quests. Hit ACCEPT on one to fill your log in a single tap.',
    ],
  },
  {
    target: '.goals',
    kicker: 'THIS WEEK',
    title: 'Optional weekly goals.',
    body: ['“Guitar 3×”, “Move 4×”. Set up to three and hit them for bonus XP. They reset every Monday.'],
  },
  {
    kicker: 'ONE LAST THING',
    title: 'No streaks. No guilt.',
    body: [
      'Missing a day never costs you anything. Come back after a break and you get a rested bonus instead.',
      'Start small: claim your first contract today.',
    ],
  },
];

const PAD = 8;
const MOBILE = 640;

export function Tutorial({ name, onDone }: { name: string; onDone: () => void }) {
  const all = steps(name);
  // Panels that aren't on screen (e.g. hidden on some layouts) are skipped.
  const [list] = useState(() => all.filter((s) => !s.target || document.querySelector(s.target)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(window.innerWidth);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = list[i]!;
  const last = i === list.length - 1;

  const measure = useCallback(() => {
    setVw(window.innerWidth);
    const el = step.target ? document.querySelector(step.target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step.target]);

  // Bring the panel into view, just below the top bar.
  useLayoutEffect(() => {
    const el = step.target ? document.querySelector(step.target) : null;
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    measure();
  }, [step.target, measure]);

  useEffect(() => {
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
    };
  }, [measure]);

  const go = useCallback(
    (d: number) => {
      const n = i + d;
      if (n < 0) return;
      if (n >= list.length) return onDone();
      sfx.play('tick');
      setI(n);
    },
    [i, list.length, onDone],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') e.stopPropagation(); // no quest composer mid-tour
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDone();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onDone]);

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('.tutorial__next')?.focus({ preventScroll: true });
  }, [i]);

  // Where the card goes: under the panel if it fits, above it if not; a bottom sheet on phones.
  const mobile = vw < MOBILE;
  let placement: React.CSSProperties = {};
  let mode: 'center' | 'sheet' | 'float' = 'center';
  if (rect) {
    if (mobile) mode = 'sheet';
    else {
      mode = 'float';
      const cardH = cardRef.current?.offsetHeight ?? 240;
      const cardW = Math.min(400, vw - 32);
      const left = Math.min(Math.max(16, rect.left), vw - cardW - 16);
      const below = rect.bottom + PAD + 12;
      const above = rect.top - PAD - 12 - cardH;
      if (below + cardH < window.innerHeight - 12) placement = { top: below, left, width: cardW };
      else if (above > 70) placement = { top: above, left, width: cardW };
      else placement = { bottom: 24, left, width: cardW };
    }
  }

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="Tutorial">
      {rect ? (
        <div
          className="tutorial__spot"
          style={{
            top: Math.max(rect.top - PAD, 64),
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: Math.max(0, Math.min(rect.bottom + PAD, window.innerHeight) - Math.max(rect.top - PAD, 64)),
          }}
          aria-hidden
        />
      ) : (
        <div className="tutorial__veil" aria-hidden />
      )}
      <div ref={cardRef} className={`tutorial__card frame tutorial__card--${mode}`} style={placement} key={i}>
        <i className="frame__corner frame__corner--tl" aria-hidden />
        <i className="frame__corner frame__corner--br" aria-hidden />
        <div className="tutorial__kicker mono">
          <span>{step.kicker}</span>
          <span className="dim">
            {i + 1}/{list.length}
          </span>
        </div>
        <h2 className="tutorial__title">{step.title}</h2>
        {step.body.map((p) => (
          <p key={p} className="tutorial__body">
            {p}
          </p>
        ))}
        <div className="tutorial__dots" aria-hidden>
          {list.map((_, n) => (
            <i key={n} className={n === i ? 'is-on' : n < i ? 'is-past' : ''} />
          ))}
        </div>
        <footer className="tutorial__actions">
          {!last && (
            <button className="tutorial__skip mono" onClick={onDone}>
              SKIP TOUR
            </button>
          )}
          <span className="tutorial__nav">
            {i > 0 && (
              <button className="btn btn--ghost" onClick={() => go(-1)}>
                BACK
              </button>
            )}
            <button className="btn btn--gold tutorial__next" onClick={() => go(1)}>
              {i === 0 ? 'SHOW ME' : last ? 'LET’S PLAY' : 'NEXT'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────── first-run memory ─────────────────────────── */

const key = (characterId: string) => `lifeos:tutorial-seen:${characterId}`;

export function tutorialSeen(characterId: string): boolean {
  try {
    return localStorage.getItem(key(characterId)) === '1';
  } catch {
    return true; // storage blocked: don't nag every visit
  }
}

export function markTutorialSeen(characterId: string) {
  try {
    localStorage.setItem(key(characterId), '1');
  } catch {
    /* ignore */
  }
}
