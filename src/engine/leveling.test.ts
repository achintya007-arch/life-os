import { describe, expect, it } from 'vitest';
import { attributeRank, attributeRankInfo, levelInfo, totalXpForLevel, xpToNextLevel } from './leveling';

describe('level curve', () => {
  it('starts at level 1 with zero XP', () => {
    expect(levelInfo(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForLevel: 100, progress: 0 });
  });

  it('matches the documented early curve', () => {
    expect([1, 2, 3, 5, 10, 20].map(xpToNextLevel)).toEqual([100, 180, 280, 530, 1310, 3360]);
  });

  it('levels up exactly at the threshold, not before', () => {
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(100).xpIntoLevel).toBe(0);
    expect(levelInfo(279).level).toBe(2);
    expect(levelInfo(280).level).toBe(3);
  });

  it('is consistent with totalXpForLevel', () => {
    for (let l = 1; l < 40; l++) {
      expect(levelInfo(totalXpForLevel(l)).level).toBe(l);
      expect(levelInfo(totalXpForLevel(l) - 1).level).toBe(Math.max(1, l - 1));
    }
  });

  it('costs strictly more per level as you climb', () => {
    for (let l = 1; l < 100; l++) expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
  });

  it('handles negative and fractional input safely', () => {
    expect(levelInfo(-50).level).toBe(1);
    expect(levelInfo(99.9).level).toBe(1);
  });

  it('can jump several levels at once', () => {
    expect(levelInfo(totalXpForLevel(6)).level).toBe(6);
  });
});

describe('attribute ranks', () => {
  it('follows 25·(r−1)² thresholds', () => {
    expect(attributeRank(0)).toBe(1);
    expect(attributeRank(24)).toBe(1);
    expect(attributeRank(25)).toBe(2);
    expect(attributeRank(100)).toBe(3);
    expect(attributeRank(2500)).toBe(11);
  });

  it('reports progress within a rank', () => {
    const info = attributeRankInfo(50);
    expect(info.rank).toBe(2);
    expect(info.xpToNext).toBe(50);
    expect(info.progress).toBeCloseTo(25 / 75);
  });
});
