import { describe, expect, it } from 'vitest';
import { replay } from './project';
import { createHarness } from './testkit';
import { displayTitle } from './titles';

describe('character', () => {
  it('requires a name and only one character', () => {
    const h = createHarness();
    expect(h.try({ type: 'createCharacter', name: '   ' }).ok).toBe(false);
    h.begin('Achintya');
    expect(h.state.character?.name).toBe('Achintya');
    expect(h.try({ type: 'createCharacter', name: 'Again' }).ok).toBe(false);
  });

  it('rejects gameplay before a character exists', () => {
    const h = createHarness();
    const r = h.try({ type: 'createQuest', quest: { title: 'x', tier: 'tiny', attribute: 'VIT', cadence: 'once' } });
    expect(r.ok).toBe(false);
  });
});

describe('quest creation', () => {
  it('validates input', () => {
    const h = createHarness();
    h.begin();
    const bad = (quest: object) => h.try({ type: 'createQuest', quest: quest as never }).ok;
    expect(bad({ title: '', tier: 'tiny', attribute: 'VIT', cadence: 'once' })).toBe(false);
    expect(bad({ title: 'x'.repeat(101), tier: 'tiny', attribute: 'VIT', cadence: 'once' })).toBe(false);
    expect(bad({ title: 'ok', tier: 'legendary', attribute: 'VIT', cadence: 'once' })).toBe(false);
    expect(bad({ title: 'ok', tier: 'tiny', attribute: 'LUK', cadence: 'once' })).toBe(false);
    expect(bad({ title: 'ok', tier: 'tiny', attribute: 'VIT', cadence: 'hourly' })).toBe(false);
  });

  it('normalizes whitespace in titles', () => {
    const h = createHarness();
    h.begin();
    const id = h.quest({ title: '   Practice    guitar  ' });
    expect(h.state.quests[id]!.title).toBe('Practice guitar');
  });
});

describe('quest completion', () => {
  it('awards tier XP as a transaction, to character and attribute', () => {
    const h = createHarness();
    h.begin();
    const id = h.quest({ tier: 'standard', attribute: 'DEX' });
    const r = h.complete(id);
    expect(h.state.totalXp).toBe(50);
    expect(h.state.attributeXp.DEX).toBe(50);
    expect(h.state.transactions).toHaveLength(1);
    expect(h.state.transactions[0]).toMatchObject({ amount: 50, reason: 'quest', attribute: 'DEX' });
    expect(h.state.quests[id]!.status).toBe('cleared');
    expect(r.effects.some((e) => e.kind === 'deed')).toBe(true);
  });

  it('refuses to complete a one-time quest twice', () => {
    const h = createHarness();
    h.begin();
    const id = h.quest();
    h.complete(id);
    const second = h.try({ type: 'completeQuest', questId: id });
    expect(second.ok).toBe(false);
    expect(h.state.totalXp).toBe(50);
  });

  it('allows daily quests once per day, resetting the next day', () => {
    const h = createHarness('2026-09-01T09:00:00');
    h.begin();
    const id = h.quest({ cadence: 'daily', tier: 'tiny', title: 'Drink water', attribute: 'VIT' });
    h.complete(id);
    h.advanceMinutes(60);
    expect(h.try({ type: 'completeQuest', questId: id }).ok).toBe(false);
    h.setTime('2026-09-02T08:00:00');
    h.complete(id);
    expect(h.state.quests[id]!.timesCompleted).toBe(2);
    expect(h.state.quests[id]!.status).toBe('active');
    expect(h.state.totalXp).toBe(20);
  });

  it('cannot complete retired quests', () => {
    const h = createHarness();
    h.begin();
    const id = h.quest();
    h.run({ type: 'retireQuest', questId: id });
    expect(h.try({ type: 'completeQuest', questId: id }).ok).toBe(false);
  });

  it('emits a level-up effect when crossing a threshold', () => {
    const h = createHarness();
    h.begin();
    h.complete(h.quest());
    const r = h.complete(h.quest());
    expect(r.effects).toContainEqual({ kind: 'levelUp', from: 1, to: 2 });
    expect(r.effects).toContainEqual({ kind: 'titleUnlocked', titleId: 'wanderer' });
  });

  it('can jump multiple levels from one boss quest', () => {
    const h = createHarness();
    h.begin();
    const r = h.complete(h.quest({ tier: 'boss', title: 'Ship the optimizer' }));
    expect(r.effects).toContainEqual({ kind: 'levelUp', from: 1, to: 3 });
  });

  it('emits attribute rank-ups', () => {
    const h = createHarness();
    h.begin();
    const r = h.complete(h.quest({ attribute: 'STR', title: 'Gym' }));
    expect(r.effects).toContainEqual({ kind: 'attributeUp', attribute: 'STR', from: 1, to: 2 });
  });
});

describe('rested XP (coming back is rewarded)', () => {
  it('grants a bonus on the first deed after 3+ days away', () => {
    const h = createHarness('2026-09-01T10:00:00');
    h.begin();
    h.complete(h.quest());
    h.setTime('2026-09-05T10:00:00');
    const r = h.complete(h.quest({ title: 'Read' }));
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: 'deed', restedBonus: 25 }));
    expect(h.state.totalXp).toBe(50 + 50 + 25);
    expect(h.state.achievements['the-comeback']).toBeDefined();
    // Only the first deed of the return.
    const r2 = h.complete(h.quest({ title: 'Read more' }));
    expect(r2.effects).toContainEqual(expect.objectContaining({ kind: 'deed', restedBonus: 0 }));
  });

  it('does not trigger after a short gap', () => {
    const h = createHarness('2026-09-01T10:00:00');
    h.begin();
    h.complete(h.quest());
    h.setTime('2026-09-03T10:00:00');
    h.complete(h.quest({ title: 'Read' }));
    expect(h.state.totalXp).toBe(100);
  });

  it('has a minimum bonus for tiny quests', () => {
    const h = createHarness('2026-09-01T10:00:00');
    h.begin();
    h.complete(h.quest({ tier: 'tiny' }));
    h.setTime('2026-09-10T10:00:00');
    h.complete(h.quest({ tier: 'tiny', title: 'Floss' }));
    expect(h.state.totalXp).toBe(10 + 10 + 10);
  });
});

describe('achievements', () => {
  it('unlocks FIRST BLOOD on the first deed only once', () => {
    const h = createHarness();
    h.begin();
    const r1 = h.complete(h.quest());
    expect(r1.effects).toContainEqual({ kind: 'achievement', achievementId: 'first-blood' });
    const r2 = h.complete(h.quest({ title: 'Another' }));
    expect(r2.effects.filter((e) => e.kind === 'achievement' && e.achievementId === 'first-blood')).toHaveLength(0);
  });

  it('GETTING SERIOUS at 5 and HAT TRICK at 3 in a day', () => {
    const h = createHarness('2026-09-01T10:00:00');
    h.begin();
    for (let i = 0; i < 3; i++) h.complete(h.quest({ title: `Q${i}` }));
    expect(h.state.achievements['hat-trick']).toBeDefined();
    expect(h.state.achievements['getting-serious']).toBeUndefined();
    for (let i = 3; i < 5; i++) h.complete(h.quest({ title: `Q${i}` }));
    expect(h.state.achievements['getting-serious']).toBeDefined();
  });

  it('GRINDING at 1,000 XP', () => {
    const h = createHarness();
    h.begin();
    h.complete(h.quest({ tier: 'boss', title: 'A' }));
    expect(h.state.achievements.grinding).toBeUndefined();
    h.complete(h.quest({ tier: 'boss', title: 'B' }));
    expect(h.state.achievements.grinding).toBeDefined();
  });

  it('NIGHT OWL and EARLY BIRD use the local hour captured at completion', () => {
    const h = createHarness('2026-09-01T02:30:00');
    h.begin();
    h.complete(h.quest());
    expect(h.state.achievements['night-owl']).toBeDefined();
    h.setTime('2026-09-01T06:15:00');
    h.complete(h.quest({ title: 'Morning run' }));
    expect(h.state.achievements['early-bird']).toBeDefined();
    expect(h.state.achievements['touch-grass']).toBeDefined();
  });

  it('ABSOLUTE CINEMA for bosses; RENAISSANCE for all attributes', () => {
    const h = createHarness();
    h.begin();
    h.complete(h.quest({ tier: 'boss', attribute: 'INT', title: 'Finish thesis' }));
    expect(h.state.achievements['absolute-cinema']).toBeDefined();
    for (const a of ['STR', 'DEX', 'VIT', 'CHA'] as const) h.complete(h.quest({ attribute: a, title: a }));
    expect(h.state.achievements.renaissance).toBeDefined();
  });

  it('SPEEDRUN within a minute; WHY SO LONG after a week', () => {
    const h = createHarness('2026-09-01T10:00:00');
    h.begin();
    const slow = h.quest({ title: 'Slow' });
    const early = h.quest({ title: 'Early quick' });
    h.complete(early);
    expect(h.state.achievements.speedrun).toBeUndefined(); // not during the first few deeds
    for (let i = 0; i < 4; i++) h.complete(h.quest({ title: `Warmup ${i}` }));
    h.advanceMinutes(5);
    const fast = h.quest({ title: 'Quick' });
    h.advanceMinutes(0.5);
    h.complete(fast);
    expect(h.state.achievements.speedrun).toBeDefined();
    h.setTime('2026-09-09T10:00:00');
    h.complete(slow);
    expect(h.state.achievements['why-so-long']).toBeDefined();
  });

  it('achievement titles become equippable', () => {
    const h = createHarness();
    h.begin();
    expect(h.try({ type: 'equipTitle', titleId: 'blooded' }).ok).toBe(false);
    h.complete(h.quest());
    h.run({ type: 'equipTitle', titleId: 'blooded' });
    expect(displayTitle(h.state).name).toBe('Blooded');
  });
});

describe('campaigns', () => {
  it('clears chapters in order and completes with a bonus', () => {
    const h = createHarness();
    h.begin();
    const r = h.run({ type: 'createCampaign', name: 'Become a quantum engineer', attribute: 'INT', chapters: ['Basics', 'Build'] });
    const e = r.events[0]!;
    if (e.type !== 'campaign.created') throw new Error();
    const [c1, c2] = e.chapters;
    expect(h.try({ type: 'clearChapter', campaignId: e.campaignId, chapterId: c2!.id }).ok).toBe(false);
    h.run({ type: 'clearChapter', campaignId: e.campaignId, chapterId: c1!.id });
    expect(h.state.totalXp).toBe(150);
    const done = h.run({ type: 'clearChapter', campaignId: e.campaignId, chapterId: c2!.id });
    expect(h.state.totalXp).toBe(150 + 150 + 500);
    expect(h.state.campaigns[e.campaignId]!.status).toBe('complete');
    expect(done.effects).toContainEqual({ kind: 'campaignComplete', campaignId: e.campaignId });
    expect(h.state.achievements['the-long-game']).toBeDefined();
  });

  it('validates chapter counts', () => {
    const h = createHarness();
    h.begin();
    expect(h.try({ type: 'createCampaign', name: 'X', attribute: 'INT', chapters: [] }).ok).toBe(false);
    expect(h.try({ type: 'createCampaign', name: 'X', attribute: 'INT', chapters: ['  ', ''] }).ok).toBe(false);
  });
});

describe('undo', () => {
  it('reverts XP, quest status, and achievements', () => {
    const h = createHarness();
    h.begin();
    const id = h.quest();
    const r = h.complete(id);
    h.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    expect(h.state.totalXp).toBe(0);
    expect(h.state.transactions).toHaveLength(0);
    expect(h.state.quests[id]!.status).toBe('active');
    expect(h.state.achievements['first-blood']).toBeUndefined();
    // And it can be completed again.
    h.complete(id);
    expect(h.state.totalXp).toBe(50);
  });

  it('cannot undo twice or undo non-deeds', () => {
    const h = createHarness();
    h.begin();
    const r = h.complete(h.quest());
    h.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    expect(h.try({ type: 'undoDeed', eventId: r.events[0]!.id }).ok).toBe(false);
    expect(h.try({ type: 'undoDeed', eventId: h.store.getEvents()[0]!.id }).ok).toBe(false);
  });
});

describe('determinism & persistence', () => {
  it('replaying the saved log reproduces the exact state', () => {
    const h = createHarness('2026-09-01T23:30:00');
    h.begin();
    const a = h.quest({ cadence: 'daily', title: 'Drink water', tier: 'tiny', attribute: 'VIT' });
    h.complete(a);
    h.setTime('2026-09-06T01:00:00');
    h.complete(a);
    const b = h.quest({ tier: 'boss', title: 'Ship it' });
    const r = h.complete(b);
    h.run({ type: 'undoDeed', eventId: r.events[0]!.id });
    h.complete(b);

    const saved = JSON.parse(JSON.stringify(h.persistence.load()));
    expect(replay(saved)).toEqual(h.state);
  });

  it('a failed save does not change state', () => {
    const h = createHarness();
    h.begin();
    h.persistence.save = () => {
      throw new Error('quota');
    };
    const r = h.try({ type: 'createQuest', quest: { title: 'x', tier: 'tiny', attribute: 'VIT', cadence: 'once' } });
    expect(r.ok).toBe(false);
    expect(h.state.questOrder).toHaveLength(0);
  });
});
