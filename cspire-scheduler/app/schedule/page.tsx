"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { getCurrentStore } from "../../src/lib/store";

type Employee = {
  id: string;
  employee_name: string;
  position: string | null;
  status: string | null;
};

type ScheduleRecord = {
  id: string;
  week_start: string;
  status: string;
  updated_at: string | null;
};

type ScheduleVersion = {
  id: string;
  version_label: string;
  schedule_status: string;
  entries: Array<{ employee_id: string; shift_date: string; shift_code: string }>;
  created_at: string;
};

type ShiftCode = string;

type ScheduleGrid = Record<string, Record<string, ShiftCode>>;

type SchedulerRules = {
  openersPerDay: number;
  closersPerDay: number;
  targetHours: number;
  daysOffPerWeek: number;
  saturdayOffGoal: number;
  managerSaturdayGoal: number;
};

type SavedRule = {
  rule_type: string;
  rule_value: string;
  employee_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ShiftDayRule = {
  shift: ShiftCode;
  days: number[];
};

type PTORecord = {
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
};

const DEFAULT_RULES: SchedulerRules = {
  openersPerDay: 2,
  closersPerDay: 2,
  targetHours: 40,
  daysOffPerWeek: 1,
  saturdayOffGoal: 1,
  managerSaturdayGoal: 2,
};

type ShiftDefinition = {
  code: ShiftCode;
  label: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  className: string;
};

const SHIFT_OPTIONS: ShiftDefinition[] = [
  {
    code: "OFF",
    label: "OFF",
    start_time: null,
    end_time: null,
    hours: 0,
    className: "bg-slate-100 text-slate-700",
  },
  {
    code: "PTO",
    label: "PTO",
    start_time: null,
    end_time: null,
    hours: 8,
    className: "bg-purple-100 text-purple-800",
  },
  {
    code: "HOLIDAY",
    label: "Holiday",
    start_time: null,
    end_time: null,
    hours: 8,
    className: "bg-amber-100 text-amber-800",
  },
  {
    code: "815-530",
    label: "8:15–5:30",
    start_time: "08:15",
    end_time: "17:30",
    hours: 8.25,
    className: "bg-green-100 text-green-800",
  },
  {
    code: "830-530",
    label: "8:30–5:30",
    start_time: "08:30",
    end_time: "17:30",
    hours: 8,
    className: "bg-emerald-100 text-emerald-800",
  },
  {
    code: "900-600",
    label: "9:00–6:00",
    start_time: "09:00",
    end_time: "18:00",
    hours: 8,
    className: "bg-blue-100 text-blue-800",
  },
  {
    code: "1030-715",
    label: "10:30–7:15",
    start_time: "10:30",
    end_time: "19:15",
    hours: 7.75,
    className: "bg-red-100 text-red-800",
  },
];

const WORK_DAYS = [
  { name: "Monday", offset: 0 },
  { name: "Tuesday", offset: 1 },
  { name: "Wednesday", offset: 2 },
  { name: "Thursday", offset: 3 },
  { name: "Friday", offset: 4 },
  { name: "Saturday", offset: 5 },
];

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, numberOfDays: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + numberOfDays);
  return formatLocalDate(date);
}

function getMonday(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + difference);
  return formatLocalDate(copy);
}

function displayDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getShift(
  code: ShiftCode,
  options: ShiftDefinition[] = SHIFT_OPTIONS,
): ShiftDefinition {
  return options.find((shift) => shift.code === code) ?? SHIFT_OPTIONS[0];
}

function makeEmptyGrid(employees: Employee[]): ScheduleGrid {
  const grid: ScheduleGrid = {};

  for (const employee of employees) {
    grid[employee.id] = {};

    for (const day of WORK_DAYS) {
      grid[employee.id][String(day.offset)] = "OFF";
    }
  }

  return grid;
}

function normalizeDayName(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const match = WORK_DAYS.findIndex((day) => day.name.toLowerCase() === normalized);
  return match >= 0 ? match : null;
}

function isShiftCode(
  value: string,
  options: ShiftDefinition[] = SHIFT_OPTIONS,
): value is ShiftCode {
  return options.some((shift) => shift.code === value);
}

function parseShiftDayRule(
  value: string,
  options: ShiftDefinition[] = SHIFT_OPTIONS,
): ShiftDayRule | null {
  const [shiftValue, dayValues] = value.split("|");
  if (!shiftValue || !dayValues || !isShiftCode(shiftValue.trim(), options)) return null;
  const days = dayValues.split(",").map(normalizeDayName).filter((day): day is number => day !== null);
  if (days.length === 0) return null;
  return { shift: shiftValue.trim() as ShiftCode, days };
}

function ruleAppliesToWeek(rule: SavedRule, weekStart: string) {
  const weekEnd = addDays(weekStart, 5);
  if (rule.start_date && rule.start_date > weekEnd) return false;
  if (rule.end_date && rule.end_date < weekStart) return false;
  return true;
}

function dateIsWithinRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

export default function SchedulePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [weekStart, setWeekStart] = useState(getMonday());
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [status, setStatus] = useState("Draft");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [grid, setGrid] = useState<ScheduleGrid>({});
  const [rules, setRules] = useState<SchedulerRules>(DEFAULT_RULES);
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);
  const [ptoRecords, setPtoRecords] = useState<PTORecord[]>([]);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [shiftOptions, setShiftOptions] =
    useState<ShiftDefinition[]>(SHIFT_OPTIONS);
  const [publicStoreSlug, setPublicStoreSlug] = useState("");
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    void Promise.all([loadEmployees(), loadRules(), loadPTO(), loadCustomShifts()]);
  }, []);

  async function loadCustomShifts() {
    const [{ data, error }, store] = await Promise.all([
      supabase
        .from("shift_templates")
        .select("code, name, start_time, end_time, paid_hours, color")
        .eq("active", true)
        .order("start_time"),
      getCurrentStore(),
    ]);

    setPublicStoreSlug(store.public_slug);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const colorClasses: Record<string, string> = {
      cyan: "bg-cyan-100 text-cyan-800",
      indigo: "bg-indigo-100 text-indigo-800",
      pink: "bg-pink-100 text-pink-800",
      orange: "bg-orange-100 text-orange-800",
      teal: "bg-teal-100 text-teal-800",
      lime: "bg-lime-100 text-lime-800",
    };

    const custom = ((data || []) as Array<{
      code: string;
      name: string;
      start_time: string;
      end_time: string;
      paid_hours: number;
      color: string;
    }>).map((shift) => ({
      code: shift.code,
      label: shift.name,
      start_time: shift.start_time,
      end_time: shift.end_time,
      hours: Number(shift.paid_hours),
      className: colorClasses[shift.color] || colorClasses.cyan,
    }));
    setShiftOptions([...SHIFT_OPTIONS, ...custom]);
  }

  useEffect(() => {
    if (employees.length > 0) {
      void Promise.all([loadSchedule(), loadPTO()]);
    }
  }, [employees, weekStart]);

  async function loadEmployees() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_name, position, status")
      .or("status.eq.Active,status.is.null")
      .order("employee_name");

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setEmployees((data as Employee[]) || []);
    setLoading(false);
  }


  async function loadRules() {
    const { data, error } = await supabase
      .from("ai_rules")
      .select("rule_type, rule_value, employee_id, start_date, end_date");

    if (error) {
      console.error("Unable to load scheduling rules:", error);
      setRules(DEFAULT_RULES);
      setSavedRules([]);
      setRulesLoaded(true);
      return;
    }

    const allRules = (data as SavedRule[]) || [];
    const nextRules = { ...DEFAULT_RULES };

    for (const rule of allRules.filter((item) => !item.employee_id)) {
      const value = Number(rule.rule_value);
      switch (rule.rule_type) {
        case "openers_per_day": if (Number.isFinite(value)) nextRules.openersPerDay = Math.max(0, Math.floor(value)); break;
        case "closers_per_day": if (Number.isFinite(value)) nextRules.closersPerDay = Math.max(0, Math.floor(value)); break;
        case "target_hours": if (Number.isFinite(value)) nextRules.targetHours = Math.max(0, value); break;
        case "days_off_per_week": if (Number.isFinite(value)) nextRules.daysOffPerWeek = Math.max(0, Math.floor(value)); break;
        case "saturday_off_goal": if (Number.isFinite(value)) nextRules.saturdayOffGoal = Math.max(0, Math.floor(value)); break;
        case "manager_saturday_goal": if (Number.isFinite(value)) nextRules.managerSaturdayGoal = Math.max(0, Math.floor(value)); break;
      }
    }

    setRules(nextRules);
    setSavedRules(allRules);
    setRulesLoaded(true);
  }

  async function loadPTO() {
    const weekEnd = addDays(weekStart, 5);

    const { data, error } = await supabase
      .from("employee_time_off")
      .select("employee_id, start_date, end_date, status")
      .eq("status", "Approved")
      .lte("start_date", weekEnd)
      .gte("end_date", weekStart);

    if (error) {
      console.error("Unable to load PTO:", error);
      setErrorMessage((current) =>
        current ? `${current} | ${error.message}` : error.message,
      );
      setPtoRecords([]);
      return;
    }

    setPtoRecords((data as PTORecord[]) || []);
  }

  async function loadSchedule() {
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    setGenerationWarnings([]);

    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, week_start, status, updated_at")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (scheduleError) {
      setErrorMessage(scheduleError.message);
      setLoading(false);
      return;
    }

    const emptyGrid = makeEmptyGrid(employees);

    if (!schedule) {
      setScheduleId(null);
      setStatus("Draft");
      setLastSaved(null);
      setGrid(applyPTOToGrid(emptyGrid));
      setLoading(false);
      return;
    }

    const scheduleRecord = schedule as ScheduleRecord;
    setScheduleId(scheduleRecord.id);
    setStatus(scheduleRecord.status || "Draft");
    setLastSaved(scheduleRecord.updated_at);

    const { data: entries, error: entriesError } = await supabase
      .from("schedule_entries")
      .select("employee_id, shift_date, shift_code")
      .eq("schedule_id", scheduleRecord.id);

    if (entriesError) {
      setErrorMessage(entriesError.message);
      setGrid(emptyGrid);
      setLoading(false);
      return;
    }

    for (const entry of entries || []) {
      const date = parseLocalDate(entry.shift_date);
      const monday = parseLocalDate(weekStart);
      const offset = Math.round(
        (date.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (
        emptyGrid[entry.employee_id] &&
        offset >= 0 &&
        offset < WORK_DAYS.length
      ) {
        emptyGrid[entry.employee_id][String(offset)] =
          entry.shift_code as ShiftCode;
      }
    }

    setGrid(applyPTOToGrid(emptyGrid));
    setLoading(false);
  }

  function isApprovedPTO(employeeId: string, dayOffset: number) {
    const shiftDate = addDays(weekStart, dayOffset);

    return ptoRecords.some(
      (record) =>
        record.employee_id === employeeId &&
        record.status === "Approved" &&
        dateIsWithinRange(shiftDate, record.start_date, record.end_date),
    );
  }

  function applyPTOToGrid(scheduleGrid: ScheduleGrid) {
    const nextGrid: ScheduleGrid = {};

    for (const employee of employees) {
      nextGrid[employee.id] = { ...(scheduleGrid[employee.id] || {}) };

      for (const day of WORK_DAYS) {
        if (isApprovedPTO(employee.id, day.offset)) {
          nextGrid[employee.id][String(day.offset)] = "PTO";
        }
      }
    }

    return nextGrid;
  }

  function changeShift(
    employeeId: string,
    dayOffset: number,
    shiftCode: ShiftCode,
  ) {
    if (isApprovedPTO(employeeId, dayOffset)) {
      setErrorMessage("Approved PTO cannot be changed from the Schedule page.");
      return;
    }

    setGrid((current) => ({
      ...current,
      [employeeId]: {
        ...current[employeeId],
        [String(dayOffset)]: shiftCode,
      },
    }));
    setMessage("");
    setGenerationWarnings([]);
  }

  function generateStarterSchedule() {
    if (!rulesLoaded) {
      setErrorMessage("Scheduling rules are still loading. Try again in a moment.");
      return;
    }

    const hasExistingShifts = employees.some((employee) =>
      WORK_DAYS.some((day) => {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
        return !["OFF", "PTO"].includes(code);
      }),
    );

    if (
      hasExistingShifts &&
      !window.confirm(
        "Auto Generate will replace the current shifts for this week. Continue?",
      )
    ) {
      return;
    }

    const generated = makeEmptyGrid(employees);
    const activeRules = savedRules.filter((rule) => ruleAppliesToWeek(rule, weekStart));
    const allowedShiftDays = activeRules.filter((rule) => rule.rule_type === "allowed_days_for_shift").map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions)).filter((rule): rule is ShiftDayRule => rule !== null);
    const blockedShiftDays = activeRules.filter((rule) => rule.rule_type === "blocked_days_for_shift").map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions)).filter((rule): rule is ShiftDayRule => rule !== null);
    const employeeUnavailableDays = new Map<string, Set<number>>();
    const employeePreferredDaysOff = new Map<string, Set<number>>();
    const employeeRequiredShifts = new Map<string, Map<number, ShiftCode>>();

    for (const rule of activeRules) {
      if (!rule.employee_id) continue;
      if (rule.rule_type === "unavailable") {
        const days = rule.rule_value.split(",").map(normalizeDayName).filter((day): day is number => day !== null);
        employeeUnavailableDays.set(rule.employee_id, new Set(days));
      }
      if (rule.rule_type === "preferred_day_off") {
        const days = rule.rule_value.split(",").map(normalizeDayName).filter((day): day is number => day !== null);
        employeePreferredDaysOff.set(rule.employee_id, new Set(days));
      }
      if (rule.rule_type === "required_shift") {
        const [dayValue, shiftValue] = rule.rule_value.split("|");
        const day = normalizeDayName(dayValue || "");
        const shift = (shiftValue || "").trim();
        if (day !== null && isShiftCode(shift, shiftOptions)) {
          const existing = employeeRequiredShifts.get(rule.employee_id) ?? new Map<number, ShiftCode>();
          existing.set(day, shift);
          employeeRequiredShifts.set(rule.employee_id, existing);
        }
      }
    }

    function shiftAllowedOnDay(shift: ShiftCode, dayIndex: number) {
      const allowedRules = allowedShiftDays.filter((rule) => rule.shift === shift);
      if (allowedRules.length > 0 && !allowedRules.some((rule) => rule.days.includes(dayIndex))) return false;
      if (blockedShiftDays.some((rule) => rule.shift === shift && rule.days.includes(dayIndex))) return false;
      return true;
    }

    function chooseOpeningShift(dayIndex: number, position: number): ShiftCode {
      const preferred: ShiftCode[] = position % 2 === 0 ? ["815-530", "830-530", "900-600"] : ["830-530", "815-530", "900-600"];
      return preferred.find((shift) => shiftAllowedOnDay(shift, dayIndex)) ?? "900-600";
    }

    const employeeCount = employees.length;
    const workingDays = WORK_DAYS.length;
    const daysOff = Math.min(
      Math.max(rules.daysOffPerWeek, 0),
      Math.max(workingDays - 1, 0),
    );
    const desiredWorkDays = Math.max(workingDays - daysOff, 1);

    const managers = employees.filter((employee) =>
      (employee.position || "").toLowerCase().includes("manager"),
    );

    const saturdayIndex = 5;
    const saturdayOffTarget = Math.min(
      rules.saturdayOffGoal,
      Math.max(employeeCount - rules.openersPerDay - rules.closersPerDay, 0),
    );

    const plannedDaysOff: Record<string, Set<number>> = {};

    employees.forEach((employee, employeeIndex) => {
      plannedDaysOff[employee.id] = new Set<number>();

      const unavailable = employeeUnavailableDays.get(employee.id);
      const preferred = employeePreferredDaysOff.get(employee.id);

      for (const day of WORK_DAYS) {
        if (isApprovedPTO(employee.id, day.offset)) {
          plannedDaysOff[employee.id].add(day.offset);
        }
      }

      unavailable?.forEach((day) => plannedDaysOff[employee.id].add(day));
      preferred?.forEach((day) => plannedDaysOff[employee.id].add(day));
      for (let offNumber = plannedDaysOff[employee.id].size; offNumber < daysOff; offNumber += 1) {
        let offDay = (employeeIndex + offNumber * 2) % workingDays;
        while (plannedDaysOff[employee.id].has(offDay) && plannedDaysOff[employee.id].size < workingDays) offDay = (offDay + 1) % workingDays;
        plannedDaysOff[employee.id].add(offDay);
      }
    });

    let saturdayOffAssigned = 0;
    for (let index = 0; index < employees.length; index += 1) {
      const employee = employees[index];
      const isManager = managers.some((manager) => manager.id === employee.id);

      if (
        saturdayOffAssigned < saturdayOffTarget &&
        (!isManager || managers.length > rules.managerSaturdayGoal)
      ) {
        plannedDaysOff[employee.id].add(saturdayIndex);
        saturdayOffAssigned += 1;
      }
    }

    WORK_DAYS.forEach((day, dayIndex) => {
      const available = employees.filter(
        (employee) => !plannedDaysOff[employee.id]?.has(dayIndex),
      );

      const rotated = [...available].sort((a, b) => {
        const aIndex = employees.findIndex((employee) => employee.id === a.id);
        const bIndex = employees.findIndex((employee) => employee.id === b.id);

        return (
          ((aIndex + dayIndex) % Math.max(employeeCount, 1)) -
          ((bIndex + dayIndex) % Math.max(employeeCount, 1))
        );
      });

      const managerWorkingSaturday =
        dayIndex === saturdayIndex
          ? managers.filter((manager) =>
              available.some((employee) => employee.id === manager.id),
            )
          : [];

      if (
        dayIndex === saturdayIndex &&
        managers.length > 0 &&
        managerWorkingSaturday.length < Math.min(rules.managerSaturdayGoal, managers.length)
      ) {
        const missingManagers = managers.filter(
          (manager) =>
            !managerWorkingSaturday.some(
              (workingManager) => workingManager.id === manager.id,
            ),
        );

        for (const manager of missingManagers) {
          if (
            managerWorkingSaturday.length >=
            Math.min(rules.managerSaturdayGoal, managers.length)
          ) {
            break;
          }

          plannedDaysOff[manager.id].delete(saturdayIndex);
          if (!rotated.some((employee) => employee.id === manager.id)) {
            rotated.unshift(manager);
          }
          managerWorkingSaturday.push(manager);
        }
      }

      const openerCount = Math.min(rules.openersPerDay, rotated.length);
      const remainingAfterOpeners = Math.max(rotated.length - openerCount, 0);
      const closerCount = Math.min(rules.closersPerDay, remainingAfterOpeners);

      rotated.forEach((employee, position) => {
        let shift: ShiftCode = "900-600";

        if (position < openerCount) {
          shift = chooseOpeningShift(dayIndex, position);
        } else if (position >= rotated.length - closerCount) {
          shift = shiftAllowedOnDay("1030-715", dayIndex) ? "1030-715" : "900-600";
        }
        const requiredShift = employeeRequiredShifts.get(employee.id)?.get(dayIndex);
        generated[employee.id][String(day.offset)] = requiredShift && shiftAllowedOnDay(requiredShift, dayIndex) ? requiredShift : shift;
      });

      employees.forEach((employee) => {
        if (!rotated.some((workingEmployee) => workingEmployee.id === employee.id)) {
          generated[employee.id][String(day.offset)] = "OFF";
        }
      });
    });

    employees.forEach((employee) => {
      let currentHours = WORK_DAYS.reduce((total, day) => {
        const code = generated[employee.id][String(day.offset)] ?? "OFF";
        return total + getShift(code, shiftOptions).hours;
      }, 0);

      if (currentHours > rules.targetHours + 1) {
        const middleDays = WORK_DAYS.filter(
          (day) => generated[employee.id][String(day.offset)] === "900-600",
        ).reverse();

        for (const day of middleDays) {
          if (currentHours <= rules.targetHours + 1) break;

          generated[employee.id][String(day.offset)] = "OFF";
          currentHours -= 8;
        }
      }

      if (currentHours < rules.targetHours - 4) {
        const offDays = WORK_DAYS.filter(
          (day) => generated[employee.id][String(day.offset)] === "OFF",
        );

        for (const day of offDays) {
          if (currentHours >= rules.targetHours - 4) break;

          const coverage = employees.filter((otherEmployee) => {
            const code =
              generated[otherEmployee.id][String(day.offset)] ?? "OFF";
            return !["OFF", "PTO", "HOLIDAY"].includes(code);
          }).length;

          const isUnavailable = employeeUnavailableDays.get(employee.id)?.has(day.offset) ?? false;
          const requiredShift = employeeRequiredShifts.get(employee.id)?.get(day.offset);
          if (coverage < employeeCount && !isUnavailable && !requiredShift && shiftAllowedOnDay("900-600", day.offset)) {
            generated[employee.id][String(day.offset)] = "900-600";
            currentHours += 8;
          }
        }
      }
    });

    const generatedWithPTO = applyPTOToGrid(generated);
    const warnings: string[] = [];

    for (const day of WORK_DAYS) {
      let openers = 0;
      let closers = 0;
      let working = 0;

      for (const employee of employees) {
        const code =
          generatedWithPTO[employee.id]?.[String(day.offset)] ?? "OFF";

        if (!["OFF", "PTO", "HOLIDAY"].includes(code)) {
          working += 1;
        }

        if (code === "815-530" || code === "830-530") {
          openers += 1;
        }

        if (code === "1030-715") {
          closers += 1;
        }
      }

      if (openers < rules.openersPerDay) {
        warnings.push(
          `${day.name}: only ${openers} opener(s), goal is ${rules.openersPerDay}.`,
        );
      }

      if (closers < rules.closersPerDay) {
        warnings.push(
          `${day.name}: only ${closers} closer(s), goal is ${rules.closersPerDay}.`,
        );
      }

      if (working === 0) {
        warnings.push(`${day.name}: no employees are scheduled to work.`);
      }
    }

    for (const employee of employees) {
      const totalHours = WORK_DAYS.reduce((sum, day) => {
        const code =
          generatedWithPTO[employee.id]?.[String(day.offset)] ?? "OFF";
        return sum + getShift(code, shiftOptions).hours;
      }, 0);

      const offDays = WORK_DAYS.filter(
        (day) =>
          generatedWithPTO[employee.id]?.[String(day.offset)] === "OFF",
      ).length;

      if (totalHours > rules.targetHours + 1) {
        warnings.push(
          `${employee.employee_name}: ${totalHours.toFixed(
            2,
          )} hours is above the ${rules.targetHours}-hour target.`,
        );
      }

      if (totalHours < rules.targetHours - 4) {
        warnings.push(
          `${employee.employee_name}: ${totalHours.toFixed(
            2,
          )} hours is below the ${rules.targetHours}-hour target.`,
        );
      }

      if (offDays < rules.daysOffPerWeek) {
        warnings.push(
          `${employee.employee_name}: only ${offDays} OFF day(s), goal is ${rules.daysOffPerWeek}.`,
        );
      }
    }

    setGenerationWarnings(warnings);
    setGrid(generatedWithPTO);
    setMessage(
      warnings.length === 0
        ? `Schedule generated successfully using ${activeRules.length} saved rule(s). All main staffing targets were met.`
        : `Schedule generated using ${activeRules.length} saved rule(s). Review ${warnings.length} warning(s) before saving.`,
    );
    setErrorMessage("");
  }

  async function updateScheduleMetrics() {
    const now = new Date().toISOString();

    const metricRows = employees.map((employee) => {
      let currentHours = 0;
      let mondayCloses = 0;
      let fridayCloses = 0;
      let saturdayCloses = 0;
      let saturdaysOff = 0;
      let daysOff = 0;

      for (const day of WORK_DAYS) {
        const code = isApprovedPTO(employee.id, day.offset)
          ? "PTO"
          : grid[employee.id]?.[String(day.offset)] ?? "OFF";

        currentHours += getShift(code, shiftOptions).hours;

        if (code === "OFF") {
          daysOff += 1;
        }

        if (day.offset === 0 && code === "1030-715") {
          mondayCloses += 1;
        }

        if (day.offset === 4 && code === "1030-715") {
          fridayCloses += 1;
        }

        if (day.offset === 5) {
          if (code === "1030-715") {
            saturdayCloses += 1;
          }

          if (code === "OFF") {
            saturdaysOff += 1;
          }
        }
      }

      return {
        employee_id: employee.id,
        monday_closes: mondayCloses,
        friday_closes: fridayCloses,
        saturday_closes: saturdayCloses,
        saturdays_off: saturdaysOff,
        current_hours: currentHours,
        total_hours: currentHours,
        days_off: daysOff,
        last_updated: now,
      };
    });

    const { error } = await supabase
      .from("schedule_metrics")
      .upsert(metricRows, {
        onConflict: "employee_id",
      });

    return error;
  }

  async function saveSchedule() {
    if (employees.length === 0) {
      setErrorMessage("Add at least one active employee before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    let activeScheduleId = scheduleId;

    if (!activeScheduleId) {
      const { data, error } = await supabase
        .from("schedules")
        .insert({
          week_start: weekStart,
          status,
        })
        .select("id")
        .single();

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }

      activeScheduleId = data.id;
      setScheduleId(data.id);
    } else {
      const { error } = await supabase
        .from("schedules")
        .update({ status })
        .eq("id", activeScheduleId);

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }
    }

    await snapshotExistingSchedule(activeScheduleId!, "Before save");

    const entries = employees.flatMap((employee) =>
      WORK_DAYS.map((day) => {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
        const shift = getShift(code, shiftOptions);

        return {
          schedule_id: activeScheduleId,
          employee_id: employee.id,
          shift_date: addDays(weekStart, day.offset),
          shift_code: shift.code,
          start_time: shift.start_time,
          end_time: shift.end_time,
          hours: shift.hours,
          updated_at: new Date().toISOString(),
        };
      }),
    );

    const { error: entriesError } = await supabase
      .from("schedule_entries")
      .upsert(entries, {
        onConflict: "schedule_id,employee_id,shift_date",
      });

    if (entriesError) {
      setErrorMessage(entriesError.message);
      setSaving(false);
      return;
    }

    const metricsError = await updateScheduleMetrics();

    if (metricsError) {
      const parts = [
        metricsError.message,
        metricsError.details
          ? `Details: ${metricsError.details}`
          : "",
        metricsError.hint
          ? `Hint: ${metricsError.hint}`
          : "",
        metricsError.code
          ? `Code: ${metricsError.code}`
          : "",
      ].filter(Boolean);

      setErrorMessage(
        `Schedule saved, but metrics were not updated: ${
          parts.join(" | ") || "Unknown Supabase error"
        }`,
      );

      setSaving(false);
      return;
    }

    setMessage("Schedule and metrics saved successfully.");
    setLastSaved(new Date().toISOString());
    setSaving(false);
  }

  async function publishSchedule() {
    if (employees.length === 0) {
      setErrorMessage("Add at least one active employee before publishing.");
      return;
    }

    const publishWarnings = WORK_DAYS.flatMap((day) => {
      const codes = employees.map((employee) => grid[employee.id]?.[String(day.offset)] ?? "OFF");
      const openers = codes.filter((code) => code === "815-530" || code === "830-530").length;
      const closers = codes.filter((code) => code === "1030-715").length;
      const working = codes.filter((code) => !["OFF", "PTO", "HOLIDAY"].includes(code)).length;
      const dayWarnings: string[] = [];
      if (openers < rules.openersPerDay) dayWarnings.push(`${day.name} has ${openers} opener(s); goal ${rules.openersPerDay}.`);
      if (closers < rules.closersPerDay) dayWarnings.push(`${day.name} has ${closers} closer(s); goal ${rules.closersPerDay}.`);
      if (working === 0) dayWarnings.push(`${day.name} has no working employees.`);
      return dayWarnings;
    });
    setGenerationWarnings(publishWarnings);

    if (publishWarnings.length > 0) {
      const confirmed = window.confirm(
        `This schedule has ${publishWarnings.length} coverage warning(s). Publish it anyway?`,
      );
      if (!confirmed) return;
    }

    setPublishing(true);
    setMessage("");
    setErrorMessage("");

    let activeScheduleId = scheduleId;

    if (!activeScheduleId) {
      const { data, error } = await supabase
        .from("schedules")
        .insert({
          week_start: weekStart,
          status: "Published",
        })
        .select("id")
        .single();

      if (error) {
        setErrorMessage(error.message);
        setPublishing(false);
        return;
      }

      activeScheduleId = data.id;
      setScheduleId(data.id);
    } else {
      const { error } = await supabase
        .from("schedules")
        .update({ status: "Published" })
        .eq("id", activeScheduleId);

      if (error) {
        setErrorMessage(error.message);
        setPublishing(false);
        return;
      }
    }

    await snapshotExistingSchedule(activeScheduleId!, "Before publish");

    const entries = employees.flatMap((employee) =>
      WORK_DAYS.map((day) => {
        const code =
          grid[employee.id]?.[String(day.offset)] ?? "OFF";
        const shift = getShift(code, shiftOptions);

        return {
          schedule_id: activeScheduleId,
          employee_id: employee.id,
          shift_date: addDays(weekStart, day.offset),
          shift_code: shift.code,
          start_time: shift.start_time,
          end_time: shift.end_time,
          hours: shift.hours,
          updated_at: new Date().toISOString(),
        };
      }),
    );

    const { error: entriesError } = await supabase
      .from("schedule_entries")
      .upsert(entries, {
        onConflict: "schedule_id,employee_id,shift_date",
      });

    if (entriesError) {
      setErrorMessage(entriesError.message);
      setPublishing(false);
      return;
    }

    const metricsError = await updateScheduleMetrics();

    if (metricsError) {
      setErrorMessage(
        `Schedule published, but metrics were not updated: ${
          metricsError.message || "Unknown Supabase error"
        }`,
      );
      setPublishing(false);
      return;
    }

    setStatus("Published");
    setLastSaved(new Date().toISOString());
    setMessage(
      "Schedule published successfully. Employees can now view the read-only Team Schedule.",
    );
    setPublishing(false);
  }

  async function snapshotExistingSchedule(activeScheduleId: string, label: string) {
    const [{ data: existing }, store, { data: userData }] = await Promise.all([
      supabase.from("schedule_entries").select("employee_id,shift_date,shift_code,start_time,end_time,hours").eq("schedule_id", activeScheduleId),
      getCurrentStore(),
      supabase.auth.getUser(),
    ]);
    if (!existing?.length || !userData.user) return;
    await supabase.from("schedule_versions").insert({
      schedule_id: activeScheduleId,
      store_id: store.id,
      version_label: label,
      schedule_status: status,
      entries: existing,
      created_by: userData.user.id,
    });
  }

  async function loadHistory() {
    if (!scheduleId) {
      setErrorMessage("Save this schedule before viewing history.");
      return;
    }
    const { data, error } = await supabase.from("schedule_versions")
      .select("id,version_label,schedule_status,entries,created_at")
      .eq("schedule_id", scheduleId).order("created_at", { ascending: false }).limit(20);
    if (error) setErrorMessage(error.message);
    else {
      setVersions((data as ScheduleVersion[]) || []);
      setShowHistory(true);
    }
  }

  function restoreVersion(version: ScheduleVersion) {
    const restored = makeEmptyGrid(employees);
    for (const entry of version.entries) {
      const offset = Math.round((parseLocalDate(entry.shift_date).getTime() - parseLocalDate(weekStart).getTime()) / 86400000);
      if (offset >= 0 && offset <= 5 && restored[entry.employee_id]) {
        restored[entry.employee_id][String(offset)] = entry.shift_code;
      }
    }
    setGrid(applyPTOToGrid(restored));
    setStatus("Draft");
    setShowHistory(false);
    setMessage("Previous version restored for review. Click Save Schedule to keep it.");
  }

  async function copyShareLink() {
    const shareUrl = `${window.location.origin}/team-schedule?store=${encodeURIComponent(publicStoreSlug)}&week=${weekStart}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Team Schedule link copied to your clipboard.");
      setErrorMessage("");
    } catch {
      window.prompt("Copy this Team Schedule link:", shareUrl);
    }
  }

  async function clearSchedule() {
    const confirmed = window.confirm(
      "Clear every shift for this week? The blank schedule will not be saved until you click Save Schedule.",
    );

    if (!confirmed) return;

    setGrid(applyPTOToGrid(makeEmptyGrid(employees)));
    setStatus("Draft");
    setMessage("Schedule cleared. Click Save Schedule to store the changes.");
    setErrorMessage("");
    setGenerationWarnings([]);
  }

  const employeeHours = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const employee of employees) {
      totals[employee.id] = WORK_DAYS.reduce((sum, day) => {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
        return sum + getShift(code, shiftOptions).hours;
      }, 0);
    }

    return totals;
  }, [employees, grid]);

  const dailyCoverage = useMemo(() => {
    return WORK_DAYS.map((day) => {
      let openers = 0;
      let closers = 0;
      let working = 0;

      for (const employee of employees) {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";

        if (!["OFF", "PTO", "HOLIDAY"].includes(code)) {
          working += 1;
        }

        if (code === "815-530" || code === "830-530") {
          openers += 1;
        }

        if (code === "1030-715") {
          closers += 1;
        }
      }

      return { openers, closers, working };
    });
  }, [employees, grid]);

  function moveWeek(numberOfDays: number) {
    setWeekStart(addDays(weekStart, numberOfDays));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Schedule Builder</h1>
          <p className="mt-1 text-slate-600">
            Create, edit, generate, and save the weekly store schedule.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadHistory()}
            disabled={loading || !scheduleId}
            className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            History
          </button>

          <button
            type="button"
            onClick={() => moveWeek(-7)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Previous Week
          </button>

          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
            <span className="text-sm font-medium">Week of</span>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="py-2 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => moveWeek(7)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Next Week
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Schedule error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Supabase RLS is blocking this action. Confirm that schedules and
              schedule_entries have select, insert, update, and delete policies.
            </p>
          )}
        </div>
      )}

      {generationWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Generation warnings</h2>
              <p className="text-sm">
                The generator created the best schedule it could, but these items
                should be reviewed before saving.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGenerationWarnings([])}
              className="self-start rounded-lg border border-amber-400 px-3 py-1 text-sm font-medium hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>

          <ul className="mt-3 space-y-1 text-sm">
            {generationWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-black tracking-wide ${
              status === "Published"
                ? "bg-green-100 text-green-800 ring-1 ring-green-300"
                : status === "Approved"
                  ? "bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                  : "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
            }`}
          >
            {status.toUpperCase()}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Approved">Approved</option>
            </select>
          </label>

          <span className="text-sm text-slate-500">
            {lastSaved
              ? `Last saved ${new Date(lastSaved).toLocaleString()}`
              : scheduleId
                ? "Saved week loaded"
                : "New unsaved week"}
          </span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
            Rules: {rules.openersPerDay} open · {rules.closersPerDay} close · {rules.targetHours} hrs · {savedRules.length} saved
          </span>
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
            Approved PTO: {ptoRecords.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generateStarterSchedule}
            disabled={loading || employees.length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Auto Generate Schedule
          </button>

          <button
            type="button"
            onClick={() => void publishSchedule()}
            disabled={
              loading ||
              saving ||
              publishing ||
              employees.length === 0
            }
            className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish Schedule"}
          </button>

          <button
            type="button"
            onClick={() => void copyShareLink()}
            disabled={loading}
            className="rounded-lg border border-green-300 px-4 py-2 font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Copy Team Link
          </button>

          <button
            type="button"
            onClick={() => void clearSchedule()}
            disabled={loading}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => void saveSchedule()}
            disabled={loading || saving || employees.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Schedule"}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Schedule history</h2><p className="text-sm text-slate-500">Restore a previous saved version, then review and save it.</p></div><button onClick={()=>setShowHistory(false)} className="rounded-lg border px-3 py-2">Close</button></div>
          <div className="mt-4 divide-y">
            {versions.length ? versions.map(version => (
              <div key={version.id} className="flex items-center justify-between gap-4 py-3">
                <div><p className="font-semibold">{version.version_label}</p><p className="text-sm text-slate-500">{new Date(version.created_at).toLocaleString()} · {version.schedule_status}</p></div>
                <button onClick={()=>restoreVersion(version)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Restore</button>
              </div>
            )) : <p className="py-4 text-slate-500">No earlier versions yet.</p>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">Loading schedule...</div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No active employees were found. Add employees before creating a
          schedule.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="min-w-[1150px] w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="sticky left-0 z-20 min-w-52 bg-slate-900 p-3 text-left">
                  Employee
                </th>
                {WORK_DAYS.map((day, index) => {
                  const isToday =
                    addDays(weekStart, day.offset) === formatLocalDate(new Date());

                  return (
                  <th
                    key={day.name}
                    className={`min-w-36 p-3 text-center ${isToday ? "bg-blue-700 ring-2 ring-inset ring-blue-300" : ""}`}
                  >
                    <div>{day.name}</div>
                    <div className="text-xs font-normal text-slate-300">
                      {displayDate(addDays(weekStart, day.offset))}
                    </div>
                    <div className="mt-1 text-xs font-normal text-slate-300">
                      {dailyCoverage[index]?.openers ?? 0} open ·{" "}
                      {dailyCoverage[index]?.closers ?? 0} close
                    </div>
                  </th>
                  );
                })}
                <th className="min-w-24 p-3 text-center">Hours</th>
              </tr>
            </thead>

            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-slate-200">
                  <td className="sticky left-0 z-10 bg-white p-3">
                    <div className="font-semibold">{employee.employee_name}</div>
                    <div className="text-xs text-slate-500">
                      {employee.position || "No position"}
                    </div>
                  </td>

                  {WORK_DAYS.map((day) => {
                    const code =
                      grid[employee.id]?.[String(day.offset)] ?? "OFF";
                    const shift = getShift(code, shiftOptions);
                    const approvedPTO = isApprovedPTO(employee.id, day.offset);

                    return (
                      <td key={day.name} className="p-2">
                        <select
                          value={code}
                          disabled={approvedPTO}
                          onChange={(event) =>
                            changeShift(
                              employee.id,
                              day.offset,
                              event.target.value as ShiftCode,
                            )
                          }
                          className={`w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium ${shift.className} ${approvedPTO ? "cursor-not-allowed opacity-80 ring-2 ring-purple-300" : ""}`}
                          title={approvedPTO ? "Approved PTO — manage this on the PTO page" : undefined}
                        >
                          {shiftOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}

                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex min-w-16 justify-center rounded-full px-3 py-1 font-bold ${
                        employeeHours[employee.id] > 40
                          ? "bg-red-100 text-red-800"
                          : employeeHours[employee.id] >= 38
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {employeeHours[employee.id].toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-slate-100 font-semibold">
                <td className="sticky left-0 bg-slate-100 p-3">
                  Daily coverage
                </td>
                {dailyCoverage.map((coverage, index) => (
                  <td key={WORK_DAYS[index].name} className="p-3 text-center text-sm">
                    {coverage.working} working
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-lg font-bold">Shift legend</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {shiftOptions.map((shift) => (
            <span
              key={shift.code}
              className={`rounded-full px-3 py-1 text-sm font-medium ${shift.className}`}
            >
              {shift.label} · {shift.hours} hrs
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
