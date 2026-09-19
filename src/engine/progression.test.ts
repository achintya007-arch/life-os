import { describe, expect, it } from 'vitest';
import { execute } from './commands';
import { dailyBudget, generateDailyBoard, splitBudget } from './contracts';
import { applyEvent, replay } from './project';
import { createHarness } from './testkit';
import type { GameEvent } from './types';

function withBoard(start = '2026-09-19T09:00:00') {
  const h = createHarness(start);
  h.begin('Hero');
  const issued = h.run({ type: 'issueDaily' });
  const board = h.state.dailies['2026-09-19']!;
  return { h, board, issued };
}

describe('classes', () => {
  it('adds +20% primary and +10% secondary XP as separate transactions', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'chooseClass', classId: 'bard' }); // CHA primary, DEX secondary
    h.complete(h.quest({ attribute: 'CHA', title: 'Call a friend' }));
    h.complete(h.quest({ attribute: 'DEX', title: 'Guitar' }));
    h.complete(h.quest({ attribute: 'INT', title: 'Read' }));
    const byReason = (r: string) => h.state.transactions.filter((t) => t.reason === r).map((t) => t.amount);
    expect(byReason('class')).toEqual([10, 5]);
    expect(h.state.totalXp).toBe(150 + 15);
    expect(h.state.character?.classId).toBe('bard');
  });

  it('wanderer gets a small bonus everywhere; no class means no bonus', () => {
    const h = createHarness();
    h.begin();
    h.complete(h.quest({ title: 'No class yet' }));
    expect(h.state.totalXp).toBe(50);
    h.run({ type: 'chooseClass', classId: 'wanderer' });
    h.complete(h.quest({ title: 'Now wandering' }));
    expect(h.state.totalXp).toBe(50 + 50 + 4); // 7% of 50, rounded
  });

  it('changing class only affects deeds after the change (replay-stable)', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'chooseClass', classId: 'brawler' });
    h.complete(h.quest({ attribute: 'STR', title: 'Gym' }));
    h.run({ type: 'chooseClass', classId: 'mage' });
    h.complete(h.quest({ attribute: 'STR', title: 'Gym again' }));
    expect(h.state.transactions.filter((t) => t.reason === 'class')).toHaveLength(1);
    expect(replay(h.store.getEvents())).toEqual(h.state);
  });

  it('rejects unknown classes and re-choosing the same class', () => {
    const h = createHarness();
    h.begin();
    expect(h.try({ type: 'chooseClass', classId: 'necromancer' as never }).ok).toBe(false);
    h.run({ type: 'chooseClass', classId: 'monk' });
    expect(h.try({ type: 'chooseClass', classId: 'monk' }).ok).toBe(false);
  });
});

describe('boss HP', () => {
  it('takes several strikes; only the last one defeats the boss', () => {
    const h = createHarness();
    h.begin();
    const boss = h.quest({ title: 'Ship the optimizer', tier: 'boss', attribute: 'INT', hits: 3 });
    const s1 = h.complete(boss);
    expect(s1.effects).toContainEqual(expect.objectContaining({ kind: 'deed', deed: expect.objectContaining({ strike: { n: 1, of: 3 }, tier: 'challenge', xp: 80 }) }));
    expect(h.state.quests[boss]!.status).toBe('active');
    h.complete(boss);
    const last = h.complete(boss);
    expect(h.state.quests[boss]!.status).toBe('cleared');
    expect(last.effects).toContainEqual(expect.objectContaining({ kind: 'deed', deed: expect.objectContaining({ strike: { n: 3, of: 3 }, tier: 'boss', xp: 500 }) }));
    expect(h.state.totalXp).toBe(80 + 80 + 500);
    expect(h.state.achievements['absolute-cinema']).toBeDefined();
    expect(h.try({ type: 'completeQuest', questId: boss }).ok).toBe(false);
  });

  it('GIANT SLAYER needs a 5+ HP boss', () => {
    const h = createHarness();
    h.begin();
    const boss = h.quest({ title: 'Marathon', tier: 'boss', hits: 5 });
    for (let i = 0; i < 5; i++) h.complete(boss);
    expect(h.state.achievements['giant-slayer']).toBeDefined();
  });

  it('validates HP', () => {
    const h = createHarness();
    h.begin();
    expect(h.try({ type: 'createQuest', quest: { title: 'x', tier: 'boss', attribute: 'INT', cadence: 'once', hits: 11 } }).ok).toBe(false);
    expect(h.try({ type: 'createQuest', quest: { title: 'x', tier: 'boss', attribute: 'INT', cadence: 'once', hits: 0 } }).ok).toBe(false);
  });
});

describe('daily contracts', () => {
  it('issues three contracts whose XP adds up exactly to the day’s budget', () => {
    const { board } = withBoard();
    expect(board.contracts).toHaveLength(3);
    expect(board.contracts.map((c) => c.kind)).toEqual(['daily', 'class', 'challenge']);
    expect(board.contracts.reduce((s, c) => s + c.xp, 0)).toBe(dailyBudget(1));
    expect(board.budget).toBe(dailyBudget(1));
  });

  it('budget grows with level and always splits exactly', () => {
    expect([1, 5, 10, 20].map(dailyBudget)).toEqual([100, 180, 280, 400]);
    for (let b = 100; b <= 400; b += 10) expect(splitBudget(b).reduce((s, x) => s + x, 0)).toBe(b);
  });

  it('is issued once per day; tomorrow brings a new board', () => {
    const { h } = withBoard();
    expect(h.try({ type: 'issueDaily' }).ok).toBe(false);
    h.setTime('2026-09-20T08:00:00');
    h.run({ type: 'issueDaily' });
    expect(Object.keys(h.state.dailies)).toEqual(['2026-09-19', '2026-09-20']);
  });

  it('pays exact XP — no class or rested bonus — and counts as a deed', () => {
    const h = createHarness('2026-09-10T09:00:00');
    h.begin();
    h.run({ type: 'chooseClass', classId: 'wanderer' });
    h.complete(h.quest({ title: 'old deed' }));
    h.setTime('2026-09-19T09:00:00'); // 9 days away: rested would apply to a quest
    h.run({ type: 'issueDaily' });
    const c = h.state.dailies['2026-09-19']!.contracts[0]!;
    const before = h.state.totalXp;
    h.run({ type: 'completeContract', contractId: c.id });
    expect(h.state.totalXp - before).toBe(c.xp);
    expect(h.state.deeds.at(-1)).toMatchObject({ kind: 'contract', xp: c.xp });
    expect(h.state.achievements.contractor).toBeDefined();
  });

  it('cannot be edited, completed twice, or completed after midnight', () => {
    const { h, board } = withBoard();
    const c = board.contracts[1]!;
    h.run({ type: 'completeContract', contractId: c.id });
    expect(h.try({ type: 'completeContract', contractId: c.id }).ok).toBe(false);
    h.setTime('2026-09-20T00:05:00');
    expect(h.try({ type: 'completeContract', contractId: board.contracts[2]!.id }).ok).toBe(false);
    // No command edits contracts at all.
    expect(h.try({ type: 'editQuest', questId: c.id, changes: { title: 'easier' } }).ok).toBe(false);
  });

  it('a clean sweep fires the sweep effect and the achievement', () => {
    const { h, board } = withBoard();
    let last;
    for (const c of board.contracts) last = h.run({ type: 'completeContract', contractId: c.id });
    expect(last!.effects).toContainEqual({ kind: 'dailySweep', date: '2026-09-19', xp: board.budget });
    expect(h.state.achievements['clean-sweep']).toBeDefined();
  });

  it('the Game Master’s challenge targets a quest you’ve been avoiding', () => {
    const h = createHarness('2026-09-10T09:00:00');
    h.begin();
    const avoided = h.quest({ title: 'Write the thesis intro', tier: 'challenge', attribute: 'INT' });
    h.setTime('2026-09-19T09:00:00');
    h.run({ type: 'issueDaily' });
    const challenge = h.state.dailies['2026-09-19']!.contracts[2]!;
    expect(challenge).toMatchObject({ kind: 'challenge', questId: avoided, attribute: 'INT' });
    expect(challenge.title).toContain('Write the thesis intro');
  });

  it('generation is deterministic for the same character, date and history', () => {
    const { h } = withBoard();
    const s = h.state;
    const a = generateDailyBoard({ ...s, dailies: {} }, '2026-09-21', 'x');
    const b = generateDailyBoard({ ...s, dailies: {} }, '2026-09-21', 'x');
    expect(a).toEqual(b);
    const other = generateDailyBoard({ ...s, dailies: {} }, '2026-09-22', 'x');
    expect(other.contracts.map((c) => c.key)).not.toEqual(a.contracts.map((c) => c.key));
  });

  it('avoids repeating yesterday’s tasks', () => {
    const { h } = withBoard();
    h.setTime('2026-09-20T09:00:00');
    h.run({ type: 'issueDaily' });
    const y = new Set(h.state.dailies['2026-09-19']!.contracts.map((c) => c.key));
    expect(h.state.dailies['2026-09-20']!.contracts.filter((c) => y.has(c.key))).toEqual([]);
  });

  it('two devices issuing the same day: the first board in canonical order wins', () => {
    const { h, issued } = withBoard();
    const dup: GameEvent = { ...(issued.events[0] as GameEvent), id: 'other-device-board' };
    const after = applyEvent(h.state, dup).state;
    expect(after.dailies['2026-09-19']).toEqual(h.state.dailies['2026-09-19']);
  });

  it('contract completions can be undone', () => {
    const { h, board } = withBoard();
    const r = h.run({ type: 'completeContract', contractId: board.contracts[0]!.id });
    h.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    expect(h.state.dailies['2026-09-19']!.completed).toEqual([]);
    expect(h.state.totalXp).toBe(0);
  });
});

describe('weekly goals', () => {
  it('pays a one-time bonus when met, counting the whole week', () => {
    const h = createHarness('2026-09-14T10:00:00'); // Monday
    h.begin();
    const guitar = h.quest({ title: 'Practice guitar', cadence: 'daily', attribute: 'DEX' });
    h.complete(guitar); // Monday, before the goal exists — still counts
    h.setTime('2026-09-15T10:00:00');
    h.run({ type: 'setWeeklyGoal', label: 'Guitar 3× this week', target: 3, match: { questId: guitar } });
    expect(Object.values(h.state.weeklyGoals)[0]!.progress).toBe(1);
    h.complete(guitar);
    h.setTime('2026-09-16T10:00:00');
    const met = h.complete(guitar);
    expect(met.effects).toContainEqual(expect.objectContaining({ kind: 'weeklyGoalMet', bonus: 60 }));
    expect(h.state.transactions.filter((t) => t.reason === 'weekly').map((t) => t.amount)).toEqual([60]);
    h.setTime('2026-09-17T10:00:00');
    h.complete(guitar); // over-achieving never pays twice
    expect(h.state.transactions.filter((t) => t.reason === 'weekly')).toHaveLength(1);
    expect(h.state.achievements['weekly-winner']).toBeDefined();
  });

  it('attribute goals count any deed in that attribute, only within the week', () => {
    const h = createHarness('2026-09-14T10:00:00');
    h.begin();
    h.run({ type: 'setWeeklyGoal', label: 'Move 2×', target: 2, match: { attribute: 'STR' } });
    h.complete(h.quest({ title: 'Run', attribute: 'STR' }));
    h.setTime('2026-09-21T10:00:00'); // next Monday: different week
    h.complete(h.quest({ title: 'Run again', attribute: 'STR' }));
    expect(Object.values(h.state.weeklyGoals)[0]).toMatchObject({ progress: 1, status: 'active' });
  });

  it('limits goals per week and can remove them without penalty', () => {
    const h = createHarness();
    h.begin();
    for (let i = 0; i < 3; i++) h.run({ type: 'setWeeklyGoal', label: `G${i}`, target: 2, match: { attribute: 'INT' } });
    expect(h.try({ type: 'setWeeklyGoal', label: 'G4', target: 2, match: { attribute: 'INT' } }).ok).toBe(false);
    const id = h.state.weeklyGoalOrder[0]!;
    h.run({ type: 'removeWeeklyGoal', goalId: id });
    expect(h.state.weeklyGoals[id]!.status).toBe('removed');
    expect(h.state.totalXp).toBe(0);
  });

  it('undoing the deed that met a goal takes the bonus back (replay)', () => {
    const h = createHarness('2026-09-14T10:00:00');
    h.begin();
    h.run({ type: 'setWeeklyGoal', label: 'Read 1×', target: 1, match: { attribute: 'INT' } });
    const r = h.complete(h.quest({ title: 'Read', attribute: 'INT' }));
    expect(h.state.totalXp).toBe(50 + 20);
    h.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    expect(h.state.totalXp).toBe(0);
    expect(Object.values(h.state.weeklyGoals)[0]).toMatchObject({ progress: 0, status: 'active' });
  });
});

describe('interests', () => {
  it('are cleaned, de-duplicated and capped', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['  Guitar ', 'guitar', "Rubik's cube", ''] });
    expect(h.state.interests).toEqual(['Guitar', "Rubik's cube"]);
    expect(h.try({ type: 'setInterests', interests: Array.from({ length: 9 }, (_, i) => `x${i}`) }).ok).toBe(false);
  });
});

it('everything new replays identically from a serialized log', () => {
  const { h, board } = withBoard();
  h.run({ type: 'chooseClass', classId: 'archer' });
  h.run({ type: 'setWeeklyGoal', label: 'Hands', target: 2, match: { attribute: 'DEX' } });
  h.run({ type: 'completeContract', contractId: board.contracts[0]!.id });
  const boss = h.quest({ title: 'Boss', tier: 'boss', hits: 2 });
  h.complete(boss);
  const log = JSON.parse(JSON.stringify(h.store.getEvents()));
  expect(replay(log)).toEqual(h.state);
  // And commands never mutate state they were given.
  expect(execute(h.state, { type: 'issueDaily' }, { now: new Date('2026-09-19T12:00:00'), newId: () => 'z' }).ok).toBe(false);
});
