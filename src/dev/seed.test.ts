import { describe, expect, it } from 'vitest';
import { execute } from '../engine/commands';
import { briefing } from '../engine/gameMaster';
import { applyEvent, replay } from '../engine/project';
import { parseSave, toSaveFile } from '../store/eventStore';
import { buildDemoHistory } from './seed';

describe('demo history / comeback path', () => {
  const now = new Date('2026-09-17T19:30:00');
  const events = buildDemoHistory(now);
  const state = replay(events);

  it('is a valid save that replays cleanly', () => {
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(events))))).toHaveLength(events.length);
    expect(state.deeds.length).toBe(16 + 4 + 2 + 2);
    expect(state.lastActiveDate).toBe('2026-09-11');
  });

  it('greets a returning player warmly, with no penalty language', () => {
    const b = briefing(state, now);
    expect(b.salutation).toBe('WELCOME BACK, ADVENTURER.');
    expect(b.restedActive).toBe(true);
    const text = [b.salutation, ...b.lines].join(' ').toLowerCase();
    for (const word of ['lost', 'failed', 'missed', 'broke']) expect(text).not.toContain(word);
  });

  it('rewards the first deed of the return with rested XP and THE COMEBACK', () => {
    const guitar = state.questOrder.map((id) => state.quests[id]!).find((q) => q.title.startsWith('Practice guitar'))!;
    const r = execute(state, { type: 'completeQuest', questId: guitar.id }, { now, newId: () => 'return-1' }, events);
    if (!r.ok) throw new Error(r.error);
    const { effects } = applyEvent(state, r.events[0]!);
    expect(effects).toContainEqual(expect.objectContaining({ kind: 'deed', restedBonus: 25 }));
    expect(effects).toContainEqual({ kind: 'achievement', achievementId: 'the-comeback' });
  });

  it('spotlights a neglected quest once the player is active again', () => {
    const b = briefing(state, new Date('2026-09-12T10:00:00'));
    expect(b.spotlight).not.toBeNull();
  });
});
