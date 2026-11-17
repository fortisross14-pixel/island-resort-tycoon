/**
 * The calendar (Pass 4): each simulated "day" of the schedule is shown as a **month**, and the
 * clock inside it as the day of that month. Twelve months make a year. The sim keeps its
 * minute-based schedule (07:00–23:00); this module only maps it to dates for display and goals.
 */
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_MONTH = 30;

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = NAMES.map((n) => n.slice(0, 3));

/** Schedule minutes that map onto the month: from the start of the day to the night report. */
const OPEN = 7 * 60;
const CLOSE = 23 * 60;

/** Month 1 is January of year 1. */
export function monthName(month: number, short = false): string {
  const i = (((month - 1) % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  return short ? SHORT[i] : NAMES[i];
}

export function yearOf(month: number): number {
  return Math.floor((month - 1) / MONTHS_PER_YEAR) + 1;
}

/** Day of the month (1–30) for a time in the schedule. */
export function dayOfMonth(minutes: number): number {
  const t = (minutes - OPEN) / (CLOSE - OPEN);
  return Math.min(DAYS_PER_MONTH, Math.max(1, 1 + Math.floor(t * DAYS_PER_MONTH)));
}

/** "Mar 14" for the clock chip. */
export function dateText(month: number, minutes: number): string {
  return `${monthName(month, true)} ${dayOfMonth(minutes)}`;
}

/** "March, year 2" for reports and goals. */
export function monthYear(month: number): string {
  return `${monthName(month)}, year ${yearOf(month)}`;
}

/** A span of months as "8 months", "1 year" or "2 years 3 months". */
export function duration(months: number): string {
  const y = Math.floor(months / MONTHS_PER_YEAR);
  const m = months % MONTHS_PER_YEAR;
  const ys = y ? `${y} year${y === 1 ? '' : 's'}` : '';
  const ms = m ? `${m} month${m === 1 ? '' : 's'}` : '';
  return [ys, ms].filter(Boolean).join(' ') || '0 months';
}
