// Holidays the business observes.
//
// Each observed holiday is stored as one global row in ai_rules
// (rule_type "holiday", start_date = end_date = the holiday date, and the
// settings as JSON in rule_value), so no database changes are needed.
//
// A holiday is either:
//   - closed: nobody works; everyone gets HOLIDAY for the day.
//   - short:  open with shortened hours; people who work get the
//             HOLIDAY_SHORT shift for those hours, everyone else gets HOLIDAY.
// Each holiday decides whether it is paid and for how many hours.

import { HOLIDAY_SHORT_CODE, type ShiftDefinition } from "./shifts";

export const HOLIDAY_RULE = "holiday";

export type HolidayMode = "closed" | "short";

export type HolidaySettings = {
  name: string;
  mode: HolidayMode;
  /** Business hours on a short day, "HH:MM". */
  open: string;
  close: string;
  paid: boolean;
  /** Paid holiday hours for each person (used when paid is true). */
  paidHours: number;
  /** "us" for a preloaded US holiday, "custom" for one the manager added. */
  source: "us" | "custom";
};

export type Holiday = HolidaySettings & {
  id?: string;
  date: string;
};

export type HolidayRuleRow = {
  id?: string;
  rule_type: string;
  rule_value: string;
  employee_id: string | null;
  start_date: string | null;
  end_date?: string | null;
};

export const DEFAULT_HOLIDAY_SETTINGS: Omit<HolidaySettings, "name" | "source"> = {
  mode: "closed",
  open: "09:00",
  close: "15:00",
  paid: true,
  paidHours: 8,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The nth weekday of a month (weekday 0 = Sunday, month 1-12). */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(year, month - 1, 1).getDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return isoDate(year, month, day);
}

/** The last given weekday of a month. */
function lastWeekday(year: number, month: number, weekday: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const last = new Date(year, month - 1, lastDay).getDay();
  return isoDate(year, month, lastDay - ((last - weekday + 7) % 7));
}

function nextDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);
  return isoDate(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

/** Common US holidays for a year, on their actual calendar dates. */
export function usHolidays(year: number): Array<{ name: string; date: string }> {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    { name: "New Year's Day", date: isoDate(year, 1, 1) },
    { name: "Martin Luther King Jr. Day", date: nthWeekday(year, 1, 1, 3) },
    { name: "Presidents' Day", date: nthWeekday(year, 2, 1, 3) },
    { name: "Memorial Day", date: lastWeekday(year, 5, 1) },
    { name: "Juneteenth", date: isoDate(year, 6, 19) },
    { name: "Independence Day", date: isoDate(year, 7, 4) },
    { name: "Labor Day", date: nthWeekday(year, 9, 1, 1) },
    { name: "Columbus Day / Indigenous Peoples' Day", date: nthWeekday(year, 10, 1, 2) },
    { name: "Veterans Day", date: isoDate(year, 11, 11) },
    { name: "Thanksgiving", date: thanksgiving },
    { name: "Day after Thanksgiving", date: nextDay(thanksgiving) },
    { name: "Christmas Eve", date: isoDate(year, 12, 24) },
    { name: "Christmas Day", date: isoDate(year, 12, 25) },
    { name: "New Year's Eve", date: isoDate(year, 12, 31) },
  ];
}

export function isSunday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() === 0;
}

export function holidayToRule(holiday: Holiday): Omit<HolidayRuleRow, "id"> {
  const settings: HolidaySettings = {
    name: holiday.name.trim(),
    mode: holiday.mode,
    open: holiday.open,
    close: holiday.close,
    paid: holiday.paid,
    paidHours: holiday.paidHours,
    source: holiday.source,
  };
  return {
    employee_id: null,
    rule_type: HOLIDAY_RULE,
    rule_value: JSON.stringify(settings),
    start_date: holiday.date,
    end_date: holiday.date,
  };
}

export function ruleToHoliday(rule: HolidayRuleRow): Holiday | null {
  if (rule.rule_type !== HOLIDAY_RULE || rule.employee_id || !rule.start_date) return null;
  let parsed: Partial<HolidaySettings> = {};
  try {
    parsed = JSON.parse(rule.rule_value) as Partial<HolidaySettings>;
  } catch {
    parsed = { name: rule.rule_value };
  }
  const paidHours = Number(parsed.paidHours);
  return {
    id: rule.id,
    date: rule.start_date,
    name: parsed.name || "Holiday",
    mode: parsed.mode === "short" ? "short" : "closed",
    open: parsed.open || DEFAULT_HOLIDAY_SETTINGS.open,
    close: parsed.close || DEFAULT_HOLIDAY_SETTINGS.close,
    paid: parsed.paid !== false,
    paidHours: Number.isFinite(paidHours) && paidHours >= 0 ? paidHours : DEFAULT_HOLIDAY_SETTINGS.paidHours,
    source: parsed.source === "us" ? "us" : "custom",
  };
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + (mins || 0);
}

/** Hours the business is open on a short day. */
export function shortDayHours(holiday: Holiday) {
  const span = minutes(holiday.close) - minutes(holiday.open);
  return span > 0 ? Math.round((span / 60) * 100) / 100 : 0;
}

export function formatTime(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return mins ? `${hour12}:${pad(mins)}` : `${hour12}`;
}

/** Paid hours for someone who is off on this holiday. */
export function holidayOffHours(holiday: Holiday) {
  return holiday.paid ? holiday.paidHours : 0;
}

/**
 * Hours counted for someone who works the short day: the hours worked,
 * topped up to the paid holiday hours when the holiday is paid.
 */
export function holidayWorkedHours(holiday: Holiday) {
  const worked = shortDayHours(holiday);
  return holiday.paid ? Math.max(worked, holiday.paidHours) : worked;
}

/**
 * The shift definition to use for a HOLIDAY or HOLIDAY_SHORT cell on a date,
 * or null when the code isn't a holiday code or the date isn't a holiday.
 */
export function holidayShiftFor(code: string, holiday: Holiday | undefined): ShiftDefinition | null {
  if (!holiday) return null;
  if (code === "HOLIDAY") {
    return {
      code,
      label: holiday.paid ? `${holiday.name} (off, paid)` : `${holiday.name} (off)`,
      start_time: null,
      end_time: null,
      hours: holidayOffHours(holiday),
      className: "bg-amber-100 text-amber-800",
    };
  }
  if (code === HOLIDAY_SHORT_CODE && holiday.mode === "short") {
    return {
      code,
      label: `Short day ${formatTime(holiday.open)}–${formatTime(holiday.close)}`,
      start_time: holiday.open,
      end_time: holiday.close,
      hours: holidayWorkedHours(holiday),
      className: "bg-orange-100 text-orange-800",
    };
  }
  return null;
}
