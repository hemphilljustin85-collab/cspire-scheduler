// Live schedule check: looks over the schedule on screen (after Auto Generate
// or any manual change) and lists anything that needs a manager's attention.

export type CheckDay = {
  name: string;
  /** 0 = Monday ... 5 = Saturday. */
  weekday: number;
  offset: number;
  date: string;
  weekIndex: number;
  inMonth: boolean;
};

export type CheckSeverity = "problem" | "heads-up";

export type CheckIssue = {
  id: string;
  severity: CheckSeverity;
  category: string;
  message: string;
  employeeId?: string;
  /** Day the issue is about (grid offset). */
  offset?: number;
};

type RuleLike = {
  rule_type: string;
  rule_value: string;
  employee_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type CheckInput = {
  employees: Array<{ id: string; employee_name: string }>;
  days: CheckDay[];
  weekStarts: string[];
  grid: Record<string, Record<string, string>>;
  rules: {
    openersPerDay: number;
    closersPerDay: number;
    targetHours: number;
    daysOffPerWeek: number;
    saturdayOffGoal: number;
  };
  savedRules: RuleLike[];
  isOpener: (code: string) => boolean;
  isCloser: (code: string) => boolean;
  isWorking: (code: string) => boolean;
  hoursFor: (code: string, offset: number) => number;
  /** Start and end times ("HH:MM") of a shift on a day; null for days off. */
  timesFor: (code: string, offset: number) => { start: string | null; end: string | null };
  holidayFor: (offset: number) => { name: string; mode: "closed" | "short" } | undefined;
  /** First of the month in Month view ("YYYY-MM-01"); null in Week view. */
  month: string | null;
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Order categories are shown in. */
export const CHECK_CATEGORIES = ["Not started", "Coverage", "Rules", "Days off", "Saturdays off", "Hours", "Short rest", "Monthly amounts"];

/** Less rest than this between one shift's end and the next day's start is flagged. */
export const MIN_REST_HOURS = 10;

function minutes(time: string | null) {
  if (!time) return null;
  const [hours, mins] = time.split(":").map(Number);
  return Number.isFinite(hours) ? hours * 60 + (mins || 0) : null;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, count: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + count);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayLabel(day: CheckDay) {
  return `${day.name.slice(0, 3)} ${shortDate(day.date)}`;
}

function weekdayIndex(value: string) {
  const index = WEEKDAY_NAMES.findIndex((name) => name.toLowerCase() === value.trim().toLowerCase());
  return index >= 0 ? index : null;
}

function appliesToWeek(rule: RuleLike, weekStart: string) {
  const weekEnd = addDays(weekStart, 5);
  if (rule.start_date && rule.start_date > weekEnd) return false;
  if (rule.end_date && rule.end_date < weekStart) return false;
  return true;
}

function parseShiftDays(value: string) {
  const [shift, dayValues] = value.split("|");
  if (!shift || !dayValues) return null;
  const days = dayValues.split(",").map(weekdayIndex).filter((day): day is number => day !== null);
  return days.length ? { shift: shift.trim(), days } : null;
}

export function checkSchedule(input: CheckInput): CheckIssue[] {
  const { employees, weekStarts, grid, rules, savedRules } = input;
  const issues: CheckIssue[] = [];
  const add = (issue: Omit<CheckIssue, "id">) =>
    issues.push({ ...issue, id: `${issue.category}|${issue.employeeId ?? ""}|${issue.offset ?? ""}|${issues.length}` });
  const codeAt = (employeeId: string, offset: number) => grid[employeeId]?.[String(offset)] ?? "OFF";
  const weekLabel = (weekIndex: number) => `the week of ${shortDate(weekStarts[weekIndex])}`;

  // A week with no shifts at all hasn't been built yet: note it once and skip
  // its other checks, so an empty week doesn't fill the list.
  const notStarted = new Set(
    weekStarts
      .map((_, weekIndex) => weekIndex)
      .filter((weekIndex) =>
        input.days
          .filter((day) => day.weekIndex === weekIndex)
          .every((day) => employees.every((employee) => !input.isWorking(codeAt(employee.id, day.offset)))),
      ),
  );
  for (const weekIndex of notStarted) {
    add({
      severity: "heads-up",
      category: "Not started",
      message: `Nothing is scheduled ${weekLabel(weekIndex)} yet. Use Auto Generate or add shifts.`,
    });
  }
  const days = input.days.filter((day) => !notStarted.has(day.weekIndex));

  // Coverage: openers, closers and anyone working each day.
  for (const day of days) {
    const codes = employees.map((employee) => codeAt(employee.id, day.offset));
    const working = codes.filter(input.isWorking).length;
    const holiday = input.holidayFor(day.offset);

    if (holiday) {
      if (holiday.mode === "short" && working === 0) {
        add({ severity: "problem", category: "Coverage", offset: day.offset, message: `${dayLabel(day)} (${holiday.name}): nobody is scheduled for the short day.` });
      }
      continue;
    }

    if (working === 0) {
      add({ severity: "problem", category: "Coverage", offset: day.offset, message: `${dayLabel(day)}: nobody is scheduled.` });
      continue;
    }

    const openers = codes.filter(input.isOpener).length;
    const closers = codes.filter(input.isCloser).length;
    if (openers < rules.openersPerDay) {
      add({ severity: "problem", category: "Coverage", offset: day.offset, message: `${dayLabel(day)}: ${openers} opener${openers === 1 ? "" : "s"}, needs ${rules.openersPerDay}.` });
    }
    if (closers < rules.closersPerDay) {
      add({ severity: "problem", category: "Coverage", offset: day.offset, message: `${dayLabel(day)}: ${closers} closer${closers === 1 ? "" : "s"}, needs ${rules.closersPerDay}.` });
    }
  }

  // Rules: unavailable days, shifts on days they can't be used, required shifts.
  for (const day of days) {
    const weekOf = weekStarts[day.weekIndex];
    const active = savedRules.filter((rule) => appliesToWeek(rule, weekOf));
    const allowed = active.filter((rule) => !rule.employee_id && rule.rule_type === "allowed_days_for_shift").map((rule) => parseShiftDays(rule.rule_value)).filter((rule) => rule !== null);
    const blocked = active.filter((rule) => !rule.employee_id && rule.rule_type === "blocked_days_for_shift").map((rule) => parseShiftDays(rule.rule_value)).filter((rule) => rule !== null);

    for (const employee of employees) {
      const code = codeAt(employee.id, day.offset);
      const own = active.filter((rule) => rule.employee_id === employee.id);

      if (input.isWorking(code)) {
        const unavailable = own.some(
          (rule) => rule.rule_type === "unavailable" && rule.rule_value.split(",").map(weekdayIndex).includes(day.weekday),
        );
        if (unavailable) {
          add({ severity: "problem", category: "Rules", employeeId: employee.id, offset: day.offset, message: `${employee.employee_name} is unavailable ${day.name}s but is scheduled ${dayLabel(day)}.` });
        }

        const limits = allowed.filter((rule) => rule.shift === code);
        const notAllowed = limits.length > 0 && !limits.some((rule) => rule.days.includes(day.weekday));
        const isBlocked = blocked.some((rule) => rule.shift === code && rule.days.includes(day.weekday));
        if (notAllowed || isBlocked) {
          add({ severity: "problem", category: "Rules", employeeId: employee.id, offset: day.offset, message: `${employee.employee_name} has shift ${code} on ${dayLabel(day)}, but that shift can't be used on ${day.name}s.` });
        }
      }

      for (const rule of own.filter((item) => item.rule_type === "required_shift")) {
        const [dayValue, shiftValue] = rule.rule_value.split("|");
        const required = (shiftValue || "").trim();
        if (weekdayIndex(dayValue || "") !== day.weekday || !required || code === required) continue;
        // Approved days off and holidays win over a required shift.
        if (["PTO", "HOLIDAY", "HOLIDAY_SHORT"].includes(code)) continue;
        add({ severity: "heads-up", category: "Rules", employeeId: employee.id, offset: day.offset, message: `${employee.employee_name} should work ${required} on ${day.name}s but has ${code} on ${dayLabel(day)}.` });
      }
    }
  }

  // Each week: days off and hours.
  weekStarts.forEach((_, weekIndex) => {
    if (notStarted.has(weekIndex)) return;
    const weekDays = days.filter((day) => day.weekIndex === weekIndex);
    for (const employee of employees) {
      const codes = weekDays.map((day) => codeAt(employee.id, day.offset));
      const daysOff = codes.filter((code) => !input.isWorking(code)).length;
      if (daysOff < rules.daysOffPerWeek) {
        add({
          severity: "problem",
          category: "Days off",
          employeeId: employee.id,
          offset: weekDays[weekDays.length - 1]?.offset,
          message:
            daysOff === 0
              ? `${employee.employee_name} has no day off ${weekLabel(weekIndex)}.`
              : `${employee.employee_name} has ${daysOff} day${daysOff === 1 ? "" : "s"} off ${weekLabel(weekIndex)}, needs ${rules.daysOffPerWeek}.`,
        });
      }

      const hours = weekDays.reduce((sum, day) => sum + input.hoursFor(codeAt(employee.id, day.offset), day.offset), 0);
      if (hours > rules.targetHours + 1) {
        add({ severity: "heads-up", category: "Hours", employeeId: employee.id, message: `${employee.employee_name} has ${hours.toFixed(2)} hours ${weekLabel(weekIndex)} (target ${rules.targetHours}).` });
      } else if (hours < rules.targetHours - 4) {
        add({ severity: "heads-up", category: "Hours", employeeId: employee.id, message: `${employee.employee_name} has ${hours.toFixed(2)} hours ${weekLabel(weekIndex)} (target ${rules.targetHours}).` });
      }
    }
  });

  // Short rest: less than MIN_REST_HOURS between one day's shift and the next day's.
  for (const day of days) {
    const nextDay = days.find((item) => item.date === addDays(day.date, 1));
    if (!nextDay) continue;
    for (const employee of employees) {
      const today = input.timesFor(codeAt(employee.id, day.offset), day.offset);
      const tomorrow = input.timesFor(codeAt(employee.id, nextDay.offset), nextDay.offset);
      const start = minutes(today.start);
      let end = minutes(today.end);
      const nextStart = minutes(tomorrow.start);
      if (start === null || end === null || nextStart === null) continue;
      if (end <= start) end += 24 * 60; // overnight shift
      const restMinutes = 24 * 60 + nextStart - end;
      if (restMinutes < MIN_REST_HOURS * 60) {
        add({
          severity: "heads-up",
          category: "Short rest",
          employeeId: employee.id,
          offset: nextDay.offset,
          message: `${employee.employee_name} has only ${(restMinutes / 60).toFixed(1)} hours between shifts ${dayLabel(day)} → ${dayLabel(nextDay)}.`,
        });
      }
    }
  }

  if (input.month) {
    const monthKey = input.month.slice(0, 7);
    const monthName = parseDate(input.month).toLocaleDateString("en-US", { month: "long" });
    const monthDays = days.filter((day) => day.date.slice(0, 7) === monthKey);
    // Saturday and monthly-amount checks wait until the whole month is built.
    const monthComplete = !input.days.some((day) => day.date.slice(0, 7) === monthKey && notStarted.has(day.weekIndex));
    const saturdays = monthDays.filter((day) => day.weekday === 5);

    // Saturdays off this month.
    if (monthComplete && rules.saturdayOffGoal > 0 && saturdays.length > 0) {
      for (const employee of employees) {
        const off = saturdays.filter((day) => !input.isWorking(codeAt(employee.id, day.offset))).length;
        if (off === 0) {
          add({ severity: "heads-up", category: "Saturdays off", employeeId: employee.id, message: `${employee.employee_name} has no Saturday off in ${monthName}.` });
        }
      }
    }

    // Monthly preferred amounts (opens/closes on a day).
    const monthRules = savedRules.filter(
      (rule) =>
        (rule.rule_type === "monthly_open_target" || rule.rule_type === "monthly_close_target") &&
        (!rule.start_date || rule.start_date <= `${monthKey}-31`) &&
        (!rule.end_date || rule.end_date >= `${monthKey}-01`),
    );
    for (const employee of monthComplete ? employees : []) {
      for (const kind of ["open", "close"] as const) {
        const ruleType = kind === "open" ? "monthly_open_target" : "monthly_close_target";
        for (let weekday = 0; weekday < 6; weekday += 1) {
          const matches = (rule: RuleLike) => rule.rule_type === ruleType && weekdayIndex(rule.rule_value.split("|")[0] || "") === weekday;
          const rule = monthRules.find((item) => item.employee_id === employee.id && matches(item)) ?? monthRules.find((item) => !item.employee_id && matches(item));
          if (!rule) continue;
          const target = Number(rule.rule_value.split("|")[1]);
          if (!Number.isFinite(target)) continue;
          const count = monthDays.filter(
            (day) => day.weekday === weekday && (kind === "open" ? input.isOpener : input.isCloser)(codeAt(employee.id, day.offset)),
          ).length;
          if (count !== target) {
            add({
              severity: "heads-up",
              category: "Monthly amounts",
              employeeId: employee.id,
              message: `${employee.employee_name} ${kind === "open" ? "opens" : "closes"} ${count} ${WEEKDAY_NAMES[weekday]}${count === 1 ? "" : "s"} in ${monthName}; preferred amount is ${target}.`,
            });
          }
        }
      }
    }
  }

  return issues;
}
