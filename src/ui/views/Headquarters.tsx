import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRuntime } from '../../app/RuntimeContext';
import { useStore } from '../../store/GameContext';
import { DailyContracts } from '../hq/DailyContracts';
import { WeeklyGoals } from '../hq/WeeklyGoals';
import { findNeglectedQuest } from '../../engine/gameMaster';
import { toLocalDate } from '../../engine/dates';
import type { GameState, Quest } from '../../engine/types';
import { useCelebration } from '../celebration/Celebration';
import { CampaignPanel } from '../hq/CampaignPanel';
import { AttributePanel, CharacterHero } from '../hq/CharacterSheet';
import { GameMasterPanel } from '../hq/GameMasterPanel';
import { QuestComposer } from '../hq/QuestComposer';
import { QuestLog } from '../hq/QuestLog';
import { TrophyPanel } from '../hq/TrophyPanel';
import { Glyph } from '../components/Icon';

export function Headquarters({ state, now, onNavigate }: { state: GameState; now: Date; onNavigate: (view: 'vault') => void }) {
  const { overlayOpen } = useCelebration();
  const [composer, setComposer] = useState<{ quest?: Quest } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const today = toLocalDate(now);
  const spotlightId = useMemo(() => findNeglectedQuest(state, today)?.id ?? null, [state, today]);
  const runtime = useRuntime();
  const store = useStore();

  // Post today's contract board. Signed-in devices first check the cloud (briefly),
  // so a board already issued on another device is used instead of a new one.
  const hasBoard = !!state.dailies[today];
  useEffect(() => {
    if (hasBoard) return;
    let cancelled = false;
    void (async () => {
      if (runtime.session) {
        await Promise.race([runtime.sync().catch(() => null), new Promise((r) => window.setTimeout(r, 4000))]);
      }
      if (!cancelled && !store.getState().dailies[today]) store.dispatch({ type: 'issueDaily' });
    })();
    return () => {
      cancelled = true;
    };
  }, [today, hasBoard, runtime, store]);

  // "N" forges a new quest from anywhere on this screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (composer || overlayOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setComposer({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composer, overlayOpen]);

  // The floating button only appears once the quest log's own "New quest" button has scrolled away.
  const [fabVisible, setFabVisible] = useState(false);
  useEffect(() => {
    const check = () => {
      const target = document.querySelector('#quest-log .frame__actions');
      setFabVisible(!!target && target.getBoundingClientRect().bottom < 60);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  const focusQuest = useCallback((id: string) => {
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2600);
  }, []);

  return (
    <main className="hq">
      <CharacterHero state={state} now={now} onOpenVault={() => onNavigate('vault')} />
      <div className="hq__col hq__col--main">
        <DailyContracts state={state} now={now} onFocusQuest={focusQuest} />
        <QuestLog
          state={state}
          now={now}
          spotlightId={spotlightId}
          highlightId={highlightId}
          onNewQuest={() => setComposer({})}
          onEditQuest={(quest) => setComposer({ quest })}
        />
      </div>
      <div className="hq__col hq__col--rail">
        <GameMasterPanel state={state} now={now} onFocusQuest={focusQuest} />
        <WeeklyGoals state={state} now={now} />
        <CampaignPanel state={state} />
        <AttributePanel state={state} />
        <TrophyPanel state={state} onOpenVault={() => onNavigate('vault')} />
      </div>
      {!composer && fabVisible && (
        <button className="fab" onClick={() => setComposer({})} aria-label="New quest">
          <Glyph name="plus" size={22} />
        </button>
      )}
      {composer && <QuestComposer quest={composer.quest} onClose={() => setComposer(null)} />}
    </main>
  );
}
