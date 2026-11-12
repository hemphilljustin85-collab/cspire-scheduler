// The schedule as it looks in the app (week blocks: day headers, a row per
// person with coloured shifts, hours, daily coverage), as plain data. Print
// and Excel are both built from this, so they match the screen.

export type SheetCell = {
  /** Same text as the schedule dropdown, e.g. "8:30–5:30", "OFF", "PTO". */
  label: string;
  /** Tailwind colour classes, e.g. "bg-green-100 text-green-800". */
  className: string;
  hours: number;
  working: boolean;
  opener: boolean;
  closer: boolean;
};

export type SheetDay = {
  date: string;
  /** "Monday" … "Saturday" */
  name: string;
  /** Short date, e.g. "Nov 2". */
  dateLabel: string;
  /** False for days of the next/previous month in a month view (shown dimmed). */
  inMonth: boolean;
  /** Second header line, e.g. "2 open · 2 close" or "★ Thanksgiving · closed". */
  note?: string;
  holiday?: boolean;
};

export type SheetRow = {
  id: string;
  name: string;
  position?: string | null;
  cells: SheetCell[];
  hours: number;
  /** Colour classes for the hours badge (red over target, green on target, amber under). */
  hoursClassName: string;
};

export type SheetWeek = {
  /** e.g. "Week of Nov 2" */
  label: string;
  status?: string;
  days: SheetDay[];
  rows: SheetRow[];
  /** Under each day, e.g. "3 working". */
  footer: string[];
};

export type ScheduleSheetData = {
  title: string;
  subtitle?: string;
  weeks: SheetWeek[];
  legend: Array<{ label: string; className: string }>;
};

// Tailwind colours used by shifts, as hex (for Excel and inline print styles).
const BG_100: Record<string, string> = {
  slate: "F1F5F9", gray: "F3F4F6", zinc: "F4F4F5", red: "FEE2E2", orange: "FFEDD5", amber: "FEF3C7",
  yellow: "FEF9C3", lime: "ECFCCB", green: "DCFCE7", emerald: "D1FAE5", teal: "CCFBF1", cyan: "CFFAFE",
  sky: "E0F2FE", blue: "DBEAFE", indigo: "E0E7FF", violet: "EDE9FE", purple: "F3E8FF", fuchsia: "FAE8FF",
  pink: "FCE7F3", rose: "FFE4E6",
};
const TEXT_800: Record<string, string> = {
  slate: "1E293B", gray: "1F2937", zinc: "27272A", red: "991B1B", orange: "9A3412", amber: "92400E",
  yellow: "854D0E", lime: "3F6212", green: "166534", emerald: "065F46", teal: "115E59", cyan: "155E75",
  sky: "075985", blue: "1E40AF", indigo: "3730A3", violet: "5B21B6", purple: "6B21A8", fuchsia: "86198F",
  pink: "9D174D", rose: "9F1239",
};

/** Hex fill and text colours for a shift's Tailwind classes (null when not coloured). */
export function shiftColors(className: string): { fill: string; text: string } | null {
  const bg = className.match(/bg-([a-z]+)-\d+/)?.[1];
  const text = className.match(/text-([a-z]+)-\d+/)?.[1] ?? bg;
  if (!bg || !BG_100[bg]) return null;
  return { fill: BG_100[bg], text: TEXT_800[text ?? bg] ?? "1E293B" };
}

/** Same thresholds as the hours badge on the Schedule page. */
export function hoursClassName(hours: number, targetHours: number) {
  return hours > targetHours
    ? "bg-red-100 text-red-800"
    : hours >= targetHours - 2
      ? "bg-green-100 text-green-800"
      : "bg-amber-100 text-amber-800";
}
