import { useCallback, useEffect, useMemo, useState } from 'react';
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
