/**
 * Tests for the digest date route utility functions.
 *
 * These are extracted/mirrored here so we can test them without spinning up
 * a Next.js server. The actual page uses identical logic.
 */
import { describe, it, expect } from 'vitest';

// ─── Utilities under test (mirrored from the page) ─────────────────────────

/** YYYY-MM-DD format and not in the future */
function isValidHistoryDate(dateStr: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return dateStr <= today;
}

/** Human-readable display format */
function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Group DigestDate entries by YYYY-MM month key */
function groupByMonth<T extends { date: string }>(
  dates: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of dates) {
    const [year, month] = item.date.split('-');
    const key = `${year}-${month}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

// ─── isValidHistoryDate ──────────────────────────────────────────────────────

describe('isValidHistoryDate', () => {
  const TODAY = '2026-03-06';

  it('accepts a valid past date', () => {
    expect(isValidHistoryDate('2026-03-03', TODAY)).toBe(true);
  });

  it('accepts today\'s date', () => {
    expect(isValidHistoryDate('2026-03-06', TODAY)).toBe(true);
  });

  it('rejects a future date', () => {
    expect(isValidHistoryDate('2026-03-07', TODAY)).toBe(false);
    expect(isValidHistoryDate('2027-01-01', TODAY)).toBe(false);
  });

  it('rejects strings that are not YYYY-MM-DD', () => {
    expect(isValidHistoryDate('', TODAY)).toBe(false);
    expect(isValidHistoryDate('not-a-date', TODAY)).toBe(false);
    expect(isValidHistoryDate('2026/03/06', TODAY)).toBe(false);
    expect(isValidHistoryDate('06-03-2026', TODAY)).toBe(false);
    expect(isValidHistoryDate('2026-3-6', TODAY)).toBe(false);
  });

  it('rejects SQL injection attempt strings', () => {
    expect(isValidHistoryDate("'; DROP TABLE papers; --", TODAY)).toBe(false);
    expect(isValidHistoryDate('../../../etc/passwd', TODAY)).toBe(false);
  });
});

// ─── formatDisplayDate ───────────────────────────────────────────────────────

describe('formatDisplayDate', () => {
  it('formats 2026-03-03 as the correct day and month', () => {
    const result = formatDisplayDate('2026-03-03');
    expect(result).toContain('March');
    expect(result).toContain('3');
    expect(result).toContain('2026');
  });

  it('includes the weekday name', () => {
    // 2026-03-03 is a Tuesday
    const result = formatDisplayDate('2026-03-03');
    expect(result).toContain('Tuesday');
  });

  it('handles month boundaries correctly', () => {
    const result = formatDisplayDate('2026-02-28');
    expect(result).toContain('February');
    expect(result).toContain('28');
  });
});

// ─── groupByMonth ────────────────────────────────────────────────────────────

describe('groupByMonth', () => {
  const dates = [
    { date: '2026-03-04', paperCount: 127 },
    { date: '2026-03-03', paperCount: 159 },
    { date: '2026-03-02', paperCount: 144 },
    { date: '2026-02-28', paperCount: 8 },
    { date: '2026-02-27', paperCount: 118 },
  ];

  it('groups dates into correct months', () => {
    const groups = groupByMonth(dates);
    expect(Object.keys(groups).sort()).toEqual(['2026-02', '2026-03']);
  });

  it('puts March dates in 2026-03 group', () => {
    const groups = groupByMonth(dates);
    expect(groups['2026-03']).toHaveLength(3);
    expect(groups['2026-03'].map((d) => d.date)).toContain('2026-03-04');
  });

  it('puts February dates in 2026-02 group', () => {
    const groups = groupByMonth(dates);
    expect(groups['2026-02']).toHaveLength(2);
    expect(groups['2026-02'].map((d) => d.date)).toContain('2026-02-28');
  });

  it('returns empty object for empty input', () => {
    expect(groupByMonth([])).toEqual({});
  });

  it('handles a single entry', () => {
    const result = groupByMonth([{ date: '2026-03-01', paperCount: 50 }]);
    expect(result['2026-03']).toHaveLength(1);
  });

  it('preserves all fields on each entry', () => {
    const groups = groupByMonth(dates);
    for (const monthEntries of Object.values(groups)) {
      for (const entry of monthEntries) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('paperCount');
      }
    }
  });
});
