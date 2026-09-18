/** Test harness: a GameStore with a controllable clock and deterministic ids. */
import { GameStore } from '../store/gameStore';
import { MemoryEventStore } from '../store/eventStore';
import type { Command } from './commands';
import type { QuestDraft } from './types';

export function createHarness(start = '2026-09-01T10:00:00') {
  let now = new Date(start);
  let seq = 0;
  const persistence = new MemoryEventStore();
  const store = new GameStore(persistence, () => ({ now: new Date(now), newId: () => `id-${++seq}` }), []);

  const run = (command: Command) => {
    const r = store.dispatch(command);
    if (!r.ok) throw new Error(`Command ${command.type} failed: ${r.error}`);
    return r;
  };

  return {
    store,
    persistence,
    get state() {
      return store.getState();
    },
    setTime(iso: string) {
      now = new Date(iso);
    },
    advanceMinutes(min: number) {
      now = new Date(now.getTime() + min * 60_000);
    },
    run,
    try: (command: Command) => store.dispatch(command),
    begin(name = 'Tester') {
      run({ type: 'createCharacter', name });
    },
    quest(partial: Partial<QuestDraft> = {}): string {
      const r = run({
        type: 'createQuest',
        quest: { title: 'Practice guitar', tier: 'standard', attribute: 'DEX', cadence: 'once', ...partial },
      });
      const e = r.events[0]!;
      if (e.type !== 'quest.created') throw new Error('expected quest.created');
      return e.questId;
    },
    complete(questId: string) {
      return run({ type: 'completeQuest', questId });
    },
  };
}
