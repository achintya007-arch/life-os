/**
 * Development-only demo history: ~two weeks of play, then five days away.
 * Exercises the comeback path (rested XP, GM welcome back, neglected-quest spotlight).
 * Usage in the dev console: lifeosSeed()
 */
import { toLocalDate } from '../engine/dates';
import type { GameEvent, QuestDraft } from '../engine/types';

export function buildDemoHistory(now = new Date(), name = 'Achintya'): GameEvent[] {
  const events: GameEvent[] = [];
  let n = 0;
  const id = () => `demo-${++n}`;
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const moment = (d: Date) => ({ localDate: toLocalDate(d), localHour: d.getHours() });

  events.push({ id: id(), at: at(16, 9).toISOString(), type: 'character.created', name });

  const quests: Record<string, string> = {};
  const quest = (daysAgo: number, key: string, draft: QuestDraft) => {
    const d = at(daysAgo, 9, 5);
    quests[key] = id();
    events.push({ id: id(), at: d.toISOString(), ...moment(d), type: 'quest.created', questId: quests[key]!, quest: draft });
  };
  quest(16, 'guitar', { title: 'Practice guitar for 30 minutes', tier: 'standard', attribute: 'DEX', cadence: 'daily' });
  quest(16, 'water', { title: 'Drink water', tier: 'tiny', attribute: 'VIT', cadence: 'daily' });
  quest(16, 'gym', { title: 'Gym session', tier: 'standard', attribute: 'STR', cadence: 'daily' });
  quest(15, 'repo', { title: 'Implement gate cancellation rule', tier: 'challenge', attribute: 'INT', cadence: 'once' });
  quest(14, 'call', { title: 'Call mom', tier: 'standard', attribute: 'CHA', cadence: 'once' });
  quest(12, 'paper', { title: 'Read the ZX-calculus paper', tier: 'challenge', attribute: 'INT', cadence: 'once' });
  quest(12, 'ship', { title: 'Ship the Quantum Circuit Optimizer', tier: 'boss', attribute: 'INT', cadence: 'once' });

  const complete = (daysAgo: number, key: string, hour: number) => {
    const d = at(daysAgo, hour, 10);
    events.push({ id: id(), at: d.toISOString(), ...moment(d), type: 'quest.completed', questId: quests[key]! });
  };
  for (const d of [16, 15, 14, 12, 11, 9, 8, 6]) {
    complete(d, 'water', 10);
    complete(d, 'guitar', 21);
  }
  for (const d of [15, 13, 11, 8]) complete(d, 'gym', 7);
  complete(13, 'call', 18);
  complete(9, 'repo', 23);

  const campaignId = id();
  const chapters = [
    'Learn quantum fundamentals',
    'Build first Qiskit project',
    'Build circuit optimizer',
    'Benchmark against transpiler',
    'Research project',
  ].map((title) => ({ id: id(), title }));
  events.push({
    id: id(),
    at: at(16, 9, 30).toISOString(),
    type: 'campaign.created',
    campaignId,
    name: 'Become a Quantum Engineer',
    attribute: 'INT',
    chapters,
  });
  for (const [i, daysAgo] of [
    [0, 14],
    [1, 7],
  ] as const) {
    const d = at(daysAgo, 20);
    events.push({ id: id(), at: d.toISOString(), ...moment(d), type: 'campaign.chapterCleared', campaignId, chapterId: chapters[i]!.id });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
