// "Fix" for a schedule check issue.
//
// Instead of a hand-written fix per issue, this tries small edits around the
// issue and re-runs the whole schedule check on each one:
//   - set:      change one person's shift on a day
//   - swap:     two people swap shifts on a day (also "give a shift to someone who's off")
//   - relocate: someone takes a shift on this day and gets a day off elsewhere that week
//   - trade:    two people trade shifts on two days of the same week
//   - day off:  someone gets this day off and works a day they had off that
//               week instead (optionally another person takes over their role)
// An edit is only used if the issue is gone and it adds no new problem, so a
// fix always respects coverage, days off, availability, shift-day limits and
// the other rules the check knows about. Among those, the edit with the fewest
// remaining problems, then fewest new heads-ups, then fewest changes wins.

import { checkSchedule, type CheckInput, type CheckIssue } from "./scheduleCheck";

export type FixChange = { employeeId: string; offset: number; from: string; to: string };

export type FixContext = {
  /** Everything the schedule check needs except the grid. */
  check: Omit<CheckInput, "grid">;
  /** Cells a fix must never change (approved days off, closed holidays). */
  isLocked: (employeeId: string, offset: number) => boolean;
  /** Codes a fix may put in a cell on a day (OFF plus shifts allowed that day). */
  codesForDay: (offset: number) => string[];
};

export type FixResult = {
  grid: Record<string, Record<string, string>>;
  changes: FixChange[];
  /** Heads-ups the fix adds (it never adds problems). */
  newHeadsUps: CheckIssue[];
};

/** Categories where trading two days within a week is worth trying. */
const TRADE_CATEGORIES = new Set(["Days off", "Saturdays off", "Hours", "Preferences", "Short rest"]);
/** Categories where someone may get this day off and work their other day off instead. */
const DAY_OFF_CATEGORIES = new Set(["Saturdays off", "Days off"]);
/** Categories where someone may take an extra shift and a day off elsewhere. */
const RELOCATE_CATEGORIES = new Set(["Coverage"]);
const MAX_CANDIDATES = 6000;

type Edit = Array<{ employeeId: string; offset: number; to: string }>;

export function findFix(
  issue: CheckIssue,
  grid: Record<string, Record<string, string>>,
  context: FixContext,
): FixResult | null {
  if (issue.scopeDays.length === 0) return null;

  const run = (candidate: Record<string, Record<string, string>>) => checkSchedule({ ...context.check, grid: candidate });
  const codeAt = (employeeId: string, offset: number) => grid[employeeId]?.[String(offset)] ?? "OFF";
  const allIds = context.check.employees.map((employee) => employee.id);
  const focus = issue.employeeId ? [issue.employeeId] : allIds;
  const days = context.check.days;
  const dayByOffset = new Map(days.map((day) => [day.offset, day]));
  const canChange = (employeeId: string, offset: number) => !context.isLocked(employeeId, offset);
  const allowedOn = (offset: number, code: string) => context.codesForDay(offset).includes(code);

  const edits: Edit[] = [];
  const push = (edit: Edit) => {
    if (edits.length < MAX_CANDIDATES) edits.push(edit);
  };

  for (const offset of issue.scopeDays) {
    const codes = context.codesForDay(offset);

    // set
    for (const employeeId of focus) {
      if (!canChange(employeeId, offset)) continue;
      for (const code of codes) {
        if (code !== codeAt(employeeId, offset)) push([{ employeeId, offset, to: code }]);
      }
    }

    // swap
    for (const a of focus) {
      for (const b of allIds) {
        if (a === b || (!issue.employeeId && b < a)) continue;
        const codeA = codeAt(a, offset);
        const codeB = codeAt(b, offset);
        if (codeA === codeB || !canChange(a, offset) || !canChange(b, offset)) continue;
        if (!allowedOn(offset, codeA) || !allowedOn(offset, codeB)) continue;
        push([
          { employeeId: a, offset, to: codeB },
          { employeeId: b, offset, to: codeA },
        ]);
      }
    }

    const day = dayByOffset.get(offset);
    if (!day) continue;
    const weekDays = days.filter((item) => item.weekIndex === day.weekIndex && item.offset !== offset);

    // relocate: take a shift today, get a day off on another day this week
    if (RELOCATE_CATEGORIES.has(issue.category)) {
      for (const employeeId of allIds) {
        if (!canChange(employeeId, offset) || codeAt(employeeId, offset) !== "OFF") continue;
        for (const code of codes) {
          if (code === "OFF") continue;
          for (const other of weekDays) {
            if (!canChange(employeeId, other.offset) || codeAt(employeeId, other.offset) === "OFF") continue;
            if (!context.codesForDay(other.offset).includes("OFF")) continue;
            push([
              { employeeId, offset, to: code },
              { employeeId, offset: other.offset, to: "OFF" },
            ]);
          }
        }
      }
    }

    // day off: give this person the day off, have them work a day they had off
    // this week, and optionally have someone already working take their role
    // (e.g. an opener becomes the closer) so coverage holds.
    if (issue.employeeId && DAY_OFF_CATEGORIES.has(issue.category)) {
      const a = issue.employeeId;
      const aCode = codeAt(a, offset);
      if (aCode !== "OFF" && canChange(a, offset) && context.codesForDay(offset).includes("OFF")) {
        for (const other of weekDays) {
          if (codeAt(a, other.offset) !== "OFF" || !canChange(a, other.offset)) continue;
          for (const code of context.codesForDay(other.offset)) {
            if (code === "OFF") continue;
            const base: Edit = [
              { employeeId: a, offset, to: "OFF" },
              { employeeId: a, offset: other.offset, to: code },
            ];
            push(base);
            if (!allowedOn(offset, aCode)) continue;
            for (const c of allIds) {
              const cCode = codeAt(c, offset);
              if (c === a || cCode === "OFF" || cCode === aCode || !canChange(c, offset)) continue;
              push([...base, { employeeId: c, offset, to: aCode }]);
            }
          }
        }
      }
    }

    // trade: two people swap their shifts on two days of the same week
    if (issue.employeeId && TRADE_CATEGORIES.has(issue.category)) {
      const a = issue.employeeId;
      for (const b of allIds) {
        if (b === a) continue;
        if (codeAt(a, offset) === codeAt(b, offset) || !canChange(a, offset) || !canChange(b, offset)) continue;
        for (const other of weekDays) {
          const aOther = codeAt(a, other.offset);
          const bOther = codeAt(b, other.offset);
          if (aOther === bOther || !canChange(a, other.offset) || !canChange(b, other.offset)) continue;
          if (
            !allowedOn(offset, codeAt(a, offset)) || !allowedOn(offset, codeAt(b, offset)) ||
            !allowedOn(other.offset, aOther) || !allowedOn(other.offset, bOther)
          ) continue;
          push([
            { employeeId: a, offset, to: codeAt(b, offset) },
            { employeeId: b, offset, to: codeAt(a, offset) },
            { employeeId: a, offset: other.offset, to: bOther },
            { employeeId: b, offset: other.offset, to: aOther },
          ]);
        }
      }
    }
  }

  const before = run(grid);
  const beforeProblemKeys = new Set(before.filter((item) => item.severity === "problem").map((item) => item.key));
  const beforeKeys = new Set(before.map((item) => item.key));

  let best: { score: number[]; result: FixResult } | null = null;

  for (const edit of edits) {
    const candidate: Record<string, Record<string, string>> = { ...grid };
    for (const change of edit) {
      candidate[change.employeeId] = { ...candidate[change.employeeId], [String(change.offset)]: change.to };
    }

    const after = run(candidate);
    if (after.some((item) => item.key === issue.key)) continue;
    const problems = after.filter((item) => item.severity === "problem");
    if (problems.some((item) => !beforeProblemKeys.has(item.key))) continue;

    const newHeadsUps = after.filter((item) => item.severity === "heads-up" && !beforeKeys.has(item.key));
    const headsUps = after.length - problems.length;
    const score = [problems.length, newHeadsUps.length, headsUps, edit.length];

    if (!best || compare(score, best.score) < 0) {
      best = {
        score,
        result: {
          grid: candidate,
          changes: edit.map((change) => ({
            employeeId: change.employeeId,
            offset: change.offset,
            from: codeAt(change.employeeId, change.offset),
            to: change.to,
          })),
          newHeadsUps,
        },
      };
    }
  }

  return best?.result ?? null;
}

function compare(a: number[], b: number[]) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
