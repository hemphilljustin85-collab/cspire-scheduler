"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../src/lib/supabase";
import { getCurrentStore } from "../../src/lib/store";
import {
  BUILT_IN_SHIFTS,
  HOLIDAY_SHORT_CODE,
  HOLIDAY_SHORT_SHIFT,
  STATUS_SHIFTS,
  STARTER_SHIFTS_HIDDEN,
  STARTER_SHIFTS_RULE,
  classifyShiftRoles,
  customShiftToDefinition,
  fallbackShift,
  isWorkingCode,
  type CustomShiftRow,
  type ShiftDefinition,
} from "../../src/lib/shifts";
import { holidayShiftFor, ruleToHoliday, type Holiday } from "../../src/lib/holidays";
import { timeOffCode } from "../../src/lib/timeOff";
import { CHECK_CATEGORIES, checkSchedule, type CheckIssue } from "../../src/lib/scheduleCheck";
import { EMPLOYEE_ORDER_RULE, parseEmployeeOrder, sortByEmployeeOrder } from "../../src/lib/employeeOrder";
import { closingPrefsFor } from "../../src/lib/closingPrefs";
import { findFix, type FixResult } from "../../src/lib/scheduleFix";
import {
  MonthGridSheet,
  PersonMonthSheet,
  shortTime,
  usePrintSheet,
  type PrintCell,
} from "../../src/components/PrintSheets";
import { downloadScheduleExcel } from "../../src/lib/scheduleExcel";

/** A schedule row that can be dragged by its handle (mouse, touch or keyboard). */
function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      className="-ml-1 mr-1 cursor-grab touch-none rounded px-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
  );
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition,
        position: "relative",
        zIndex: isDragging ? 30 : undefined,
      }}
      className={`border-b border-slate-200 ${isDragging ? "bg-blue-50 shadow-lg" : ""}`}
    >
      {children(handle)}
    </tr>
  );
}

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

/** An approved days off request: uses PTO, or is a regular day off (request_type "off"). */
type PTORecord = {
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  request_type?: string | null;
};

const DEFAULT_RULES: SchedulerRules = {
  openersPerDay: 2,
  closersPerDay: 2,
  targetHours: 40,
  daysOffPerWeek: 1,
  saturdayOffGoal: 1,
  managerSaturdayGoal: 2,
};

const SHIFT_OPTIONS: ShiftDefinition[] = BUILT_IN_SHIFTS;

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
  return options.find((shift) => shift.code === code) ?? fallbackShift(code);
}

type ViewMode = "week" | "month";

/** One scheduled day in the visible range (a week, or every week touching a month). */
type DayInfo = {
  name: string;
  /** 0 = Monday ... 5 = Saturday. */
  weekday: number;
  /** Days from the first Monday of the range; used as the grid key. */
  offset: number;
  date: string;
  weekIndex: number;
  /** False for days at the edges of a month view that belong to the next or previous month. */
  inMonth: boolean;
};

function firstOfMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(month: string, count: number): string {
  const date = parseLocalDate(month);
  return firstOfMonth(new Date(date.getFullYear(), date.getMonth() + count, 1));
}

function monthLabel(month: string): string {
  return parseLocalDate(month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Mondays of every Monday–Saturday week that has at least one day in the month. */
function monthWeekStarts(month: string): string[] {
  const first = parseLocalDate(month);
  if (first.getDay() === 0) first.setDate(2); // a month starting on Sunday begins with Monday the 2nd
  const last = formatLocalDate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const starts: string[] = [];
  for (let monday = getMonday(first); monday <= last; monday = addDays(monday, 7)) {
    starts.push(monday);
  }
  return starts;
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000);
}

function makeEmptyGrid(employees: Employee[], days: DayInfo[]): ScheduleGrid {
  const grid: ScheduleGrid = {};

  for (const employee of employees) {
    grid[employee.id] = {};

    for (const day of days) {
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
  // Month view is the default; Week view is still available.
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekStart, setWeekStart] = useState(getMonday());
  const [month, setMonth] = useState(firstOfMonth());
  // Saved schedule rows for the visible weeks, by week_start.
  const [weekRecords, setWeekRecords] = useState<Record<string, ScheduleRecord>>({});
  // Status picker (Week view only).
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
  const [showCheckDetails, setShowCheckDetails] = useState(true);
  const [publishing, setPublishing] = useState(false);
  // Every shift the app knows about (used to display saved schedules).
  const [shiftOptions, setShiftOptions] =
    useState<ShiftDefinition[]>(SHIFT_OPTIONS);
  const [customShifts, setCustomShifts] = useState<ShiftDefinition[]>([]);
  const [starterShiftsHidden, setStarterShiftsHidden] = useState(false);
  const [publicStoreSlug, setPublicStoreSlug] = useState("");
  const [storeName, setStoreName] = useState("");
  const [printSheet, startPrint] = usePrintSheet();
  const [printPersonId, setPrintPersonId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Display order of people (drag and drop); saved as one ai_rules row.
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [rowOrderRuleId, setRowOrderRuleId] = useState<string | null>(null);

  const isMonth = viewMode === "month";

  // The weeks on screen: one in Week view, every week touching the month in Month view.
  const weekStarts = useMemo(
    () => (isMonth ? monthWeekStarts(month) : [weekStart]),
    [isMonth, month, weekStart],
  );
  const rangeStart = weekStarts[0];
  const rangeKey = weekStarts.join(",");

  const days = useMemo<DayInfo[]>(
    () =>
      weekStarts.flatMap((start, weekIndex) =>
        WORK_DAYS.map((day) => {
          const date = addDays(start, day.offset);
          return {
            name: day.name,
            weekday: day.offset,
            offset: weekIndex * 7 + day.offset,
            date,
            weekIndex,
            inMonth: !isMonth || date.slice(0, 7) === month.slice(0, 7),
          };
        }),
      ),
    [weekStarts, isMonth, month],
  );

  const scheduleId = isMonth ? null : weekRecords[weekStart]?.id ?? null;

  // Shifts a manager can pick and the generator can use.
  const selectableShifts = useMemo(
    () => [
      ...STATUS_SHIFTS,
      ...(starterShiftsHidden ? [] : BUILT_IN_SHIFTS.filter((shift) => shift.starter)),
      ...customShifts,
    ],
    [customShifts, starterShiftsHidden],
  );
  const shiftRoles = useMemo(() => classifyShiftRoles(selectableShifts), [selectableShifts]);
  const isOpener = (code: string) => shiftRoles.openers.includes(code);
  const isCloser = (code: string) => shiftRoles.closers.includes(code);

  // Holidays (set up on the Holidays page) in the visible range, by day offset.
  const weekHolidays = useMemo(() => {
    const map = new Map<number, Holiday>();
    for (const rule of savedRules) {
      const holiday = ruleToHoliday(rule);
      if (!holiday) continue;
      const day = days.find((item) => item.date === holiday.date);
      if (day) map.set(day.offset, holiday);
    }
    return map;
  }, [savedRules, days]);

  /** The shift for a cell, using the holiday's hours and times on holiday dates. */
  function shiftFor(code: ShiftCode, dayOffset: number): ShiftDefinition {
    return holidayShiftFor(code, weekHolidays.get(dayOffset)) ?? getShift(code, shiftOptions);
  }

  // Shift codes that can't be used on each visible day, from the
  // "Allowed days for shift" / "Blocked days for shift" rules (set on the
  // Shifts page or the Rules page). Store-wide rules only.
  const blockedCodesByDay = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const day of days) {
      const weekOf = weekStarts[day.weekIndex];
      const active = savedRules.filter((rule) => !rule.employee_id && ruleAppliesToWeek(rule, weekOf));
      const allowed = active
        .filter((rule) => rule.rule_type === "allowed_days_for_shift")
        .map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions))
        .filter((rule): rule is ShiftDayRule => rule !== null);
      const blocked = active
        .filter((rule) => rule.rule_type === "blocked_days_for_shift")
        .map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions))
        .filter((rule): rule is ShiftDayRule => rule !== null);
      const codes = new Set<string>();
      for (const shift of new Set(allowed.map((rule) => rule.shift))) {
        if (!allowed.some((rule) => rule.shift === shift && rule.days.includes(day.weekday))) codes.add(shift);
      }
      for (const rule of blocked) if (rule.days.includes(day.weekday)) codes.add(rule.shift);
      map.set(day.offset, codes);
    }
    return map;
  }, [days, weekStarts, savedRules, shiftOptions]);

  /** Shifts offered in a cell's dropdown on a given day. */
  function optionsForDay(dayOffset: number): ShiftDefinition[] {
    const blocked = blockedCodesByDay.get(dayOffset);
    const usable = blocked && blocked.size > 0
      ? selectableShifts.filter((option) => !blocked.has(option.code))
      : selectableShifts;
    const holiday = weekHolidays.get(dayOffset);
    if (!holiday) return usable;
    const options = holiday.mode === "short" ? [...usable, HOLIDAY_SHORT_SHIFT] : usable;
    return options.map((option) => shiftFor(option.code, dayOffset));
  }

  function dayLabel(day: DayInfo) {
    return isMonth ? `${day.name} ${displayDate(day.date)}` : day.name;
  }

  useEffect(() => {
    void Promise.all([loadEmployees(), loadRules(), loadCustomShifts(), loadRowOrder()]);
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
    setStoreName(store.store_name);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const custom = ((data || []) as CustomShiftRow[]).map(customShiftToDefinition);
    setCustomShifts(custom);
    setShiftOptions([...SHIFT_OPTIONS, ...custom]);
  }

  useEffect(() => {
    if (employees.length > 0) {
      void (async () => {
        const records = await loadPTO();
        await loadSchedule(records);
      })();
    }
  }, [employees, rangeKey]);

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


  async function loadRowOrder() {
    const { data, error } = await supabase
      .from("ai_rules")
      .select("id, rule_value")
      .eq("rule_type", EMPLOYEE_ORDER_RULE)
      .is("employee_id", null)
      .limit(1);
    if (error) {
      console.error("Unable to load the schedule order:", error);
      return;
    }
    const row = (data as Array<{ id: string; rule_value: string }> | null)?.[0];
    setRowOrderRuleId(row?.id ?? null);
    setRowOrder(parseEmployeeOrder(row?.rule_value));
  }

  async function saveRowOrder(order: string[]) {
    const previousOrder = rowOrder;
    setRowOrder(order);
    const value = JSON.stringify(order);
    const result = rowOrderRuleId
      ? await supabase.from("ai_rules").update({ rule_value: value }).eq("id", rowOrderRuleId).select("id")
      : await supabase
          .from("ai_rules")
          .insert({ employee_id: null, rule_type: EMPLOYEE_ORDER_RULE, rule_value: value, start_date: null, end_date: null })
          .select("id");
    if (result.error || !result.data || result.data.length === 0) {
      setRowOrder(previousOrder);
      setErrorMessage(
        result.error?.message ||
          "The new order couldn't be saved. Your account may not have permission to change rules.",
      );
      return;
    }
    setRowOrderRuleId((result.data as Array<{ id: string }>)[0].id);
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

    setStarterShiftsHidden(
      allRules.some(
        (rule) =>
          !rule.employee_id &&
          rule.rule_type === STARTER_SHIFTS_RULE &&
          rule.rule_value === STARTER_SHIFTS_HIDDEN,
      ),
    );
    setRules(nextRules);
    setSavedRules(allRules);
    setRulesLoaded(true);
  }

  async function loadPTO(): Promise<PTORecord[]> {
    const rangeEnd = addDays(weekStarts[weekStarts.length - 1], 5);

    const { data, error } = await supabase
      .from("employee_time_off")
      // "*" so this works before and after the request_type column is added.
      .select("*")
      .eq("status", "Approved")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart);

    if (error) {
      console.error("Unable to load PTO:", error);
      setErrorMessage((current) =>
        current ? `${current} | ${error.message}` : error.message,
      );
      setPtoRecords([]);
      return [];
    }

    const records = (data as PTORecord[]) || [];
    setPtoRecords(records);
    return records;
  }

  async function loadSchedule(records: PTORecord[] = ptoRecords) {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const { data: schedules, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, week_start, status, updated_at")
      .in("week_start", weekStarts);

    if (scheduleError) {
      setErrorMessage(scheduleError.message);
      setLoading(false);
      return;
    }

    const nextRecords: Record<string, ScheduleRecord> = {};
    for (const schedule of (schedules as ScheduleRecord[]) || []) {
      nextRecords[schedule.week_start] = schedule;
    }
    const savedWeeks = Object.values(nextRecords);
    setWeekRecords(nextRecords);
    setStatus(nextRecords[weekStarts[0]]?.status || "Draft");
    setLastSaved(
      savedWeeks
        .map((record) => record.updated_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .pop() ?? null,
    );

    const nextGrid = makeEmptyGrid(employees, days);

    // One query per week keeps each response well under Supabase's row limit.
    const results = await Promise.all(
      savedWeeks.map((record) =>
        supabase
          .from("schedule_entries")
          .select("employee_id, shift_date, shift_code")
          .eq("schedule_id", record.id),
      ),
    );

    for (const { data: entries, error: entriesError } of results) {
      if (entriesError) {
        setErrorMessage(entriesError.message);
        continue;
      }

      for (const entry of entries || []) {
        const offset = daysBetween(rangeStart, entry.shift_date);
        if (nextGrid[entry.employee_id] && String(offset) in nextGrid[entry.employee_id]) {
          nextGrid[entry.employee_id][String(offset)] = entry.shift_code as ShiftCode;
        }
      }
    }

    setGrid(applyPTOToGrid(nextGrid, records));
    setLoading(false);
  }

  function approvedTimeOff(employeeId: string, dayOffset: number, records: PTORecord[] = ptoRecords) {
    const shiftDate = addDays(rangeStart, dayOffset);

    return records.find(
      (record) =>
        record.employee_id === employeeId &&
        record.status === "Approved" &&
        dateIsWithinRange(shiftDate, record.start_date, record.end_date),
    );
  }

  /** True when an approved days off request (PTO or a day off) locks this cell. */
  function isApprovedPTO(employeeId: string, dayOffset: number, records: PTORecord[] = ptoRecords) {
    return approvedTimeOff(employeeId, dayOffset, records) !== undefined;
  }

  /** The code an approved request locks in: PTO, or OFF for a day off without PTO. */
  function lockedCode(employeeId: string, dayOffset: number, records: PTORecord[] = ptoRecords) {
    const record = approvedTimeOff(employeeId, dayOffset, records);
    return record ? timeOffCode(record) : null;
  }

  function applyPTOToGrid(scheduleGrid: ScheduleGrid, records: PTORecord[] = ptoRecords) {
    const nextGrid: ScheduleGrid = {};

    for (const employee of employees) {
      nextGrid[employee.id] = { ...(scheduleGrid[employee.id] || {}) };

      for (const day of days) {
        const locked = lockedCode(employee.id, day.offset, records);
        if (locked) {
          nextGrid[employee.id][String(day.offset)] = locked;
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
      setErrorMessage("Approved days off can't be changed here. Edit them on the Days Off page.");
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
  }

  async function generateStarterSchedule() {
    if (!rulesLoaded) {
      setErrorMessage("Scheduling rules are still loading. Try again in a moment.");
      return;
    }

    const defaultShift = shiftRoles.defaultShift;
    if (!defaultShift) {
      setErrorMessage("Add at least one shift on the Shifts page before using Auto Generate.");
      return;
    }

    if (employees.length === 0) {
      setErrorMessage("Add your employees first, then Auto Generate can build the week.");
      return;
    }

    // In Month view, weeks that are already published are kept as they are
    // (they still count toward fairness). Use Week view to regenerate one.
    const keptWeeks = new Set(
      isMonth ? weekStarts.filter((start) => weekRecords[start]?.status === "Published") : [],
    );
    const generateWeek = (weekIndex: number) => !keptWeeks.has(weekStarts[weekIndex]);

    if (weekStarts.every((_, weekIndex) => !generateWeek(weekIndex))) {
      setErrorMessage("Every week in this month is already published. Switch to Week view to regenerate a week.");
      return;
    }

    const hasExistingShifts = employees.some((employee) =>
      days.some((day) => {
        if (!generateWeek(day.weekIndex)) return false;
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
        return !["OFF", "PTO"].includes(code);
      }),
    );

    if (
      hasExistingShifts &&
      !window.confirm(
        isMonth
          ? "Auto Generate will replace the current shifts for the unpublished weeks in this month. Continue?"
          : "Auto Generate will replace the current shifts for this week. Continue?",
      )
    ) {
      return;
    }

    // Start from the current grid so kept (published) weeks stay untouched.
    const generated: ScheduleGrid = {};
    for (const employee of employees) {
      generated[employee.id] = {};
      for (const day of days) {
        generated[employee.id][String(day.offset)] = generateWeek(day.weekIndex)
          ? "OFF"
          : grid[employee.id]?.[String(day.offset)] ?? "OFF";
      }
    }

    // Running totals, so opens, closes and Saturdays off are shared fairly
    // over the month (and against last month), not just within one week.
    const opens: Record<string, number> = {};
    const closes: Record<string, number> = {};
    const saturdaysOff: Record<string, number> = {};
    // Opens and closes by weekday (0 = Monday), e.g. how many Saturdays someone has closed.
    const opensOn: Record<string, number[]> = {};
    const closesOn: Record<string, number[]> = {};
    // Opens and closes per calendar month and weekday, for the monthly preferred-amount rules.
    const monthlyCounts: Record<string, Record<string, number>> = {};
    employees.forEach((employee) => {
      opens[employee.id] = 0;
      closes[employee.id] = 0;
      saturdaysOff[employee.id] = 0;
      opensOn[employee.id] = WORK_DAYS.map(() => 0);
      closesOn[employee.id] = WORK_DAYS.map(() => 0);
      monthlyCounts[employee.id] = {};
    });

    const monthlyKey = (kind: "open" | "close", date: string, weekday: number) =>
      `${kind}|${date.slice(0, 7)}|${weekday}`;

    function recordShift(employeeId: string, date: string, weekday: number, code: ShiftCode, change = 1) {
      if (!(employeeId in opens)) return;
      if (isOpener(code)) {
        opens[employeeId] += change;
        opensOn[employeeId][weekday] += change;
        const key = monthlyKey("open", date, weekday);
        monthlyCounts[employeeId][key] = (monthlyCounts[employeeId][key] ?? 0) + change;
      }
      if (isCloser(code)) {
        closes[employeeId] += change;
        closesOn[employeeId][weekday] += change;
        const key = monthlyKey("close", date, weekday);
        monthlyCounts[employeeId][key] = (monthlyCounts[employeeId][key] ?? 0) + change;
      }
    }

    // Review the saved schedule from the previous month (and, in Week view,
    // earlier weeks of this month) so this schedule evens things out.
    const historyStart = addMonths(firstOfMonth(parseLocalDate(isMonth ? month : rangeStart)), -1);
    let historyShifts = 0;
    {
      const { data: pastWeeks, error: pastError } = await supabase
        .from("schedules")
        .select("id, week_start")
        .gte("week_start", getMonday(parseLocalDate(historyStart)))
        .lt("week_start", rangeStart);

      if (pastError) {
        setErrorMessage(`Couldn't read last month's schedule: ${pastError.message}`);
        return;
      }

      const pastEntries = await Promise.all(
        ((pastWeeks as Array<{ id: string }>) || []).map((week) =>
          supabase
            .from("schedule_entries")
            .select("employee_id, shift_date, shift_code")
            .eq("schedule_id", week.id),
        ),
      );

      for (const { data: entries, error: entriesError } of pastEntries) {
        if (entriesError) {
          setErrorMessage(`Couldn't read last month's schedule: ${entriesError.message}`);
          return;
        }
        for (const entry of (entries as Array<{ employee_id: string; shift_date: string; shift_code: string }>) || []) {
          if (entry.shift_date < historyStart || entry.shift_date >= rangeStart) continue;
          if (!(entry.employee_id in opens)) continue;
          const weekday = (parseLocalDate(entry.shift_date).getDay() + 6) % 7;
          if (weekday > 5) continue;
          recordShift(entry.employee_id, entry.shift_date, weekday, entry.shift_code);
          if (weekday === 5 && !isWorkingCode(entry.shift_code)) saturdaysOff[entry.employee_id] += 1;
          historyShifts += 1;
        }
      }
    }

    // Monthly preferred amounts: "DAY|NUMBER" per employee, or for everyone
    // when the rule has no employee (a rule for one person overrides it).
    function parseMonthlyTargets(ruleType: string, ruleList: SavedRule[]) {
      const targets = new Map<string, Map<number, number>>();
      for (const rule of ruleList) {
        if (rule.rule_type !== ruleType) continue;
        const [dayValue, countValue] = rule.rule_value.split("|");
        const weekday = normalizeDayName(dayValue || "");
        const count = Number(countValue);
        if (weekday === null || !Number.isFinite(count) || count < 0) continue;
        const who = rule.employee_id || "*";
        const existing = targets.get(who) ?? new Map<number, number>();
        existing.set(weekday, Math.floor(count));
        targets.set(who, existing);
      }
      return targets;
    }

    function monthlyTarget(targets: Map<string, Map<number, number>>, employeeId: string, weekday: number) {
      return targets.get(employeeId)?.get(weekday) ?? targets.get("*")?.get(weekday);
    }

    const codeAt = (employeeId: string, day: DayInfo) =>
      lockedCode(employeeId, day.offset) ?? generated[employeeId][String(day.offset)] ?? "OFF";

    function tallyDay(day: DayInfo) {
      for (const employee of employees) {
        recordShift(employee.id, day.date, day.weekday, codeAt(employee.id, day));
      }
    }

    function tallySaturday(day: DayInfo) {
      if (day.weekday !== 5) return;
      for (const employee of employees) {
        if (!isWorkingCode(codeAt(employee.id, day))) saturdaysOff[employee.id] += 1;
      }
    }

    const employeeCount = employees.length;
    const workingDays = WORK_DAYS.length;
    const daysOff = Math.min(
      Math.max(rules.daysOffPerWeek, 0),
      Math.max(workingDays - 1, 0),
    );

    const managers = employees.filter((employee) =>
      (employee.position || "").toLowerCase().includes("manager"),
    );

    const saturdayIndex = 5;
    const saturdayOffTarget = Math.min(
      rules.saturdayOffGoal,
      Math.max(employeeCount - rules.openersPerDay - rules.closersPerDay, 0),
    );

    const employeePosition = (employee: Employee) =>
      employees.findIndex((item) => item.id === employee.id);

    // Rotate people by a running day number so the order keeps moving across weeks.
    const byRotation = (list: Employee[], sequence: number) =>
      [...list].sort(
        (a, b) =>
          ((employeePosition(a) + sequence) % Math.max(employeeCount, 1)) -
          ((employeePosition(b) + sequence) % Math.max(employeeCount, 1)),
      );

    let sequence = 0;
    let rulesUsed = 0;

    weekStarts.forEach((weekOf, weekIndex) => {
      const weekDays = days.filter((day) => day.weekIndex === weekIndex);

      if (!generateWeek(weekIndex)) {
        weekDays.forEach((day) => {
          tallyDay(day);
          tallySaturday(day);
        });
        sequence += weekDays.length;
        return;
      }

      const activeRules = savedRules.filter((rule) => ruleAppliesToWeek(rule, weekOf));
      rulesUsed = Math.max(rulesUsed, activeRules.length);
      const allowedShiftDays = activeRules.filter((rule) => rule.rule_type === "allowed_days_for_shift").map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions)).filter((rule): rule is ShiftDayRule => rule !== null);
      const blockedShiftDays = activeRules.filter((rule) => rule.rule_type === "blocked_days_for_shift").map((rule) => parseShiftDayRule(rule.rule_value, shiftOptions)).filter((rule): rule is ShiftDayRule => rule !== null);
      const employeeUnavailableDays = new Map<string, Set<number>>();
      const employeePreferredDaysOff = new Map<string, Set<number>>();
      const employeeRequiredShifts = new Map<string, Map<number, ShiftCode>>();

      for (const rule of activeRules) {
        if (!rule.employee_id) continue;
        if (rule.rule_type === "unavailable") {
          const values = rule.rule_value.split(",").map(normalizeDayName).filter((day): day is number => day !== null);
          employeeUnavailableDays.set(rule.employee_id, new Set(values));
        }
        if (rule.rule_type === "preferred_day_off") {
          const values = rule.rule_value.split(",").map(normalizeDayName).filter((day): day is number => day !== null);
          employeePreferredDaysOff.set(rule.employee_id, new Set(values));
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

      function shiftAllowedOnDay(shift: ShiftCode, weekday: number) {
        const allowedRules = allowedShiftDays.filter((rule) => rule.shift === shift);
        if (allowedRules.length > 0 && !allowedRules.some((rule) => rule.days.includes(weekday))) return false;
        if (blockedShiftDays.some((rule) => rule.shift === shift && rule.days.includes(weekday))) return false;
        return true;
      }

      const openTargets = parseMonthlyTargets("monthly_open_target", activeRules);
      const closeTargets = parseMonthlyTargets("monthly_close_target", activeRules);

      /** 0 = still under their monthly target for this day, 1 = no target, 2 = target reached. */
      function targetPriority(kind: "open" | "close", employee: Employee, day: DayInfo) {
        const target = monthlyTarget(kind === "open" ? openTargets : closeTargets, employee.id, day.weekday);
        if (target === undefined) return 1;
        const count = monthlyCounts[employee.id][monthlyKey(kind, day.date, day.weekday)] ?? 0;
        return count < target ? 0 : 2;
      }

      function chooseOpeningShift(weekday: number, position: number): ShiftCode {
        // Rotate through the opening shifts so the earliest start is shared.
        const openers = shiftRoles.openers;
        const rotation = openers.length > 0 ? position % openers.length : 0;
        const preferred: ShiftCode[] = [
          ...openers.slice(rotation),
          ...openers.slice(0, rotation),
          ...shiftRoles.mids,
        ];
        return preferred.find((shift) => shiftAllowedOnDay(shift, weekday)) ?? regularShiftFor(weekday);
      }

      function chooseClosingShift(weekday: number): ShiftCode {
        return shiftRoles.closers.find((shift) => shiftAllowedOnDay(shift, weekday)) ?? regularShiftFor(weekday);
      }

      /**
       * The regular shift for a weekday: the default shift if it can be used that
       * day, otherwise the first middle, opening or closing shift that can.
       * "OFF" when no shift is allowed that day.
       */
      function regularShiftFor(weekday: number): ShiftCode {
        const candidates = [defaultShift!, ...shiftRoles.mids, ...shiftRoles.openers, ...shiftRoles.closers];
        return candidates.find((shift) => shiftAllowedOnDay(shift, weekday)) ?? "OFF";
      }

      // Days off for this week, by weekday (0 = Monday).
      const plannedDaysOff: Record<string, Set<number>> = {};

      employees.forEach((employee, employeeIndex) => {
        plannedDaysOff[employee.id] = new Set<number>();

        for (const day of weekDays) {
          if (isApprovedPTO(employee.id, day.offset)) {
            plannedDaysOff[employee.id].add(day.weekday);
          }
          // A day the business is closed counts toward each person's days off.
          if (weekHolidays.get(day.offset)?.mode === "closed") {
            plannedDaysOff[employee.id].add(day.weekday);
          }
        }

        employeeUnavailableDays.get(employee.id)?.forEach((day) => plannedDaysOff[employee.id].add(day));
        employeePreferredDaysOff.get(employee.id)?.forEach((day) => plannedDaysOff[employee.id].add(day));

        // Rotating days off move each week so nobody always gets the same one.
        // They land on Monday–Friday; Saturdays off are shared out fairly below.
        const weekdaysOnly = workingDays - 1;
        for (let offNumber = plannedDaysOff[employee.id].size; offNumber < daysOff; offNumber += 1) {
          let offDay = (employeeIndex + weekIndex + offNumber * 2) % weekdaysOnly;
          let tries = 0;
          while (plannedDaysOff[employee.id].has(offDay) && tries < weekdaysOnly) {
            offDay = (offDay + 1) % weekdaysOnly;
            tries += 1;
          }
          if (plannedDaysOff[employee.id].has(offDay)) offDay = saturdayIndex;
          plannedDaysOff[employee.id].add(offDay);
        }
      });

      // Saturdays off go to whoever has had the fewest so far this month.
      let saturdayOffAssigned = employees.filter((employee) =>
        plannedDaysOff[employee.id].has(saturdayIndex),
      ).length;
      const saturdayCandidates = byRotation(
        employees.filter((employee) => !plannedDaysOff[employee.id].has(saturdayIndex)),
        weekIndex,
      ).sort((a, b) => saturdaysOff[a.id] - saturdaysOff[b.id]);

      for (const employee of saturdayCandidates) {
        if (saturdayOffAssigned >= saturdayOffTarget) break;
        const isManager = managers.some((manager) => manager.id === employee.id);
        if (!isManager || managers.length > rules.managerSaturdayGoal) {
          plannedDaysOff[employee.id].add(saturdayIndex);
          saturdayOffAssigned += 1;
        }
      }

      for (const day of weekDays) {
        const dayIndex = day.weekday;
        const daySequence = sequence;
        sequence += 1;

        const holiday = weekHolidays.get(day.offset);
        if (holiday) {
          // Closed: everyone is off for the holiday. Short day: enough people
          // to cover the usual opener/closer counts work the shortened hours.
          const staffNeeded =
            holiday.mode === "short" ? Math.max(rules.openersPerDay, rules.closersPerDay, 1) : 0;
          const canWork = employees.filter(
            (employee) =>
              !isApprovedPTO(employee.id, day.offset) &&
              !(employeeUnavailableDays.get(employee.id)?.has(dayIndex) ?? false),
          );
          const preferred = byRotation(canWork.filter((employee) => !plannedDaysOff[employee.id]?.has(dayIndex)), daySequence);
          const backup = byRotation(canWork.filter((employee) => plannedDaysOff[employee.id]?.has(dayIndex)), daySequence);
          const workers = new Set([...preferred, ...backup].slice(0, staffNeeded).map((employee) => employee.id));

          employees.forEach((employee) => {
            generated[employee.id][String(day.offset)] = workers.has(employee.id) ? HOLIDAY_SHORT_CODE : "HOLIDAY";
          });
          continue;
        }

        const available = employees.filter(
          (employee) => !plannedDaysOff[employee.id]?.has(dayIndex),
        );

        const rotated = byRotation(available, daySequence);

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

        // Openers and closers: people still under a monthly preferred amount
        // first, people who have reached it last; then whoever has opened or
        // closed this weekday the fewest times (this month and last), then the
        // fewest overall. Ties keep the rotation order.
        // Closing preferences: avoid someone's "prefer not to close" days, and
        // keep closes back-to-back (or spread apart) for people who asked.
        const closedYesterday = (employee: Employee) =>
          dayIndex > 0 && isCloser(generated[employee.id][String(day.offset - 1)] ?? "OFF");
        const closedEarlierThisWeek = (employee: Employee) =>
          weekDays.some((other) => other.weekday < dayIndex - 1 && isCloser(generated[employee.id][String(other.offset)] ?? "OFF"));
        // A fair share of closes per person per week, so "back-to-back" never
        // turns into closing every night.
        const weeklyCloseShare = Math.max(1, Math.ceil((rules.closersPerDay * WORK_DAYS.length) / Math.max(employeeCount, 1)));
        const closesThisWeek = (employee: Employee) =>
          weekDays.filter((other) => other.weekday < dayIndex && isCloser(generated[employee.id][String(other.offset)] ?? "OFF")).length;
        const preferenceScore = (employee: Employee) => {
          const prefs = closingPrefsFor(savedRules, employee.id, weekOf);
          let score = prefs.avoidDays.has(dayIndex) ? 2 : 0;
          if (prefs.pattern === "together") {
            // Continue a run of closes up to their share; don't start a second, separate run this week.
            if (closesThisWeek(employee) >= weeklyCloseShare) score += 1;
            else if (closedYesterday(employee)) score -= 1;
            else if (closedEarlierThisWeek(employee)) score += 1;
          }
          if (prefs.pattern === "apart" && closedYesterday(employee)) score += 1;
          return score;
        };
        // Keep someone who wants back-to-back closes free to close again tonight.
        const keepForClosing = (employee: Employee) => Number(preferenceScore(employee) < 0);

        const wd = dayIndex;
        const openersToday = [...rotated]
          .sort(
            (a, b) =>
              targetPriority("open", a, day) - targetPriority("open", b, day) ||
              Number(targetPriority("close", a, day) === 0) - Number(targetPriority("close", b, day) === 0) ||
              keepForClosing(a) - keepForClosing(b) ||
              opensOn[a.id][wd] - opensOn[b.id][wd] ||
              opens[a.id] - opens[b.id],
          )
          .slice(0, openerCount);
        const closersToday = rotated
          .filter((employee) => !openersToday.includes(employee))
          .sort(
            (a, b) =>
              targetPriority("close", a, day) - targetPriority("close", b, day) ||
              preferenceScore(a) - preferenceScore(b) ||
              closesOn[a.id][wd] - closesOn[b.id][wd] ||
              closes[a.id] - closes[b.id],
          )
          .slice(0, closerCount);

        rotated.forEach((employee) => {
          let shift: ShiftCode = regularShiftFor(dayIndex);
          const openerPosition = openersToday.indexOf(employee);

          if (openerPosition >= 0) {
            shift = chooseOpeningShift(dayIndex, openerPosition);
          } else if (closersToday.includes(employee)) {
            shift = chooseClosingShift(dayIndex);
          }
          const requiredShift = employeeRequiredShifts.get(employee.id)?.get(dayIndex);
          generated[employee.id][String(day.offset)] = requiredShift && shiftAllowedOnDay(requiredShift, dayIndex) ? requiredShift : shift;
        });

        employees.forEach((employee) => {
          if (!rotated.some((workingEmployee) => workingEmployee.id === employee.id)) {
            generated[employee.id][String(day.offset)] = "OFF";
          }
        });

        tallyDay(day);
      }

      // Balance each person's hours for this week. Approved PTO counts
      // toward the hours, and PTO days are never filled with a shift.
      employees.forEach((employee) => {
        let currentHours = weekDays.reduce((total, day) => {
          return total + shiftFor(codeAt(employee.id, day), day.offset).hours;
        }, 0);

        if (currentHours > rules.targetHours + 1) {
          // Trim regular shifts from the end of the week, Saturdays last,
          // so Saturday coverage and Saturday-off fairness aren't disturbed.
          const middleDays = weekDays
            .filter((day) => {
              const code = generated[employee.id][String(day.offset)];
              return code !== "OFF" && code === regularShiftFor(day.weekday);
            })
            .reverse()
            .sort((a, b) => Number(a.weekday === saturdayIndex) - Number(b.weekday === saturdayIndex));

          for (const day of middleDays) {
            if (currentHours <= rules.targetHours + 1) break;

            const trimmed = generated[employee.id][String(day.offset)];
            generated[employee.id][String(day.offset)] = "OFF";
            recordShift(employee.id, day.date, day.weekday, trimmed, -1);
            currentHours -= getShift(trimmed, shiftOptions).hours;
          }
        }

        if (currentHours < rules.targetHours - 4) {
          const offDays = weekDays.filter(
            (day) =>
              generated[employee.id][String(day.offset)] === "OFF" &&
              !isApprovedPTO(employee.id, day.offset) &&
              // Keep a planned Saturday off so the Saturday-off goal holds.
              !(day.weekday === saturdayIndex && plannedDaysOff[employee.id].has(saturdayIndex)),
          );

          for (const day of offDays) {
            if (currentHours >= rules.targetHours - 4) break;

            const coverage = employees.filter((otherEmployee) => {
              const code =
                generated[otherEmployee.id][String(day.offset)] ?? "OFF";
              return isWorkingCode(code);
            }).length;

            const isUnavailable = employeeUnavailableDays.get(employee.id)?.has(day.weekday) ?? false;
            const requiredShift = employeeRequiredShifts.get(employee.id)?.get(day.weekday);
            if (coverage < employeeCount && !isUnavailable && !requiredShift) {
              // Fill a missing closer or opener first, otherwise a regular shift.
              const codesToday = employees.map((other) => generated[other.id][String(day.offset)] ?? "OFF");
              // (Skipped for someone who has already reached their monthly amount.)
              const fillShift =
                codesToday.filter(isCloser).length < rules.closersPerDay &&
                targetPriority("close", employee, day) !== 2 &&
                !closingPrefsFor(savedRules, employee.id, weekOf).avoidDays.has(day.weekday)
                  ? chooseClosingShift(day.weekday)
                  : codesToday.filter(isOpener).length < rules.openersPerDay && targetPriority("open", employee, day) !== 2
                    ? chooseOpeningShift(day.weekday, codesToday.filter(isOpener).length)
                    : regularShiftFor(day.weekday);
              if (fillShift !== "OFF" && shiftAllowedOnDay(fillShift, day.weekday)) {
                generated[employee.id][String(day.offset)] = fillShift;
                currentHours += getShift(fillShift, shiftOptions).hours;
                recordShift(employee.id, day.date, day.weekday, fillShift);
              }
            }
          }
        }
      });

      weekDays.forEach(tallySaturday);
    });

    const generatedWithPTO = applyPTOToGrid(generated);

    const historyNote =
      historyShifts > 0
        ? ` Balanced against ${historyShifts} saved shift(s) since ${displayDate(historyStart)}.`
        : ` No saved schedule found for ${monthLabel(historyStart)}, so balancing starts fresh.`;
    const holidayNote =
      weekHolidays.size > 0
        ? ` Holidays applied: ${Array.from(weekHolidays.values()).map((holiday) => holiday.name).join(", ")}.`
        : "";
    const keptNote =
      keptWeeks.size > 0
        ? ` Kept ${keptWeeks.size} published week(s) as they were.`
        : "";
    const scope = isMonth ? `${monthLabel(month)} generated` : "Schedule generated";
    const found = runCheck(generatedWithPTO);
    const problems = found.filter((issue) => issue.severity === "problem").length;
    setGrid(generatedWithPTO);
    setShowCheckDetails(true);
    setMessage(
      (found.length === 0
        ? `${scope} using ${rulesUsed} saved rule(s). The schedule check found no issues.`
        : `${scope} using ${rulesUsed} saved rule(s). The schedule check found ${problems} problem(s) and ${found.length - problems} heads-up(s); review them below before saving.`) +
        keptNote +
        historyNote +
        holidayNote,
    );
    setErrorMessage("");
  }

  async function updateScheduleMetrics() {
    const now = new Date().toISOString();

    const metricRows = employees.map((employee) => {
      let totalHours = 0;
      let mondayCloses = 0;
      let fridayCloses = 0;
      let saturdayCloses = 0;
      let saturdaysOffCount = 0;
      let daysOffCount = 0;

      for (const day of days) {
        const code = lockedCode(employee.id, day.offset) ?? grid[employee.id]?.[String(day.offset)] ?? "OFF";

        totalHours += shiftFor(code, day.offset).hours;

        if (code === "OFF") {
          daysOffCount += 1;
        }

        if (day.weekday === 0 && isCloser(code)) {
          mondayCloses += 1;
        }

        if (day.weekday === 4 && isCloser(code)) {
          fridayCloses += 1;
        }

        if (day.weekday === 5) {
          if (isCloser(code)) {
            saturdayCloses += 1;
          }

          if (code === "OFF") {
            saturdaysOffCount += 1;
          }
        }
      }

      return {
        employee_id: employee.id,
        monday_closes: mondayCloses,
        friday_closes: fridayCloses,
        saturday_closes: saturdayCloses,
        saturdays_off: saturdaysOffCount,
        // Average weekly hours, so a month compares to the weekly target.
        current_hours: Math.round((totalHours / weekStarts.length) * 100) / 100,
        total_hours: totalHours,
        days_off: daysOffCount,
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

  /**
   * Save every visible week: create or update its schedule row, snapshot the
   * previous version, then write the week's entries. Returns an error message.
   */
  async function persistWeeks(publish: boolean): Promise<string | null> {
    const nextRecords = { ...weekRecords };
    const now = new Date().toISOString();

    for (const [weekIndex, weekOf] of weekStarts.entries()) {
      let record = nextRecords[weekOf];
      // Week view uses the Status picker; Month view keeps each week's own status.
      const nextStatus = publish ? "Published" : isMonth ? record?.status || "Draft" : status;

      if (!record) {
        const { data, error } = await supabase
          .from("schedules")
          .insert({ week_start: weekOf, status: nextStatus })
          .select("id, week_start, status, updated_at")
          .single();

        if (error) return error.message;
        record = data as ScheduleRecord;
      } else {
        const previousStatus = record.status;
        const { error } = await supabase
          .from("schedules")
          .update({ status: nextStatus })
          .eq("id", record.id);

        if (error) return error.message;
        await snapshotExistingSchedule(record.id, publish ? "Before publish" : "Before save", previousStatus);
      }

      const entries = employees.flatMap((employee) =>
        days
          .filter((day) => day.weekIndex === weekIndex)
          .map((day) => {
            const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
            const shift = shiftFor(code, day.offset);

            return {
              schedule_id: record.id,
              employee_id: employee.id,
              shift_date: day.date,
              shift_code: shift.code,
              start_time: shift.start_time,
              end_time: shift.end_time,
              hours: shift.hours,
              updated_at: now,
            };
          }),
      );

      const { error: entriesError } = await supabase
        .from("schedule_entries")
        .upsert(entries, {
          onConflict: "schedule_id,employee_id,shift_date",
        });

      nextRecords[weekOf] = { ...record, status: nextStatus, updated_at: now };
      setWeekRecords({ ...nextRecords });

      if (entriesError) return entriesError.message;
    }

    return null;
  }

  async function saveSchedule() {
    if (employees.length === 0) {
      setErrorMessage("Add at least one active employee before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const saveError = await persistWeeks(false);
    if (saveError) {
      setErrorMessage(saveError);
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
          parts.join(" | ") || "please try again"
        }`,
      );

      setSaving(false);
      return;
    }

    setMessage(
      isMonth
        ? `${monthLabel(month)} saved (${weekStarts.length} weeks) and metrics updated.`
        : "Schedule and metrics saved successfully.",
    );
    setLastSaved(new Date().toISOString());
    setSaving(false);
  }

  async function publishSchedule() {
    if (employees.length === 0) {
      setErrorMessage("Add at least one active employee before publishing.");
      return;
    }

    const problems = issues.filter((issue) => issue.severity === "problem");
    if (problems.length > 0) {
      setShowCheckDetails(true);
      const confirmed = window.confirm(
        `The schedule check found ${problems.length} problem(s), like missing openers/closers or someone without a day off. Publish anyway?`,
      );
      if (!confirmed) return;
    }

    setPublishing(true);
    setMessage("");
    setErrorMessage("");

    const publishError = await persistWeeks(true);
    if (publishError) {
      setErrorMessage(publishError);
      setPublishing(false);
      return;
    }

    const metricsError = await updateScheduleMetrics();

    if (metricsError) {
      setErrorMessage(
        `Schedule published, but metrics were not updated: ${
          metricsError.message || "please try again"
        }`,
      );
      setPublishing(false);
      return;
    }

    setStatus("Published");
    setLastSaved(new Date().toISOString());
    setMessage(
      isMonth
        ? `${monthLabel(month)} published (${weekStarts.length} weeks). Employees can now view it on the read-only Team Schedule.`
        : "Schedule published successfully. Employees can now view the read-only Team Schedule.",
    );
    setPublishing(false);
  }

  async function snapshotExistingSchedule(activeScheduleId: string, label: string, previousStatus: string) {
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
      schedule_status: previousStatus,
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
    const restored = makeEmptyGrid(employees, days);
    for (const entry of version.entries) {
      const offset = daysBetween(rangeStart, entry.shift_date);
      if (restored[entry.employee_id] && String(offset) in restored[entry.employee_id]) {
        restored[entry.employee_id][String(offset)] = entry.shift_code;
      }
    }
    setGrid(applyPTOToGrid(restored));
    setStatus("Draft");
    setShowHistory(false);
    setMessage("Previous version restored for review. Click Save Schedule to keep it.");
  }

  async function copyShareLink() {
    // In Month view, link to this week if it's in the month, otherwise the month's first week.
    const today = formatLocalDate(new Date());
    const linkWeek = isMonth
      ? weekStarts.find((start) => today >= start && today <= addDays(start, 6)) ??
        weekStarts.find((start) => start.slice(0, 7) === month.slice(0, 7)) ??
        rangeStart
      : weekStart;
    const shareUrl = `${window.location.origin}/team-schedule?store=${encodeURIComponent(publicStoreSlug)}&week=${linkWeek}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage(
        isMonth
          ? "Team Schedule link copied. Your team can use the arrows on that page to see the other weeks."
          : "Team Schedule link copied to your clipboard.",
      );
      setErrorMessage("");
    } catch {
      window.prompt("Copy this Team Schedule link:", shareUrl);
    }
  }

  async function clearSchedule() {
    const confirmed = window.confirm(
      isMonth
        ? `Clear every shift in ${monthLabel(month)}? Nothing is saved until you click Save.`
        : "Clear every shift for this week? The blank schedule will not be saved until you click Save Schedule.",
    );

    if (!confirmed) return;

    setGrid(applyPTOToGrid(makeEmptyGrid(employees, days)));
    if (!isMonth) setStatus("Draft");
    setMessage(
      isMonth
        ? "Month cleared. Click Save Month to store the changes."
        : "Schedule cleared. Click Save Schedule to store the changes.",
    );
    setErrorMessage("");
  }

  // People in the order chosen by drag and drop (new people go at the end).
  // Auto Generate keeps using the alphabetical list, so reordering doesn't change the schedule.
  const orderedEmployees = useMemo(() => sortByEmployeeOrder(employees, rowOrder), [employees, rowOrder]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedEmployees.map((employee) => employee.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void saveRowOrder(arrayMove(ids, from, to));
  }

  async function resetRowOrder() {
    if (!rowOrderRuleId) return;
    const { data, error } = await supabase.from("ai_rules").delete().eq("id", rowOrderRuleId).select("id");
    if (error || !data || data.length === 0) {
      setErrorMessage(error?.message || "The order couldn't be reset. Your account may not have permission to change rules.");
      return;
    }
    setRowOrderRuleId(null);
    setRowOrder([]);
    setMessage("Order reset to A–Z.");
  }

  // ---- Export & print ----

  /** Days to export/print: the month's own days in Month view, the week in Week view. */
  const outputDays = isMonth ? days.filter((day) => day.inMonth) : days;
  const outputTitle = isMonth ? `${monthLabel(month)} schedule` : `Schedule · week of ${displayDate(weekStart)}`;

  function printCellFor(employeeId: string, day: DayInfo): PrintCell {
    const code = grid[employeeId]?.[String(day.offset)] ?? "OFF";
    const shift = shiftFor(code, day.offset);
    const working = isWorkingCode(code);
    const label = code === "OFF" ? "Off" : code === "PTO" ? "PTO" : shift.label;
    const short =
      working && shift.start_time
        ? [shortTime(shift.start_time), shortTime(shift.end_time)]
        : code === "OFF"
          ? [""]
          : code === "PTO"
            ? ["PTO"]
            : code === "HOLIDAY"
              ? ["Hol"]
              : [code];
    return { label, short, className: shift.className, hours: shift.hours, working };
  }

  function printMonthGrid() {
    const usedCodes = new Set(
      orderedEmployees.flatMap((employee) => outputDays.map((day) => grid[employee.id]?.[String(day.offset)] ?? "OFF")),
    );
    startPrint(
      <MonthGridSheet
        title={`${storeName ? `${storeName} · ` : ""}${outputTitle}`}
        subtitle={`Printed ${new Date().toLocaleDateString()}`}
        days={outputDays.map((day) => ({ date: day.date, weekday: day.weekday }))}
        rows={orderedEmployees.map((employee) => {
          const cells = outputDays.map((day) => printCellFor(employee.id, day));
          return { id: employee.id, name: employee.employee_name, position: employee.position, cells, total: cells.reduce((sum, cell) => sum + cell.hours, 0) };
        })}
        legend={selectableShifts
          .filter((shift) => shift.code !== "OFF" && usedCodes.has(shift.code))
          .map((shift) => ({ label: shift.label, className: shift.className }))}
      />,
    );
  }

  function printPerson(employeeId: string) {
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    const cellsByDate = new Map(outputDays.map((day) => [day.date, printCellFor(employee.id, day)]));
    startPrint(
      <PersonMonthSheet
        storeName={storeName}
        name={employee.employee_name}
        month={isMonth ? month : firstOfMonth(parseLocalDate(weekStart))}
        cellsByDate={cellsByDate}
        note={isMonth ? undefined : "Only the week shown on the Schedule page is included. Switch to Month view to print the whole month."}
      />,
      "portrait",
    );
  }

  async function copyPersonLink(employeeId: string) {
    const employee = employees.find((item) => item.id === employeeId);
    const monthParam = (isMonth ? month : firstOfMonth(parseLocalDate(weekStart))).slice(0, 7);
    const url = `${window.location.origin}/team-schedule?store=${encodeURIComponent(publicStoreSlug)}&view=month&month=${monthParam}&person=${employeeId}`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        `Link to ${employee?.employee_name ?? "their"} schedule copied. It shows their published shifts for the month and has a Print button. They can switch months there too.`,
      );
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await downloadScheduleExcel({
        title: `${storeName ? `${storeName} · ` : ""}${outputTitle}`,
        fileName: isMonth ? `schedule-${month.slice(0, 7)}.xlsx` : `schedule-week-${weekStart}.xlsx`,
        days: outputDays.map((day) => ({ date: day.date, weekday: day.weekday, weekIndex: day.weekIndex })),
        weekStarts,
        rows: orderedEmployees.map((employee) => ({
          name: employee.employee_name,
          position: employee.position,
          cells: outputDays.map((day) => {
            const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
            const cell = printCellFor(employee.id, day);
            return { ...cell, opener: isOpener(code), closer: isCloser(code) };
          }),
        })),
      });
      setMessage("Excel file downloaded (Schedule and Summary sheets). It includes any changes you haven't saved yet.");
    } catch (error) {
      setErrorMessage(`Couldn't create the Excel file: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    setExporting(false);
  }

  /** Run the schedule check on a grid (the one on screen, or a freshly generated one). */
  function runCheck(gridToCheck: ScheduleGrid): CheckIssue[] {
    return checkSchedule({
      employees,
      days,
      weekStarts,
      grid: gridToCheck,
      rules,
      savedRules,
      isOpener,
      isCloser,
      isWorking: isWorkingCode,
      hoursFor: (code, offset) => shiftFor(code, offset).hours,
      timesFor: (code, offset) => {
        const shift = shiftFor(code, offset);
        return isWorkingCode(code) ? { start: shift.start_time, end: shift.end_time } : { start: null, end: null };
      },
      holidayFor: (offset) => weekHolidays.get(offset),
      month: isMonth ? month : null,
    });
  }

  const [fixingId, setFixingId] = useState<string | null>(null);
  // The grid before the last Fix, so it can be undone.
  const [undoGrid, setUndoGrid] = useState<ScheduleGrid | null>(null);

  function shiftLabel(code: string, offset: number) {
    return code === "OFF" ? "Off" : shiftFor(code, offset).label;
  }

  function fixIssue(issue: CheckIssue) {
    setFixingId(issue.id);
    setErrorMessage("");
    // Let the button show "Fixing…" before the search runs.
    window.setTimeout(() => {
      const result: FixResult | null = findFix(issue, grid, {
        check: {
          employees,
          days,
          weekStarts,
          rules,
          savedRules,
          isOpener,
          isCloser,
          isWorking: isWorkingCode,
          hoursFor: (code, offset) => shiftFor(code, offset).hours,
          timesFor: (code, offset) => {
            const shift = shiftFor(code, offset);
            return isWorkingCode(code) ? { start: shift.start_time, end: shift.end_time } : { start: null, end: null };
          },
          holidayFor: (offset) => weekHolidays.get(offset),
          month: isMonth ? month : null,
        },
        // Approved days off and closed holidays are never changed.
        isLocked: (employeeId, offset) =>
          isApprovedPTO(employeeId, offset) || weekHolidays.get(offset)?.mode === "closed",
        codesForDay: (offset) => {
          const holiday = weekHolidays.get(offset);
          if (holiday) return holiday.mode === "short" ? ["HOLIDAY", HOLIDAY_SHORT_CODE] : [];
          return ["OFF", ...optionsForDay(offset).map((option) => option.code).filter((code) => isWorkingCode(code))];
        },
      });
      setFixingId(null);

      if (!result) {
        setMessage("");
        setErrorMessage(
          "Couldn't find a fix for that without breaking another rule (coverage, days off, availability, shift days). Try changing it by hand, or adjust a rule.",
        );
        return;
      }

      const nameOf = (id: string) => employees.find((employee) => employee.id === id)?.employee_name ?? "Someone";
      const changes = result.changes
        .map((change) => {
          const day = days.find((item) => item.offset === change.offset);
          return `${nameOf(change.employeeId)} ${day ? dayLabel(day) : ""}: ${shiftLabel(change.from, change.offset)} → ${shiftLabel(change.to, change.offset)}`;
        })
        .join("; ");
      const sideEffects = result.newHeadsUps.length
        ? ` Note: this adds ${result.newHeadsUps.length} heads-up${result.newHeadsUps.length === 1 ? "" : "s"} (${result.newHeadsUps.map((item) => item.message).join(" ")}).`
        : "";
      setUndoGrid(grid);
      setGrid(result.grid);
      setMessage(`Fixed: ${changes}.${sideEffects} Not saved yet.`);
    }, 20);
  }

  function undoFix() {
    if (!undoGrid) return;
    setGrid(undoGrid);
    setUndoGrid(null);
    setMessage("Fix undone.");
  }

  // Re-checked on every render, so it always matches what's on screen (the check is quick).
  const issues = loading || employees.length === 0 ? [] : runCheck(grid);
  const problemCount = issues.filter((issue) => issue.severity === "problem").length;
  const headsUpCount = issues.length - problemCount;

  // Outline the cells and day headers that have issues.
  const cellIssues = new Map<string, CheckIssue["severity"]>();
  for (const issue of issues) {
    if (issue.offset === undefined) continue;
    const key = issue.employeeId ? `${issue.employeeId}|${issue.offset}` : `day|${issue.offset}`;
    if (cellIssues.get(key) !== "problem") cellIssues.set(key, issue.severity);
  }

  const [flashTarget, setFlashTarget] = useState<string | null>(null);

  function jumpToIssue(issue: CheckIssue) {
    const firstWeekOfEmployee = 0;
    const target =
      issue.employeeId && issue.offset !== undefined
        ? `cell-${issue.employeeId}-${issue.offset}`
        : issue.offset !== undefined
          ? `day-${issue.offset}`
          : issue.employeeId
            ? `emp-${issue.employeeId}-${firstWeekOfEmployee}`
            : null;
    if (!target) return;
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashTarget(target);
    window.setTimeout(() => setFlashTarget((current) => (current === target ? null : current)), 1600);
  }

  // Hours per employee for each visible week.
  const hoursByWeek = useMemo(() => {
    const totals: Record<string, number[]> = {};

    for (const employee of employees) {
      totals[employee.id] = weekStarts.map(() => 0);
      for (const day of days) {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";
        totals[employee.id][day.weekIndex] += shiftFor(code, day.offset).hours;
      }
    }

    return totals;
  }, [employees, grid, shiftOptions, weekHolidays, days, weekStarts]);

  const dailyCoverage = useMemo(() => {
    const coverage: Record<number, { openers: number; closers: number; working: number }> = {};

    for (const day of days) {
      let openers = 0;
      let closers = 0;
      let working = 0;

      for (const employee of employees) {
        const code = grid[employee.id]?.[String(day.offset)] ?? "OFF";

        if (isWorkingCode(code)) {
          working += 1;
        }

        if (isOpener(code)) {
          openers += 1;
        }

        if (isCloser(code)) {
          closers += 1;
        }
      }

      coverage[day.offset] = { openers, closers, working };
    }

    return coverage;
  }, [employees, grid, shiftRoles, days]);

  const publishedWeekCount = weekStarts.filter((start) => weekRecords[start]?.status === "Published").length;

  function moveRange(direction: number) {
    if (isMonth) setMonth(addMonths(month, direction));
    else setWeekStart(addDays(weekStart, direction * 7));
  }

  function switchView(next: ViewMode) {
    if (next === viewMode) return;
    setShowHistory(false);
    if (next === "week") {
      // Open the week containing today if it's in this month, otherwise the month's first week.
      const thisWeek = getMonday();
      setWeekStart(weekStarts.includes(thisWeek) ? thisWeek : weekStarts.find((start) => start.slice(0, 7) === month.slice(0, 7)) ?? rangeStart);
    } else {
      setMonth(firstOfMonth(parseLocalDate(addDays(weekStart, 2))));
    }
    setViewMode(next);
  }

  const today = formatLocalDate(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Schedule Builder</h1>
          <p className="mt-1 text-slate-600">
            {isMonth
              ? "Plan a whole month at once: tap Auto Generate, adjust any shift, then Save or Publish the month."
              : "Pick a week, tap Auto Generate for a starting point, adjust any shift, then Save or Publish it for your team."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-1">
            {(["month", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchView(mode)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                  viewMode === mode ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {mode === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>

          {!isMonth && (
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading || !scheduleId}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              History
            </button>
          )}

          <button
            type="button"
            onClick={() => moveRange(-1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            {isMonth ? "Previous Month" : "Previous Week"}
          </button>

          {isMonth ? (
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <span className="text-sm font-medium">Month</span>
              <input
                type="month"
                value={month.slice(0, 7)}
                onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)}
                className="py-2 outline-none"
              />
            </label>
          ) : (
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
              <span className="text-sm font-medium">Week of</span>
              <input
                type="date"
                value={weekStart}
                onChange={(event) => event.target.value && setWeekStart(getMonday(parseLocalDate(event.target.value)))}
                className="py-2 outline-none"
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => moveRange(1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            {isMonth ? "Next Month" : "Next Week"}
          </button>
        </div>
      </div>

      {message && (
        <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 sm:flex-row sm:items-start sm:justify-between">
          <span>{message}</span>
          {undoGrid && message.startsWith("Fixed:") && (
            <button
              type="button"
              onClick={undoFix}
              className="shrink-0 self-start rounded-lg border border-green-400 bg-white px-3 py-1 text-sm font-semibold hover:bg-green-100"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Schedule error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Your account doesn&apos;t have permission to make this change. Ask
              the workspace owner to check your access on the Team page.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {isMonth ? (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-black tracking-wide ${
                publishedWeekCount === weekStarts.length
                  ? "bg-green-100 text-green-800 ring-1 ring-green-300"
                  : "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
              }`}
            >
              {monthLabel(month).toUpperCase()} · {publishedWeekCount} OF {weekStarts.length} WEEKS PUBLISHED
            </span>
          ) : (
            <>
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
            </>
          )}

          <span className="text-sm text-slate-500">
            {lastSaved
              ? `Last saved ${new Date(lastSaved).toLocaleString()}`
              : Object.keys(weekRecords).length > 0
                ? "Saved schedule loaded"
                : isMonth
                  ? "New unsaved month"
                  : "New unsaved week"}
          </span>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
            Rules: {rules.openersPerDay} open · {rules.closersPerDay} close · {rules.targetHours} hrs · {savedRules.length} saved
          </span>
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
            Approved days off: {ptoRecords.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generateStarterSchedule()}
            disabled={loading || employees.length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {isMonth ? "Auto Generate Month" : "Auto Generate Schedule"}
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
            {publishing ? "Publishing..." : isMonth ? "Publish Month" : "Publish Schedule"}
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
            {saving ? "Saving..." : isMonth ? "Save Month" : "Save Schedule"}
          </button>
        </div>
      </div>

      {!loading && employees.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-sm font-bold">Export &amp; print</span>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {exporting ? "Creating Excel…" : "Export to Excel"}
          </button>
          <button
            type="button"
            onClick={printMonthGrid}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            {isMonth ? "Print month (one page)" : "Print week (one page)"}
          </button>
          <span className="hidden h-6 w-px bg-slate-200 sm:block" />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">One person</span>
            <select
              value={printPersonId}
              onChange={(event) => setPrintPersonId(event.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2"
            >
              <option value="">Choose…</option>
              {orderedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.employee_name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!printPersonId}
            onClick={() => printPerson(printPersonId)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {isMonth ? "Print their month" : "Print their week"}
          </button>
          <button
            type="button"
            disabled={!printPersonId || !publicStoreSlug}
            onClick={() => void copyPersonLink(printPersonId)}
            className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            title="A link they can open on their phone to see and print their own month"
          >
            Copy their link
          </button>
        </div>
      )}

      {printSheet}

      {!loading && employees.length > 0 && (
        <div
          className={`rounded-xl border p-4 shadow-sm ${
            problemCount > 0
              ? "border-red-200 bg-red-50"
              : headsUpCount > 0
                ? "border-amber-200 bg-amber-50"
                : "border-green-200 bg-green-50"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">
                Schedule check
                <span className="ml-2 font-normal text-slate-600">
                  {issues.length === 0
                    ? "· No issues found"
                    : `· ${problemCount} problem${problemCount === 1 ? "" : "s"} · ${headsUpCount} heads-up${headsUpCount === 1 ? "" : "s"}`}
                </span>
              </h2>
              <p className="text-sm text-slate-600">
                Updates as you change shifts. Problems are outlined in red, heads-ups in amber. Tap one to jump to it.
              </p>
            </div>
            {issues.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCheckDetails((current) => !current)}
                className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium hover:bg-slate-50"
              >
                {showCheckDetails ? "Hide details" : "Show details"}
              </button>
            )}
          </div>

          {showCheckDetails && issues.length > 0 && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {CHECK_CATEGORIES.filter((category) => issues.some((issue) => issue.category === category)).map((category) => {
                const items = issues.filter((issue) => issue.category === category);
                return (
                  <div key={category} className="rounded-lg bg-white p-3">
                    <h3 className="text-sm font-bold">
                      {category} <span className="font-normal text-slate-500">({items.length})</span>
                    </h3>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                      {items.map((issue) => (
                        <li key={issue.id} className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => jumpToIssue(issue)}
                            className="flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-100"
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.severity === "problem" ? "bg-red-500" : "bg-amber-500"}`}
                              aria-label={issue.severity === "problem" ? "Problem" : "Heads-up"}
                            />
                            <span>{issue.message}</span>
                          </button>
                          {issue.scopeDays.length > 0 && (
                            <button
                              type="button"
                              onClick={() => fixIssue(issue)}
                              disabled={fixingId !== null}
                              className="shrink-0 rounded-md border border-blue-300 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                              title="Find the smallest change that fixes this without breaking another rule"
                            >
                              {fixingId === issue.id ? "Fixing…" : "Fix"}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
        <div className="rounded-xl bg-white p-8 text-center shadow">
          <h2 className="text-xl font-bold">No team members yet</h2>
          <p className="mt-2 text-slate-600">
            Add the people you schedule, then come back here to build the week.
          </p>
          <Link
            href="/employees/add"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Add your first employee
          </Link>
        </div>
      ) : (
        <>
        <div className="-mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>Drag ⋮⋮ next to a name to change the order people are listed in.</span>
          {rowOrderRuleId && (
            <button type="button" onClick={() => void resetRowOrder()} className="font-medium text-blue-700 hover:underline">
              Reset to A–Z
            </button>
          )}
        </div>
        {weekStarts.map((weekOf, weekIndex) => {
          const weekDays = days.filter((day) => day.weekIndex === weekIndex);
          const weekStatus = weekRecords[weekOf]?.status;

          return (
            <section key={weekOf} className="space-y-2">
              {isMonth && (
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">
                    Week of {displayDate(weekOf)}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      weekStatus === "Published"
                        ? "bg-green-100 text-green-800"
                        : weekStatus
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {weekStatus || "Not saved"}
                  </span>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl bg-white shadow">
                <table className="min-w-[1150px] w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="sticky left-0 z-20 min-w-52 bg-slate-900 p-3 text-left">
                        Employee
                      </th>
                      {weekDays.map((day) => {
                        const isToday = day.date === today;
                        const holiday = weekHolidays.get(day.offset);

                        return (
                          <th
                            key={day.date}
                            id={`day-${day.offset}`}
                            className={`min-w-36 scroll-mt-24 p-3 text-center ${isToday ? "bg-blue-700 ring-2 ring-inset ring-blue-300" : ""} ${day.inMonth ? "" : "bg-slate-700"} ${
                              cellIssues.get(`day|${day.offset}`) === "problem"
                                ? "ring-4 ring-inset ring-red-400"
                                : cellIssues.get(`day|${day.offset}`) === "heads-up"
                                  ? "ring-4 ring-inset ring-amber-400"
                                  : ""
                            } ${flashTarget === `day-${day.offset}` ? "animate-pulse" : ""}`}
                          >
                            <div>{day.name}</div>
                            <div className="text-xs font-normal text-slate-300">
                              {displayDate(day.date)}
                              {!day.inMonth && " · other month"}
                            </div>
                            {holiday ? (
                              <div className="mt-1 inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                ★ {holiday.name}
                                {holiday.mode === "closed" ? " · closed" : " · short day"}
                              </div>
                            ) : (
                              <div className="mt-1 text-xs font-normal text-slate-300">
                                {dailyCoverage[day.offset]?.openers ?? 0} open ·{" "}
                                {dailyCoverage[day.offset]?.closers ?? 0} close
                              </div>
                            )}
                          </th>
                        );
                      })}
                      <th className="min-w-24 p-3 text-center">Hours</th>
                    </tr>
                  </thead>

                  <DndContext
                    id={`rows-${weekOf}`}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleRowDragEnd}
                  >
                  <SortableContext items={orderedEmployees.map((employee) => employee.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {orderedEmployees.map((employee) => {
                      const weekHours = hoursByWeek[employee.id]?.[weekIndex] ?? 0;

                      return (
                        <SortableRow key={employee.id} id={employee.id}>
                          {(handle) => (
                          <>
                          <td id={`emp-${employee.id}-${weekIndex}`} className={`sticky left-0 z-10 bg-white p-3 ${flashTarget === `emp-${employee.id}-${weekIndex}` ? "animate-pulse bg-amber-100" : ""}`}>
                            <div className="flex items-start">
                              {handle}
                              <div>
                                <div className="font-semibold">{employee.employee_name}</div>
                                <div className="text-xs text-slate-500">
                                  {employee.position || "No position"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {weekDays.map((day) => {
                            const code =
                              grid[employee.id]?.[String(day.offset)] ?? "OFF";
                            const shift = shiftFor(code, day.offset);
                            const approvedPTO = isApprovedPTO(employee.id, day.offset);
                            const dayOptions = optionsForDay(day.offset);

                            return (
                              <td
                                key={day.date}
                                id={`cell-${employee.id}-${day.offset}`}
                                className={`p-2 ${day.inMonth ? "" : "bg-slate-50"} ${flashTarget === `cell-${employee.id}-${day.offset}` ? "animate-pulse bg-amber-100" : ""}`}
                              >
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
                                  className={`w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-medium ${shift.className} ${approvedPTO ? "cursor-not-allowed opacity-80 ring-2 ring-purple-300" : ""} ${day.inMonth ? "" : "opacity-70"} ${
                                    cellIssues.get(`${employee.id}|${day.offset}`) === "problem"
                                      ? "ring-2 ring-red-500"
                                      : cellIssues.get(`${employee.id}|${day.offset}`) === "heads-up"
                                        ? "ring-2 ring-amber-400"
                                        : ""
                                  }`}
                                  title={approvedPTO ? "Approved days off — manage this on the Days Off page" : undefined}
                                >
                                  {(dayOptions.some((option) => option.code === code)
                                    ? dayOptions
                                    : [...dayOptions, shift]
                                  ).map((option) => (
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
                                weekHours > rules.targetHours
                                  ? "bg-red-100 text-red-800"
                                  : weekHours >= rules.targetHours - 2
                                    ? "bg-green-100 text-green-800"
                                    : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {weekHours.toFixed(2)}
                            </span>
                          </td>
                          </>
                          )}
                        </SortableRow>
                      );
                    })}
                  </tbody>
                  </SortableContext>
                  </DndContext>

                  <tfoot>
                    <tr className="bg-slate-100 font-semibold">
                      <td className="sticky left-0 bg-slate-100 p-3">
                        Daily coverage
                      </td>
                      {weekDays.map((day) => (
                        <td key={day.date} className="p-3 text-center text-sm">
                          {dailyCoverage[day.offset]?.working ?? 0} working
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })}
        </>
      )}

      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-lg font-bold">Shift legend</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectableShifts.map((shift) => (
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
