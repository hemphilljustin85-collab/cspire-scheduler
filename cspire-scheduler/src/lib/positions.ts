// Positions (job titles) a business uses, managed on the Positions page.
// Stored as one store-wide ai_rules row (rule_type "positions") whose value is
// a JSON list, so no database change is needed. Employees keep their position
// as text, so renaming a position also updates the people who have it.

import { supabase } from "./supabase";

export const POSITIONS_RULE = "positions";

export type Position = {
  name: string;
  /** Counts toward the "managers working Saturday" rule. */
  isManager: boolean;
};

/** Used until the business saves its own list. */
export const DEFAULT_POSITIONS: Position[] = [
  { name: "Market Manager", isManager: true },
  { name: "Store Manager", isManager: true },
  { name: "Assistant Manager", isManager: true },
  { name: "Team Leader", isManager: false },
  { name: "Repair Tech", isManager: false },
  { name: "ASR II", isManager: false },
  { name: "ASR I", isManager: false },
  { name: "Part Time", isManager: false },
];

export function parsePositions(value: string | null | undefined): Position[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const positions = parsed
      .filter((item) => item && typeof item.name === "string" && item.name.trim())
      .map((item) => ({ name: String(item.name).trim(), isManager: Boolean(item.isManager) }));
    return positions;
  } catch {
    return null;
  }
}

/** Whether someone in this position counts as a manager (falls back to the title containing "manager"). */
export function isManagerPosition(position: string | null | undefined, positions: Position[] | null) {
  const name = (position || "").trim();
  const match = positions?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return match ? match.isManager : name.toLowerCase().includes("manager");
}

/** Load the saved list (or the defaults) and the id of the row it's saved in. */
export async function loadPositions(): Promise<{ positions: Position[]; ruleId: string | null; saved: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("ai_rules")
    .select("id, rule_value")
    .eq("rule_type", POSITIONS_RULE)
    .is("employee_id", null)
    .limit(1);
  if (error) return { positions: DEFAULT_POSITIONS, ruleId: null, saved: false, error: error.message };
  const row = (data as Array<{ id: string; rule_value: string }> | null)?.[0];
  const saved = parsePositions(row?.rule_value);
  return { positions: saved ?? DEFAULT_POSITIONS, ruleId: row?.id ?? null, saved: saved !== null };
}

/** Save the list; returns the row id or an error message. */
export async function savePositions(positions: Position[], ruleId: string | null): Promise<{ ruleId?: string; error?: string }> {
  const value = JSON.stringify(positions);
  const result = ruleId
    ? await supabase.from("ai_rules").update({ rule_value: value }).eq("id", ruleId).select("id")
    : await supabase
        .from("ai_rules")
        .insert({ employee_id: null, rule_type: POSITIONS_RULE, rule_value: value, start_date: null, end_date: null })
        .select("id");
  if (result.error) return { error: result.error.message };
  const id = (result.data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return { error: "The positions couldn't be saved. Your account may not have permission to change settings." };
  return { ruleId: id };
}

/** Position options for a dropdown: the list, plus the current value if it isn't in it (older data). */
export function positionOptions(positions: Position[], current?: string | null) {
  const names = positions.map((position) => position.name);
  const value = (current || "").trim();
  return value && !names.some((name) => name.toLowerCase() === value.toLowerCase()) ? [...names, value] : names;
}
