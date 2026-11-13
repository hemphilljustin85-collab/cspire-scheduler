"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import SetupGuide from "../../src/components/SetupGuide";
import { getCurrentStore } from "../../src/lib/store";
import { addMonths, firstOfMonth, monthWeekStarts } from "../../src/lib/monthWeeks";
import { holidayShiftFor, ruleToHoliday, type Holiday } from "../../src/lib/holidays";
import {
  BUILT_IN_SHIFTS,
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
import { checkSchedule, type CheckDay, type CheckIssue } from "../../src/lib/scheduleCheck";

// ---------- types ----------

type Employee = { id: string; employee_name: string; employee_id: string | null; position: string | null; status: string | null };
type SavedRule = { id: string; rule_type: string; rule_value: string; employee_id: string | null; start_date: string | null; end_date: string | null };
type ScheduleRow = { id: string; week_start: string; status: string | null; updated_at: string | null };
type Entry = { schedule_id: string; employee_id: string; shift_date: string; shift_code: string };
type TimeOff = { id: string; employee_id: string; start_date: string; end_date: string; request_type: string | null };
type Rules = { openersPerDay: number; closersPerDay: number; targetHours: number; daysOffPerWeek: number; saturdayOffGoal: number };

const DEFAULT_RULES: Rules = { openersPerDay: 2, closersPerDay: 2, targetHours: 40, daysOffPerWeek: 1, saturdayOffGoal: 1 };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------- date helpers ----------

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}
function getMonday(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? 1 : 1 - day)); // Sunday looks ahead to Monday
  return formatDate(copy);
}
const shortDate = (value: string) => parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDate = (value: string) => parseDate(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const monthTitle = (month: string) => parseDate(month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
function time12(value: string | null) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "p" : "a"}`;
}

// ---------- page ----------

export default function DashboardPage() {
  const today = formatDate(new Date());
  const [month, setMonth] = useState(firstOfMonth());
  const [storeName, setStoreName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rulesRows, setRulesRows] = useState<SavedRule[]>([]);
  const [customShifts, setCustomShifts] = useState<ShiftDefinition[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const weekStarts = useMemo(() => monthWeekStarts(month), [month]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const todayMonday = getMonday(new Date());
    const [store, employeeResult, ruleResult, shiftResult, scheduleResult, timeOffResult] = await Promise.all([
      getCurrentStore().catch(() => null),
      supabase.from("employees").select("id, employee_name, employee_id, position, status").or("status.eq.Active,status.is.null").order("employee_name"),
      supabase.from("ai_rules").select("id, rule_type, rule_value, employee_id, start_date, end_date"),
      supabase.from("shift_templates").select("code, name, start_time, end_time, paid_hours, color").eq("active", true),
      supabase.from("schedules").select("id, week_start, status, updated_at").in("week_start", [...new Set([...weekStarts, todayMonday])]),
      supabase.from("employee_time_off").select("id, employee_id, start_date, end_date, request_type").eq("status", "Approved").gte("end_date", today).lte("start_date", addDays(today, 45)).order("start_date"),
    ]);
    const error = employeeResult.error || ruleResult.error || scheduleResult.error || timeOffResult.error;
    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }
    const scheduleRows = (scheduleResult.data as ScheduleRow[]) || [];
    const ids = scheduleRows.map((row) => row.id);
    const entryResult = ids.length
      ? await supabase.from("schedule_entries").select("schedule_id, employee_id, shift_date, shift_code").in("schedule_id", ids)
      : { data: [], error: null };
    if (entryResult.error) {
      setErrorMessage(entryResult.error.message);
      setLoading(false);
      return;
    }
    const allEntries = (entryResult.data as Entry[]) || [];
    const monthIds = new Set(scheduleRows.filter((row) => weekStarts.includes(row.week_start)).map((row) => row.id));
    const todayId = scheduleRows.find((row) => row.week_start === todayMonday)?.id;

    if (store) setStoreName(store.store_name);
    setEmployees((employeeResult.data as Employee[]) || []);
    setRulesRows((ruleResult.data as SavedRule[]) || []);
    setCustomShifts(shiftResult.error ? [] : ((shiftResult.data || []) as CustomShiftRow[]).map(customShiftToDefinition));
    setSchedules(scheduleRows.filter((row) => weekStarts.includes(row.week_start)));
    setEntries(allEntries.filter((entry) => monthIds.has(entry.schedule_id)));
    setTodayEntries(allEntries.filter((entry) => entry.schedule_id === todayId));
    setTimeOff((timeOffResult.data as TimeOff[]) || []);
    setLoading(false);
  }, [today, weekStarts]);

  useEffect(() => {
    // Loads the dashboard data; state updates happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // ----- rules, shifts, holidays -----
  const rules = useMemo(() => {
    const next = { ...DEFAULT_RULES };
    for (const rule of rulesRows.filter((item) => !item.employee_id)) {
      const value = Number(rule.rule_value);
      if (!Number.isFinite(value)) continue;
      if (rule.rule_type === "openers_per_day") next.openersPerDay = value;
      if (rule.rule_type === "closers_per_day") next.closersPerDay = value;
      if (rule.rule_type === "target_hours") next.targetHours = value;
      if (rule.rule_type === "days_off_per_week") next.daysOffPerWeek = value;
      if (rule.rule_type === "saturday_off_goal") next.saturdayOffGoal = value;
    }
    return next;
  }, [rulesRows]);

  const shiftOptions = useMemo(() => [...BUILT_IN_SHIFTS, ...customShifts], [customShifts]);
  const roles = useMemo(() => {
    const starterHidden = rulesRows.some((rule) => !rule.employee_id && rule.rule_type === STARTER_SHIFTS_RULE && rule.rule_value === STARTER_SHIFTS_HIDDEN);
    return classifyShiftRoles([...STATUS_SHIFTS, ...(starterHidden ? [] : BUILT_IN_SHIFTS.filter((shift) => shift.starter)), ...customShifts]);
  }, [customShifts, rulesRows]);
  const holidays = useMemo(() => rulesRows.map((rule) => ruleToHoliday(rule)).filter((holiday): holiday is Holiday => holiday !== null), [rulesRows]);
  const holidayOn = useCallback((date: string) => holidays.find((holiday) => holiday.date === date), [holidays]);
  const shiftFor = useCallback(
    (code: string, date: string): ShiftDefinition =>
      holidayShiftFor(code, holidayOn(date)) ?? shiftOptions.find((shift) => shift.code === code) ?? fallbackShift(code),
    [holidayOn, shiftOptions],
  );
  const isOpener = useCallback((code: string) => roles.openers.includes(code), [roles]);
  const isCloser = useCallback((code: string) => roles.closers.includes(code), [roles]);

  // ----- month grid (same layout as the Schedule page) -----
  const days = useMemo<CheckDay[]>(
    () =>
      weekStarts.flatMap((start, weekIndex) =>
        WEEKDAYS.map((name, weekday) => {
          const date = addDays(start, weekday);
          return { name, weekday, offset: weekIndex * 7 + weekday, date, weekIndex, inMonth: date.slice(0, 7) === month.slice(0, 7) };
        }),
      ),
    [weekStarts, month],
  );
  const dayByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const grid = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};
    for (const employee of employees) result[employee.id] = {};
    for (const entry of entries) {
      const day = dayByDate.get(entry.shift_date);
      if (day && result[entry.employee_id]) result[entry.employee_id][String(day.offset)] = entry.shift_code;
    }
    return result;
  }, [employees, entries, dayByDate]);

  const issues: CheckIssue[] = useMemo(() => {
    if (loading || employees.length === 0) return [];
    return checkSchedule({
      employees,
      days,
      weekStarts,
      grid,
      rules,
      savedRules: rulesRows,
      isOpener,
      isCloser,
      isWorking: isWorkingCode,
      hoursFor: (code, offset) => shiftFor(code, days[days.findIndex((day) => day.offset === offset)]?.date ?? "").hours,
      timesFor: (code, offset) => {
        const shift = shiftFor(code, days.find((day) => day.offset === offset)?.date ?? "");
        return isWorkingCode(code) ? { start: shift.start_time, end: shift.end_time } : { start: null, end: null };
      },
      holidayFor: (offset) => holidayOn(days.find((day) => day.offset === offset)?.date ?? ""),
      month,
    });
  }, [loading, employees, days, weekStarts, grid, rules, rulesRows, isOpener, isCloser, shiftFor, holidayOn, month]);

  const problems = issues.filter((issue) => issue.severity === "problem");
  const headsUps = issues.filter((issue) => issue.severity === "heads-up");
  const notStarted = issues.filter((issue) => issue.category === "Not started").length;

  // ----- weeks -----
  const weeks = weekStarts.map((start, weekIndex) => {
    const record = schedules.find((row) => row.week_start === start);
    const weekDays = days.filter((day) => day.weekIndex === weekIndex);
    const short = weekDays.filter((day) => {
      if (holidayOn(day.date)) return false;
      const codes = employees.map((employee) => grid[employee.id]?.[String(day.offset)] ?? "OFF");
      return codes.filter(isOpener).length < rules.openersPerDay || codes.filter(isCloser).length < rules.closersPerDay;
    }).length;
    return { start, status: record?.status || null, hasEntries: entries.some((entry) => entry.schedule_id === record?.id), short, holidays: weekDays.map((day) => holidayOn(day.date)).filter(Boolean).length };
  });
  const published = weeks.filter((week) => (week.status || "").toLowerCase() === "published").length;
  const saved = weeks.filter((week) => week.hasEntries).length;

  // ----- per person this month -----
  const people = useMemo(() => {
    return employees.map((employee) => {
      let hours = 0;
      let opens = 0;
      let closes = 0;
      let saturdaysOff = 0;
      let saturdays = 0;
      let pto = 0;
      for (const day of days) {
        if (!day.inMonth) continue;
        const code = grid[employee.id]?.[String(day.offset)];
        if (day.weekday === 5 && !holidayOn(day.date) && code !== undefined) {
          saturdays += 1;
          if (!isWorkingCode(code)) saturdaysOff += 1;
        }
        if (code === undefined) continue;
        hours += shiftFor(code, day.date).hours;
        if (isOpener(code)) opens += 1;
        if (isCloser(code)) closes += 1;
        if (code === "PTO") pto += 1;
      }
      // Average of whole weeks (Mon–Sat, including days in the next/previous month).
      const weekTotals = weekStarts
        .map((_, weekIndex) => days.filter((day) => day.weekIndex === weekIndex))
        .filter((weekDays) => weekDays.some((day) => grid[employee.id]?.[String(day.offset)] !== undefined))
        .map((weekDays) => weekDays.reduce((sum, day) => {
          const code = grid[employee.id]?.[String(day.offset)];
          return code === undefined ? sum : sum + shiftFor(code, day.date).hours;
        }, 0));
      const weekly = weekTotals.length ? weekTotals.reduce((sum, value) => sum + value, 0) / weekTotals.length : 0;
      return { employee, hours, weekly, opens, closes, saturdaysOff, saturdays, pto };
    });
  }, [employees, days, weekStarts, grid, holidayOn, shiftFor, isOpener, isCloser]);
  const totalHours = people.reduce((sum, person) => sum + person.hours, 0);
  const linkedToWorkday = employees.filter((employee) => employee.employee_id?.trim()).length;
  const maxCloses = Math.max(1, ...people.map((person) => person.closes));
  const maxOpens = Math.max(1, ...people.map((person) => person.opens));

  // ----- today -----
  const todayInfo = useMemo(() => {
    const date = parseDate(today).getDay() === 0 ? addDays(today, 1) : today;
    const holiday = holidayOn(date);
    const rows = employees.map((employee) => {
      const entry = todayEntries.find((item) => item.employee_id === employee.id && item.shift_date === date);
      const code = entry?.shift_code ?? null;
      return { employee, code, shift: code ? shiftFor(code, date) : null };
    });
    const working = rows.filter((row) => row.code && isWorkingCode(row.code)).sort((a, b) => (a.shift?.start_time ?? "").localeCompare(b.shift?.start_time ?? ""));
    const off = rows.filter((row) => row.code && !isWorkingCode(row.code));
    return { date, isTomorrow: date !== today, holiday, working, off, scheduled: rows.some((row) => row.code) };
  }, [today, employees, todayEntries, holidayOn, shiftFor]);

  // ----- upcoming -----
  const upcomingHolidays = holidays.filter((holiday) => holiday.date >= today && holiday.date <= addDays(today, 60)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const nameOf = (id: string) => employees.find((employee) => employee.id === id)?.employee_name ?? "Someone";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isCurrentMonth = month === firstOfMonth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">{storeName ? `${storeName} · ` : ""}{longDate(today)}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{greeting}</h1>
            <p className="mt-2 max-w-xl text-slate-300">
              {loading
                ? "Loading your store…"
                : problems.length > 0
                  ? `${monthTitle(month)} has ${problems.length} schedule ${problems.length === 1 ? "problem" : "problems"} to fix.`
                  : saved === 0
                    ? `${monthTitle(month)} hasn't been scheduled yet.`
                    : published === weeks.length
                      ? `${monthTitle(month)} is fully published.`
                      : `${published} of ${weeks.length} weeks of ${monthTitle(month)} are published.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-white/20 bg-white/10">
              <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="px-3 py-2 text-lg hover:bg-white/10" aria-label="Previous month">‹</button>
              <span className="min-w-36 px-2 text-center text-sm font-semibold">{monthTitle(month)}</span>
              <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="px-3 py-2 text-lg hover:bg-white/10" aria-label="Next month">›</button>
            </div>
            {!isCurrentMonth && (
              <button type="button" onClick={() => setMonth(firstOfMonth())} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">This month</button>
            )}
            <Link href="/schedule" className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-400">Open Schedule</Link>
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Dashboard error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
      )}

      <SetupGuide />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-white shadow-sm" />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Kpi
              label="Month published"
              value={`${published}/${weeks.length}`}
              detail={saved < weeks.length ? `${weeks.length - saved} ${weeks.length - saved === 1 ? "week" : "weeks"} not started` : published < weeks.length ? `${weeks.length - published} saved as draft` : "Every week is live"}
              tone={published === weeks.length ? "green" : saved === 0 ? "red" : "blue"}
              progress={weeks.length ? published / weeks.length : 0}
            />
            <Kpi
              label="Schedule check"
              value={problems.length > 0 ? `${problems.length} ${problems.length === 1 ? "problem" : "problems"}` : saved === 0 ? "—" : "No problems"}
              detail={saved === 0 ? "Nothing scheduled yet" : `${headsUps.length - notStarted} heads-up${headsUps.length - notStarted === 1 ? "" : "s"}`}
              tone={problems.length > 0 ? "red" : headsUps.length - notStarted > 0 ? "amber" : "green"}
            />
            <Kpi
              label="Hours this month"
              value={totalHours.toFixed(0)}
              detail={`${people.length ? (people.reduce((sum, person) => sum + person.weekly, 0) / people.length).toFixed(1) : "0"} avg per person per week · target ${rules.targetHours}`}
              tone="blue"
            />
            <Kpi
              label="Team"
              value={String(employees.length)}
              detail={`${linkedToWorkday} of ${employees.length} linked to Workday`}
              tone={linkedToWorkday === employees.length ? "green" : "amber"}
            />
          </div>

          {/* Today + check */}
          <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
            <Card
              title={todayInfo.isTomorrow ? "Monday's team" : "Working today"}
              subtitle={longDate(todayInfo.date)}
              action={<Link href="/team-schedule" className="text-sm font-semibold text-blue-700">Team Schedule →</Link>}
            >
              {todayInfo.holiday && (
                <div className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
                  ★ {todayInfo.holiday.name} · {todayInfo.holiday.mode === "closed" ? "store closed" : "short day"}
                </div>
              )}
              {!todayInfo.scheduled ? (
                <Empty text="No schedule saved for this day." href="/schedule" cta="Build the schedule" />
              ) : (
                <>
                  <div className="space-y-2">
                    {todayInfo.working.map(({ employee, code, shift }) => (
                      <div key={employee.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{employee.employee_name}</div>
                          <div className="truncate text-xs text-slate-500">{employee.position || "Team member"}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isOpener(code!) ? "bg-emerald-100 text-emerald-800" : isCloser(code!) ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                            {isOpener(code!) ? "Opens" : isCloser(code!) ? "Closes" : "Works"}
                          </span>
                          <span className="w-24 text-right text-sm font-semibold tabular-nums">{time12(shift!.start_time)}–{time12(shift!.end_time)}</span>
                        </div>
                      </div>
                    ))}
                    {todayInfo.working.length === 0 && <p className="text-sm text-slate-500">Nobody is working.</p>}
                  </div>
                  {todayInfo.off.length > 0 && (
                    <p className="mt-3 text-sm text-slate-500">
                      <span className="font-semibold text-slate-700">Off:</span>{" "}
                      {todayInfo.off.map(({ employee, code }) => `${employee.employee_name}${code === "PTO" ? " (PTO)" : ""}`).join(", ")}
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card
              title="Schedule check"
              subtitle={`${monthTitle(month)} · same check as the Schedule page`}
              action={<Link href="/schedule" className="text-sm font-semibold text-blue-700">Review & fix →</Link>}
            >
              {saved === 0 ? (
                <Empty text={`Nothing is scheduled for ${monthTitle(month)} yet.`} href="/schedule" cta="Auto Generate the month" />
              ) : issues.filter((issue) => issue.category !== "Not started").length === 0 ? (
                <div className="rounded-lg bg-green-50 p-4 text-green-800">✓ No problems or heads-ups. Coverage, days off, Saturdays and hours all look good.</div>
              ) : (
                <ul className="space-y-2">
                  {[...problems, ...headsUps].filter((issue) => issue.category !== "Not started").slice(0, 7).map((issue) => (
                    <li key={issue.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${issue.severity === "problem" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${issue.severity === "problem" ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>{issue.category}</span>
                      <span className="text-slate-800">{issue.message}</span>
                    </li>
                  ))}
                  {problems.length + headsUps.length - notStarted > 7 && (
                    <li className="text-sm text-slate-500">+ {problems.length + headsUps.length - notStarted - 7} more on the Schedule page</li>
                  )}
                </ul>
              )}
            </Card>
          </div>

          {/* Weeks + fairness */}
          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card title="Weeks" subtitle={monthTitle(month)}>
              <ul className="divide-y">
                {weeks.map((week) => {
                  const status = (week.status || "").toLowerCase();
                  return (
                    <li key={week.start} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <div className="font-semibold">Week of {shortDate(week.start)}</div>
                        <div className="text-xs text-slate-500">
                          {week.hasEntries ? (week.short > 0 ? `${week.short} ${week.short === 1 ? "day" : "days"} short on openers/closers` : "Coverage complete") : "Not started"}
                          {week.holidays > 0 && ` · ${week.holidays} holiday${week.holidays === 1 ? "" : "s"}`}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "published" ? "bg-green-100 text-green-800" : week.hasEntries ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                        {status === "published" ? "Published" : week.hasEntries ? "Draft" : "Not started"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Fairness this month" subtitle={`Opens, closes and Saturdays off in ${monthTitle(month)}`} action={<Link href="/metrics" className="text-sm font-semibold text-blue-700">Metrics →</Link>}>
              {saved === 0 ? (
                <p className="text-sm text-slate-500">Shows once the month has shifts.</p>
              ) : (
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Name</th>
                        <th className="px-2 py-2 font-semibold">Hrs/wk</th>
                        <th className="px-2 py-2 font-semibold">Opens</th>
                        <th className="px-2 py-2 font-semibold">Closes</th>
                        <th className="px-2 py-2 text-center font-semibold">Sat off</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {people.map((person) => (
                        <tr key={person.employee.id}>
                          <td className="max-w-[9rem] truncate px-2 py-2 font-semibold">{person.employee.employee_name}</td>
                          <td className={`px-2 py-2 tabular-nums ${person.weekly > rules.targetHours + 0.5 ? "font-semibold text-red-700" : person.weekly && person.weekly < rules.targetHours - 4 ? "font-semibold text-amber-700" : ""}`}>{person.weekly.toFixed(1)}</td>
                          <td className="px-2 py-2"><Bar value={person.opens} max={maxOpens} color="bg-emerald-500" /></td>
                          <td className="px-2 py-2"><Bar value={person.closes} max={maxCloses} color="bg-red-400" /></td>
                          <td className="px-2 py-2 text-center">
                            {person.saturdays === 0 ? "–" : person.saturdaysOff >= rules.saturdayOffGoal ? <span className="font-semibold text-green-700">✓ {person.saturdaysOff}</span> : <span className="font-semibold text-red-700">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Upcoming + Workday */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Coming up" subtitle="Approved days off · next 45 days" action={<Link href="/days-off" className="text-sm font-semibold text-blue-700">Days Off →</Link>}>
              {timeOff.length === 0 ? (
                <p className="text-sm text-slate-500">No approved days off coming up.</p>
              ) : (
                <ul className="space-y-2">
                  {timeOff.slice(0, 6).map((record) => (
                    <li key={record.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{nameOf(record.employee_id)}</span>
                      <span className="shrink-0 text-slate-600">
                        {shortDate(record.start_date)}{record.end_date !== record.start_date ? `–${shortDate(record.end_date)}` : ""}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${record.request_type === "off" ? "bg-slate-100 text-slate-700" : "bg-purple-100 text-purple-800"}`}>{record.request_type === "off" ? "Day off" : "PTO"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Holidays" subtitle="Next 60 days" action={<Link href="/holidays" className="text-sm font-semibold text-blue-700">Holidays →</Link>}>
              {upcomingHolidays.length === 0 ? (
                <p className="text-sm text-slate-500">No holidays in the next 60 days.</p>
              ) : (
                <ul className="space-y-2">
                  {upcomingHolidays.map((holiday) => (
                    <li key={holiday.date} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">★ {holiday.name}</span>
                      <span className="shrink-0 text-slate-600">
                        {shortDate(holiday.date)}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${holiday.mode === "closed" ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-900"}`}>{holiday.mode === "closed" ? "Closed" : "Short day"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Workday" subtitle="Team import and schedule export">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{linkedToWorkday}/{employees.length}</span>
                <span className="text-sm text-slate-500">people have a Workday Employee ID</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${employees.length ? (linkedToWorkday / employees.length) * 100 : 0}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/employees" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Import team</Link>
                <Link href="/schedule" className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Export for Workday</Link>
              </div>
            </Card>
          </div>

          {/* Shortcuts */}
          <section>
            <h2 className="text-lg font-bold text-slate-800">Shortcuts</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["/schedule", "▤", "Schedule", "Build, check & publish"],
                ["/team-schedule", "◎", "Team Schedule", "What your team sees"],
                ["/days-off", "◷", "Days Off", "PTO & requests"],
                ["/employees", "●", "Employees", "Team & Workday import"],
                ["/positions", "◆", "Positions", "Titles & requirements"],
                ["/shifts", "+", "Shifts", "Shift times & days"],
                ["/holidays", "★", "Holidays", "Closed & short days"],
                ["/rules", "✓", "Rules", "Preferences & limits"],
                ["/reports", "▥", "Reports", "Print & summaries"],
                ["/settings", "⚙", "Settings", "Store defaults"],
              ].map(([href, icon, title, text]) => (
                <Link key={href} href={href} className="group rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-300">
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-700 group-hover:bg-blue-600 group-hover:text-white">{icon}</span>
                  <div className="mt-3 font-semibold">{title}</div>
                  <div className="text-xs text-slate-500">{text}</div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ---------- pieces ----------

const TONES = {
  green: { bar: "bg-green-500", text: "text-green-700", ring: "ring-green-200" },
  amber: { bar: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-200" },
  red: { bar: "bg-red-500", text: "text-red-700", ring: "ring-red-200" },
  blue: { bar: "bg-blue-500", text: "text-blue-700", ring: "ring-blue-200" },
};

function Kpi({ label, value, detail, tone, progress }: { label: string; value: string; detail: string; tone: keyof typeof TONES; progress?: number }) {
  const colors = TONES[tone];
  return (
    <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 sm:p-5 ${colors.ring}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span className={`h-2 w-2 rounded-full ${colors.bar}`} />
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold sm:text-3xl ${tone === "red" ? colors.text : "text-slate-950"}`}>{value}</div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs font-medium text-slate-500">{detail}</div>
    </div>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center">
      <p className="text-sm text-slate-600">{text}</p>
      <Link href={href} className="mt-3 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{cta}</Link>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:w-24">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-5 tabular-nums">{value}</span>
    </div>
  );
}
