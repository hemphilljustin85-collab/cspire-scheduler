// Per-person closing preferences, set on the Rules page:
//   - "avoid_closing_days": days they'd rather not close, e.g. "Thursday" or "Thursday,Friday".
//   - "closing_pattern": "together" (closing shifts back-to-back) or "apart" (spread out).
// These are preferences: Auto Generate follows them when it can, and the
// schedule check shows a heads-up when they aren't met.

export const AVOID_CLOSING_RULE = "avoid_closing_days";
export const CLOSING_PATTERN_RULE = "closing_pattern";

export type ClosingPattern = "together" | "apart";

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type RuleLike = {
  rule_type: string;
  rule_value: string;
  employee_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

function addDays(value: string, count: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + count);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function appliesToWeek(rule: RuleLike, weekStart: string) {
  if (rule.start_date && rule.start_date > addDays(weekStart, 5)) return false;
  if (rule.end_date && rule.end_date < weekStart) return false;
  return true;
}

export function parseClosingPattern(value: string): ClosingPattern | null {
  const text = value.trim().toLowerCase();
  if (["together", "consecutive", "back-to-back", "back to back"].includes(text)) return "together";
  if (["apart", "spread", "spread out", "not consecutive"].includes(text)) return "apart";
  return null;
}

export function parseAvoidDays(value: string): number[] {
  return value
    .split(",")
    .map((day) => WEEKDAY_NAMES.indexOf(day.trim().toLowerCase()))
    .filter((day) => day >= 0);
}

/** One person's closing preferences for a week. */
export function closingPrefsFor(rules: RuleLike[], employeeId: string, weekStart: string) {
  const own = rules.filter((rule) => rule.employee_id === employeeId && appliesToWeek(rule, weekStart));
  const avoidDays = new Set(own.filter((rule) => rule.rule_type === AVOID_CLOSING_RULE).flatMap((rule) => parseAvoidDays(rule.rule_value)));
  const patternRule = own.find((rule) => rule.rule_type === CLOSING_PATTERN_RULE);
  return { avoidDays, pattern: patternRule ? parseClosingPattern(patternRule.rule_value) : null };
}
