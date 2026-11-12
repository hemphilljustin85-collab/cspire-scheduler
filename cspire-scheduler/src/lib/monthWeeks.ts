// Month helpers shared by pages that show a whole month of Monday–Saturday weeks.

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "YYYY-MM-01" for the month containing a date (default: today). */
export function firstOfMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonths(month: string, count: number) {
  const date = parseDate(month);
  return firstOfMonth(new Date(date.getFullYear(), date.getMonth() + count, 1));
}

/** Mondays of every Monday–Saturday week that has at least one day in the month. */
export function monthWeekStarts(month: string): string[] {
  const first = parseDate(month);
  if (first.getDay() === 0) first.setDate(2);
  const last = formatDate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const starts: string[] = [];
  const monday = new Date(first);
  monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));
  for (let current = formatDate(monday); current <= last; ) {
    starts.push(current);
    const next = parseDate(current);
    next.setDate(next.getDate() + 7);
    current = formatDate(next);
  }
  return starts;
}

/** The month's own Monday–Saturday dates. */
export function monthWorkDates(month: string) {
  const first = parseDate(month);
  const dates: Array<{ date: string; weekday: number }> = [];
  for (let date = new Date(first); date.getMonth() === first.getMonth(); date.setDate(date.getDate() + 1)) {
    const weekday = (date.getDay() + 6) % 7;
    if (weekday < 6) dates.push({ date: formatDate(date), weekday });
  }
  return dates;
}
