import { describe, expect, it } from 'vitest';
import { generateDailyBoard } from './contracts';
import { addDays } from './dates';
import { suggestQuests } from './gameMaster';
import { INTEREST_CATALOG } from './interestCatalog';
import { activeInterests, declaredInterests, guessAttribute, inferredInterests, interestTasks, matchInterest, tasksForRank } from './interests';
import { replay } from './project';
import { createHarness } from './testkit';
import type { GameState } from './types';

function boardsFor(state: GameState, days: number, from = '2026-09-19') {
  return Array.from({ length: days }, (_, i) => generateDailyBoard(state, addDays(from, i), `${addDays(from, i)}T08:00:00.000Z`));
}

describe('interest catalog', () => {
  it('covers every effort at every rank, with unique keys', () => {
    const keys = new Set<string>();
    for (const def of INTEREST_CATALOG) {
      for (const rank of [1, 2, 3] as const) {
        const tasks = tasksForRank(def.tasks, rank);
        for (const effort of [1, 2, 3]) expect(tasks.some((t) => t.effort === effort), `${def.id} r${rank} e${effort}`).toBe(true);
      }
      for (const t of def.tasks) {
        expect(keys.has(t.key), t.key).toBe(false);
        keys.add(t.key);
      }
    }
    expect(INTEREST_CATALOG.length).toBeGreaterThanOrEqual(24);
  });

  it('matches free text and quest titles to the right interest', () => {
    expect(matchInterest("Rubik's cube")?.id).toBe('rubiks-cube');
    expect(matchInterest('speedcubing')?.id).toBe('rubiks-cube');
    expect(matchInterest('playing GUITAR daily')?.id).toBe('guitar');
    expect(matchInterest('Read for 20 minutes')?.id).toBe('reading');
    expect(matchInterest('Learn Spanish')?.id).toBe('languages');
    expect(matchInterest('pottery')).toBeNull();
    expect(matchInterest('run errands')).toBeNull(); // "run" alone is too vague to mean running
  });

  it('guesses a sensible attribute for unknown interests', () => {
    expect(guessAttribute('Rock climbing')).toBe('STR');
    expect(guessAttribute('Philosophy')).toBe('INT');
    expect(guessAttribute('Volunteering')).toBe('CHA');
    expect(guessAttribute('Pottery')).toBe('DEX');
  });
});

describe('personalised contracts', () => {
  it('a guitarist gets guitar; a cuber gets cubing — every day', () => {
    const g = createHarness();
    g.begin('Guitarist');
    g.run({ type: 'setInterests', interests: ['guitar'] });
    const c = createHarness();
    c.begin('Cuber');
    c.run({ type: 'setInterests', interests: ["Rubik's cube"] });

    for (const b of boardsFor(g.state, 14)) expect(b.contracts[1]).toMatchObject({ kind: 'interest', interest: 'Guitar' });
    for (const b of boardsFor(c.state, 14)) expect(b.contracts[1]).toMatchObject({ kind: 'interest', interest: "Rubik's Cube" });
  });

  it('rotates between several interests and still leaves room for the class', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'chooseClass', classId: 'brawler' });
    h.run({ type: 'setInterests', interests: ['guitar', 'chess'] });
    const boards = boardsFor(h.state, 30);
    const focus = new Set(boards.map((b) => b.contracts[1]!.interest));
    expect(focus).toEqual(new Set(['Guitar', 'Chess']));
    const slot3 = boards.map((b) => b.contracts[2]!);
    expect(slot3.some((c) => c.interest)).toBe(true);
    expect(slot3.some((c) => !c.interest && c.attribute === 'VIT')).toBe(true); // brawler secondary
  });

  it('without interests, slot 2 is the class craft as before', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'chooseClass', classId: 'mage' });
    for (const b of boardsFor(h.state, 7)) expect(b.contracts[1]).toMatchObject({ kind: 'class', attribute: 'INT' });
  });

  it('custom interests get generic tasks in their own words', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['Pottery'] });
    const tasks = interestTasks(h.state);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.interest === 'Pottery' && t.attribute === 'DEX' && t.title.includes('Pottery'))).toBe(true);
    expect(boardsFor(h.state, 1)[0]!.contracts[1]!.title).toContain('Pottery');
  });
});

describe('rank', () => {
  it('a seasoned player skips the beginner tasks', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['guitar'], levels: { guitar: 3 } });
    const keys = interestTasks(h.state).map((t) => t.key);
    expect(keys).toContain('i-guitar-record');
    expect(keys).not.toContain('i-guitar-chords');
    expect(declaredInterests(h.state)[0]).toMatchObject({ declaredRank: 3, rank: 3 });
  });

  it('is earned through practice: 12 guitar deeds make an Adept', () => {
    const h = createHarness('2026-09-01T09:00:00');
    h.begin();
    h.run({ type: 'setInterests', interests: ['guitar'] });
    const q = h.quest({ title: 'Practice guitar', cadence: 'daily' });
    for (let d = 0; d < 11; d++) {
      h.setTime(`${addDays('2026-09-01', d)}T09:00:00`);
      h.complete(q);
    }
    expect(declaredInterests(h.state)[0]).toMatchObject({ experience: 11, rank: 1 });
    h.setTime('2026-09-12T09:00:00');
    h.complete(q);
    expect(declaredInterests(h.state)[0]).toMatchObject({ experience: 12, rank: 2 });
  });

  it('fulfilled interest contracts count as experience', () => {
    const h = createHarness('2026-09-19T09:00:00');
    h.begin();
    h.run({ type: 'setInterests', interests: ['chess'] });
    h.run({ type: 'issueDaily' });
    const c = h.state.dailies['2026-09-19']!.contracts.find((x) => x.interest === 'Chess')!;
    h.run({ type: 'completeContract', contractId: c.id });
    expect(declaredInterests(h.state)[0]!.experience).toBe(1);
  });
});

describe('inference', () => {
  it('notices an interest in the quest log, feeds it to contracts, and respects a dismissal', () => {
    const h = createHarness('2026-09-10T09:00:00');
    h.begin();
    const q = h.quest({ title: "Solve the Rubik's cube", cadence: 'daily' });
    expect(inferredInterests(h.state)).toHaveLength(0); // one active quest = score 2
    h.complete(q);
    expect(inferredInterests(h.state).map((i) => i.id)).toEqual(['rubiks-cube']);
    expect(activeInterests(h.state).map((i) => i.source)).toEqual(['inferred']);
    expect(boardsFor(h.state, 1)[0]!.contracts[1]!.interest).toBe("Rubik's Cube");

    h.run({ type: 'setInterests', interests: [], dismissed: ['rubiks-cube'] });
    expect(inferredInterests(h.state)).toHaveLength(0);
  });

  it('a declared interest is never also inferred', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['cubing'] });
    const q = h.quest({ title: 'Cube practice', cadence: 'daily' });
    h.complete(q);
    expect(inferredInterests(h.state)).toHaveLength(0);
    expect(activeInterests(h.state).map((i) => i.id)).toEqual(['rubiks-cube']);
  });
});

describe('profile events', () => {
  it('keeps levels only for declared interests and dismissals only for catalog ids', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['Guitar', 'Pottery'], levels: { guitar: 2, pottery: 3, chess: 3, bogus: 9 }, dismissed: ['chess', 'nope'] });
    expect(h.state.interestLevels).toEqual({ guitar: 2, pottery: 3 });
    expect(h.state.dismissedInterests).toEqual(['chess']);
    // Omitted levels carry over for interests that remain.
    h.run({ type: 'setInterests', interests: ['Guitar'] });
    expect(h.state.interestLevels).toEqual({ guitar: 2 });
    expect(h.state.dismissedInterests).toEqual(['chess']);
    expect(replay(h.store.getEvents())).toEqual(h.state);
  });
});

describe('game master', () => {
  it('suggests a quest for the player’s interest first', () => {
    const h = createHarness();
    h.begin();
    h.run({ type: 'setInterests', interests: ['guitar'] });
    const s = suggestQuests(h.state, new Date('2026-09-19T09:00:00'));
    expect(s[0]).toMatchObject({ title: 'Practice guitar for 20 minutes', attribute: 'DEX', cadence: 'daily' });
  });
});
