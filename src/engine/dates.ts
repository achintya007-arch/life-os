/** A calendar day in the player's local timezone, formatted YYYY-MM-DD. */
export type LocalDate = string;

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && LOCAL_DATE_RE.test(value);
}

export function toLocalDate(d: Date): LocalDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toUtcDays(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return toUtcDays(b) - toUtcDays(a);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const ms = (toUtcDays(date) + days) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: LocalDate): number {
  const ms = toUtcDays(date) * 86_400_000;
  return (new Date(ms).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -weekdayIndex(date));
}

/** "2026-09" */
export type MonthKey = string;

export function monthKey(date: LocalDate): MonthKey {
  return date.slice(0, 7);
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
