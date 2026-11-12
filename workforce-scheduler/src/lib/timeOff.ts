// Days off requests (stored in employee_time_off).
//
// Each request is either:
//   - "pto": the person uses paid time off; the schedule shows PTO (paid hours).
//   - "off": a regular unpaid day off; the schedule shows OFF (0 hours).
// Requests saved before the request_type column existed count as PTO.

export type TimeOffType = "pto" | "off";

export const TIME_OFF_TYPES: Record<TimeOffType, { label: string; badge: string; description: string; code: "PTO" | "OFF"; className: string }> = {
  pto: {
    label: "Use PTO",
    badge: "PTO",
    description: "Paid time off. Shows as PTO on the schedule and counts paid hours.",
    code: "PTO",
    className: "bg-purple-100 text-purple-800",
  },
  off: {
    label: "Day off (no PTO)",
    badge: "Day off",
    description: "A regular unpaid day off. Shows as OFF on the schedule with 0 hours.",
    code: "OFF",
    className: "bg-slate-200 text-slate-800",
  },
};

export function timeOffType(record: { request_type?: string | null }): TimeOffType {
  return record.request_type === "off" ? "off" : "pto";
}

/** Schedule code an approved request locks in: PTO or OFF. */
export function timeOffCode(record: { request_type?: string | null }) {
  return TIME_OFF_TYPES[timeOffType(record)].code;
}

/** One-time database change that adds the request type. */
export const TIME_OFF_TYPE_SQL = `alter table public.employee_time_off
  add column if not exists request_type text not null default 'pto'
  check (request_type in ('pto', 'off'));`;

/** True when Supabase says the request_type column doesn't exist yet. */
export function isMissingTypeColumn(message: string) {
  return message.includes("request_type");
}
