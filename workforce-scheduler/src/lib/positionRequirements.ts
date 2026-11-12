// Opening/closing requirements by position, set on the Positions page.
//
//   minimum: "At least 1 Store Manager or Assistant Manager must open [on these days]."
//   pairing: "ASR I can't open unless a Store Manager or Assistant Manager also opens."
//
// Each requirement is one store-wide ai_rules row (rule_type
// "position_requirement", JSON in rule_value), so no database change is needed.
// Auto Generate follows them, the schedule check reports any that aren't met,
// and the Fix button can repair them.

export const POSITION_REQUIREMENT_RULE = "position_requirement";

export type RequirementRole = "open" | "close";

export type PositionRequirement =
  | { kind: "minimum"; role: RequirementRole; positions: string[]; min: number; days: number[] }
  | { kind: "pairing"; role: RequirementRole; position: string; requires: string[]; days: number[] };

export type SavedRequirement = { id?: string; requirement: PositionRequirement };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const same = (a: string | null | undefined, b: string) => (a || "").trim().toLowerCase() === b.trim().toLowerCase();

export function parseRequirement(value: string): PositionRequirement | null {
  try {
    const raw = JSON.parse(value);
    const role: RequirementRole = raw.role === "close" ? "close" : "open";
    const days = Array.isArray(raw.days) ? raw.days.filter((day: unknown) => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 5) : [];
    if (raw.kind === "minimum" && Array.isArray(raw.positions) && raw.positions.length > 0) {
      return { kind: "minimum", role, positions: raw.positions.map(String), min: Math.max(1, Math.floor(Number(raw.min) || 1)), days };
    }
    if (raw.kind === "pairing" && typeof raw.position === "string" && Array.isArray(raw.requires) && raw.requires.length > 0) {
      return { kind: "pairing", role, position: raw.position, requires: raw.requires.map(String), days };
    }
  } catch {
    // not a requirement
  }
  return null;
}

/** Requirements saved as ai_rules rows (store-wide). */
export function requirementsFromRules(rules: Array<{ id?: string; rule_type: string; rule_value: string; employee_id: string | null }>): SavedRequirement[] {
  const saved: SavedRequirement[] = [];
  for (const rule of rules) {
    if (rule.rule_type !== POSITION_REQUIREMENT_RULE || rule.employee_id) continue;
    const requirement = parseRequirement(rule.rule_value);
    if (requirement) saved.push({ id: rule.id, requirement });
  }
  return saved;
}

/** "a Store Manager" / "an Assistant Manager". */
function withArticle(text: string) {
  return `${/^[aeiou]/i.test(text) ? "an" : "a"} ${text}`;
}

function orList(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function daysText(days: number[]) {
  if (days.length === 0 || days.length === 6) return "every day";
  return `on ${days.map((day) => `${WEEKDAYS[day]}s`).join(", ")}`;
}

/** Plain-English description, e.g. "ASR I can't open unless a Store Manager also opens (every day)." */
export function describeRequirement(requirement: PositionRequirement) {
  const verb = requirement.role === "open" ? "open" : "close";
  if (requirement.kind === "minimum") {
    return `At least ${requirement.min} ${orList(requirement.positions)} must ${verb} ${daysText(requirement.days)}.`;
  }
  return `${requirement.position} can't ${verb} unless ${withArticle(orList(requirement.requires))} also ${verb}s (${daysText(requirement.days)}).`;
}

export function appliesOn(requirement: PositionRequirement, weekday: number) {
  return requirement.days.length === 0 || requirement.days.includes(weekday);
}

/** Positions a requirement mentions (to keep it in step when positions are renamed or removed). */
export function positionsIn(requirement: PositionRequirement) {
  return requirement.kind === "minimum" ? requirement.positions : [requirement.position, ...requirement.requires];
}

export function renamePosition(requirement: PositionRequirement, from: string, to: string): PositionRequirement {
  const swap = (name: string) => (same(name, from) ? to : name);
  return requirement.kind === "minimum"
    ? { ...requirement, positions: requirement.positions.map(swap) }
    : { ...requirement, position: swap(requirement.position), requires: requirement.requires.map(swap) };
}

/**
 * Whether the people opening (or closing) on a day meet a requirement.
 * `members` are the positions of everyone in that role that day.
 */
export function meets(requirement: PositionRequirement, members: Array<string | null | undefined>) {
  if (requirement.kind === "minimum") {
    return members.filter((position) => requirement.positions.some((name) => same(position, name))).length >= requirement.min;
  }
  const hasPosition = members.some((position) => same(position, requirement.position));
  if (!hasPosition) return true;
  // Someone other than the person in question must have one of the required positions.
  const others = [...members];
  others.splice(others.findIndex((position) => same(position, requirement.position)), 1);
  return others.some((position) => requirement.requires.some((name) => same(position, name)));
}

/** Short reason a requirement isn't met on a day, for the schedule check. */
export function unmetMessage(requirement: PositionRequirement, dayLabel: string, members: Array<string | null | undefined>) {
  const verb = requirement.role === "open" ? "open" : "close";
  const verbs = requirement.role === "open" ? "opens" : "closes";
  if (requirement.kind === "minimum") {
    const count = members.filter((position) => requirement.positions.some((name) => same(position, name))).length;
    return `${dayLabel}: needs at least ${requirement.min} ${orList(requirement.positions)} to ${verb}; ${count === 0 ? "none" : `only ${count}`} scheduled.`;
  }
  return `${dayLabel}: ${requirement.position} ${verbs} without ${withArticle(orList(requirement.requires))} who also ${verbs}.`;
}

/**
 * Adjust a day's openers (or closers) so they meet the requirements: swap
 * people in from `pool` (others working that day) one at a time, keeping
 * a swap only when it reduces the number of unmet requirements. Earlier
 * people in `selected` are kept first; earlier people in `pool` are tried first.
 */
export function repairSelection<T extends { id: string; position: string | null }>(
  selected: T[],
  pool: T[],
  requirements: PositionRequirement[],
): T[] {
  if (requirements.length === 0 || selected.length === 0) return selected;
  const unmet = (people: T[]) => requirements.filter((requirement) => !meets(requirement, people.map((person) => person.position))).length;

  let current = [...selected];
  let available = pool.filter((person) => !current.some((chosen) => chosen.id === person.id));
  for (let round = 0; round < 6; round += 1) {
    const before = unmet(current);
    if (before === 0) break;
    let improved = false;
    for (let victim = current.length - 1; victim >= 0 && !improved; victim -= 1) {
      for (const candidate of available) {
        const next = [...current];
        next[victim] = candidate;
        if (unmet(next) < before) {
          available = [...available.filter((person) => person.id !== candidate.id), current[victim]];
          current = next;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  return current;
}
