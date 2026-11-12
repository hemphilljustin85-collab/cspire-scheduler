// Shared shift definitions and helpers.
//
// Every business defines its own shifts on the Shifts page. The scheduler
// figures out which shifts count as "opening", "middle" and "closing" from
// their start and end times, so nothing here depends on one company's hours.

export type ShiftDefinition = {
  code: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  className: string;
  starter?: boolean;
};

export type CustomShiftRow = {
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  paid_hours: number;
  color: string;
};

/** Codes that mean "not working a shift". */
export const NON_WORKING_CODES = ["OFF", "PTO", "HOLIDAY"];

export const STATUS_SHIFTS: ShiftDefinition[] = [
  { code: "OFF", label: "OFF", start_time: null, end_time: null, hours: 0, className: "bg-slate-100 text-slate-700" },
  { code: "PTO", label: "PTO", start_time: null, end_time: null, hours: 8, className: "bg-purple-100 text-purple-800" },
  { code: "HOLIDAY", label: "Holiday", start_time: null, end_time: null, hours: 8, className: "bg-amber-100 text-amber-800" },
];

/**
 * Starter shifts that come with every new workspace so the schedule works on
 * day one. Managers can hide them on the Shifts page once they add their own.
 * Codes stay the same so previously saved schedules keep displaying correctly.
 */
export const STARTER_SHIFTS: ShiftDefinition[] = [
  { code: "830-530", label: "8:30–5:30", start_time: "08:30", end_time: "17:30", hours: 8, className: "bg-emerald-100 text-emerald-800", starter: true },
  { code: "1030-715", label: "10:30–7:15", start_time: "10:30", end_time: "19:15", hours: 7.75, className: "bg-red-100 text-red-800", starter: true },
];

/**
 * Shifts that used to be starters. They are never offered or auto-scheduled,
 * but are kept so saved schedules that used them still show the right label.
 */
export const RETIRED_SHIFTS: ShiftDefinition[] = [
  { code: "815-530", label: "8:15–5:30", start_time: "08:15", end_time: "17:30", hours: 8.25, className: "bg-green-100 text-green-800" },
  { code: "900-600", label: "9:00–6:00", start_time: "09:00", end_time: "18:00", hours: 8, className: "bg-blue-100 text-blue-800" },
];

/** Shifts that can still be assigned (status codes plus current starters). */
export const ASSIGNABLE_BUILT_IN_SHIFTS: ShiftDefinition[] = [...STATUS_SHIFTS, ...STARTER_SHIFTS];

/** Working on a holiday with shortened business hours (times come from the holiday). */
export const HOLIDAY_SHORT_CODE = "HOLIDAY_SHORT";

/** Display-only definition; the schedule builder fills in each holiday's times and hours. */
export const HOLIDAY_SHORT_SHIFT: ShiftDefinition = {
  code: HOLIDAY_SHORT_CODE,
  label: "Holiday short day",
  start_time: null,
  end_time: null,
  hours: 0,
  className: "bg-orange-100 text-orange-800",
};

/** Every built-in code, including retired ones, for displaying saved schedules. */
export const BUILT_IN_SHIFTS: ShiftDefinition[] = [...ASSIGNABLE_BUILT_IN_SHIFTS, HOLIDAY_SHORT_SHIFT, ...RETIRED_SHIFTS];

export const SHIFT_COLORS = ["cyan", "indigo", "pink", "orange", "teal", "lime"] as const;

export const CUSTOM_COLOR_CLASSES: Record<string, string> = {
  cyan: "bg-cyan-100 text-cyan-800",
  indigo: "bg-indigo-100 text-indigo-800",
  pink: "bg-pink-100 text-pink-800",
  orange: "bg-orange-100 text-orange-800",
  teal: "bg-teal-100 text-teal-800",
  lime: "bg-lime-100 text-lime-800",
};

/** Global rule (stored in ai_rules) that hides the starter shifts. */
export const STARTER_SHIFTS_RULE = "starter_shifts";
export const STARTER_SHIFTS_HIDDEN = "hidden";

export function customShiftToDefinition(shift: CustomShiftRow): ShiftDefinition {
  return {
    code: shift.code,
    label: shift.name,
    start_time: shift.start_time,
    end_time: shift.end_time,
    hours: Number(shift.paid_hours),
    className: CUSTOM_COLOR_CLASSES[shift.color] || CUSTOM_COLOR_CLASSES.cyan,
  };
}

export function isWorkingCode(code: string) {
  return !NON_WORKING_CODES.includes(code);
}

/** Turn a short code nobody recognizes into something readable. */
export function fallbackShift(code: string): ShiftDefinition {
  const known = BUILT_IN_SHIFTS.find((shift) => shift.code === code);
  if (known) return known;
  return { code, label: code, start_time: null, end_time: null, hours: 0, className: "bg-slate-100 text-slate-700" };
}

function minutes(time: string | null) {
  if (!time) return null;
  const [hours, mins] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

function endMinutes(shift: ShiftDefinition) {
  const start = minutes(shift.start_time);
  const end = minutes(shift.end_time);
  if (start === null || end === null) return null;
  // Overnight shifts (e.g. 10pm–6am) end the next day.
  return end <= start ? end + 24 * 60 : end;
}

export type ShiftRoles = {
  /** Working shifts that start at (or within 30 minutes of) the earliest start. */
  openers: string[];
  /** Working shifts that end at (or within 30 minutes of) the latest end. */
  closers: string[];
  /** Everything else. */
  mids: string[];
  /** Shift used to fill a regular day when no opener/closer is needed. */
  defaultShift: string | null;
};

const ROLE_WINDOW_MINUTES = 30;

/**
 * Work out opening / middle / closing shifts from times instead of
 * hard-coded codes. Works for any business hours.
 */
export function classifyShiftRoles(shifts: ShiftDefinition[]): ShiftRoles {
  const working = shifts.filter(
    (shift) => isWorkingCode(shift.code) && minutes(shift.start_time) !== null && endMinutes(shift) !== null,
  );

  if (working.length === 0) {
    return { openers: [], closers: [], mids: [], defaultShift: null };
  }

  const earliestStart = Math.min(...working.map((shift) => minutes(shift.start_time)!));
  const latestEnd = Math.max(...working.map((shift) => endMinutes(shift)!));

  const openers = working
    .filter((shift) => minutes(shift.start_time)! - earliestStart <= ROLE_WINDOW_MINUTES)
    .sort((a, b) => minutes(a.start_time)! - minutes(b.start_time)!)
    .map((shift) => shift.code);

  const closers = working
    .filter((shift) => latestEnd - endMinutes(shift)! <= ROLE_WINDOW_MINUTES)
    .sort((a, b) => endMinutes(b)! - endMinutes(a)!)
    .map((shift) => shift.code);

  const mids = working
    .filter((shift) => !openers.includes(shift.code) && !closers.includes(shift.code))
    .map((shift) => shift.code);

  // Prefer a middle shift; otherwise the latest-starting opener that isn't
  // the earliest one (the earliest is often limited to certain days);
  // otherwise the longest working shift.
  const byHours = [...working].sort((a, b) => b.hours - a.hours);
  const laterOpener = openers.length > 1 ? openers[openers.length - 1] : undefined;
  const defaultShift = mids[0] ?? laterOpener ?? byHours[0]?.code ?? null;

  return { openers, closers, mids, defaultShift };
}
