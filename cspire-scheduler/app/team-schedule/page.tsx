"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { BUILT_IN_SHIFTS, CUSTOM_COLOR_CLASSES } from "../../src/lib/shifts";
import { PersonMonthSheet, ScheduleSheet, usePrintSheet, type PrintCell } from "../../src/components/PrintSheets";
import type { ScheduleSheetData } from "../../src/lib/scheduleSheet";
import { addMonths, firstOfMonth, monthWeekStarts, monthWorkDates } from "../../src/lib/monthWeeks";
import { printPage, publicSiteUrl, shareLink } from "../../src/lib/native";

type Employee = { id: string; employee_name: string; position: string | null; status: string | null };
type Schedule = { id: string; week_start: string; status: string; updated_at: string | null };
type ScheduleEntry = { employee_id: string; shift_date: string; shift_code: string; hours: number };
type PublicShift = { code: string; name: string; color: string };
type PublicPayload = {
  store: { name: string; slug: string };
  schedule: Schedule;
  employees: Employee[];
  entries: ScheduleEntry[];
  shifts: PublicShift[];
};
type View = "week" | "month";

const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NOT_WORKING = new Set(["OFF", "PTO", "HOLIDAY"]);

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function addDays(value: string, amount: number) {
  const date = parseDate(value); date.setDate(date.getDate() + amount); return formatDate(date);
}
function getMonday(from = new Date()) {
  const date = new Date(from); const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); return formatDate(date);
}
function prettyDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function monthName(month: string) {
  return parseDate(month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Merge several published weeks into one payload (missing weeks are skipped). */
function mergePayloads(payloads: Array<PublicPayload | null>): PublicPayload | null {
  const found = payloads.filter((item): item is PublicPayload => item !== null);
  if (found.length === 0) return null;
  const employees = new Map<string, Employee>();
  const shifts = new Map<string, PublicShift>();
  found.forEach((item) => {
    item.employees.forEach((employee) => employees.set(employee.id, employee));
    item.shifts.forEach((shift) => shifts.set(shift.code, shift));
  });
  const latest = [...found].sort((a, b) => (a.schedule.updated_at || "").localeCompare(b.schedule.updated_at || "")).pop()!;
  return {
    store: found[0].store,
    schedule: latest.schedule,
    employees: Array.from(employees.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
    entries: found.flatMap((item) => item.entries),
    shifts: Array.from(shifts.values()),
  };
}

export default function TeamSchedulePage() {
  const [weekStart, setWeekStart] = useState(getMonday());
  const [view, setView] = useState<View>("week");
  const [month, setMonth] = useState(firstOfMonth());
  const [personId, setPersonId] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [publishedWeeks, setPublishedWeeks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [printSheet, startPrint] = usePrintSheet();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStoreSlug(params.get("store") || "");
    setWeekStart(params.get("week") || getMonday());
    setView(params.get("view") === "month" ? "month" : "week");
    const monthParam = params.get("month");
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) setMonth(`${monthParam}-01`);
    setPersonId(params.get("person") || "");
  }, []);

  useEffect(() => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    void loadSchedule();
  }, [storeSlug, weekStart, view, month]);

  // Keep the link in the address bar matching what's shown, so it can be shared or bookmarked.
  useEffect(() => {
    if (!storeSlug) return;
    const params = new URLSearchParams({ store: storeSlug });
    if (view === "month") {
      params.set("view", "month");
      params.set("month", month.slice(0, 7));
    } else {
      params.set("week", weekStart);
    }
    if (personId) params.set("person", personId);
    window.history.replaceState(null, "", `/team-schedule?${params.toString()}`);
  }, [storeSlug, view, month, weekStart, personId]);

  async function fetchWeek(week: string) {
    const { data, error } = await supabase.rpc("get_public_team_schedule", {
      p_store_slug: storeSlug,
      p_week_start: week,
    });
    if (error) throw error;
    return (data as PublicPayload | null) || null;
  }

  async function loadSchedule() {
    setLoading(true);
    setErrorMessage("");
    try {
      if (view === "month") {
        const weeks = await Promise.all(monthWeekStarts(month).map(fetchWeek));
        setPublishedWeeks(weeks.filter(Boolean).length);
        setPayload(mergePayloads(weeks));
      } else {
        const week = await fetchWeek(weekStart);
        setPublishedWeeks(week ? 1 : 0);
        setPayload(week);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Couldn't load the schedule.");
      setPayload(null);
    }
    setLoading(false);
  }

  function move(amount: number) {
    if (view === "month") setMonth(addMonths(month, amount));
    else setWeekStart(addDays(weekStart, amount * 7));
  }

  function switchView(next: View) {
    if (next === view) return;
    if (next === "month") setMonth(firstOfMonth(parseDate(addDays(weekStart, 2))));
    else {
      const thisWeek = getMonday();
      setWeekStart(thisWeek.slice(0, 7) === month.slice(0, 7) ? thisWeek : getMonday(parseDate(addDays(month, 1))));
    }
    setView(next);
  }

  const shiftMap = useMemo(() => {
    const map = new Map<string, { label: string; className: string }>();
    BUILT_IN_SHIFTS.forEach((shift) => map.set(shift.code, { label: shift.label, className: shift.className }));
    (payload?.shifts || []).forEach((shift) => map.set(shift.code, { label: shift.name, className: CUSTOM_COLOR_CLASSES[shift.color] || CUSTOM_COLOR_CLASSES.cyan }));
    return map;
  }, [payload]);

  const entryMap = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    (payload?.entries || []).forEach((entry) => map.set(`${entry.employee_id}|${entry.shift_date}`, entry));
    return map;
  }, [payload]);

  function cellFor(employeeId: string, date: string): PrintCell & { found: boolean } {
    const entry = entryMap.get(`${employeeId}|${date}`);
    const code = entry?.shift_code || "OFF";
    const shift = shiftMap.get(code) || { label: code, className: "bg-slate-100 text-slate-700" };
    const label = code === "OFF" ? "Off" : shift.label;
    return {
      label,
      short: code === "OFF" ? [""] : label.includes("–") ? label.split("–") : [label === "Holiday" ? "Hol" : label],
      className: shift.className,
      hours: Number(entry?.hours || 0),
      working: !NOT_WORKING.has(code),
      found: Boolean(entry),
    };
  }

  // Only show legend entries for shifts that appear.
  const usedShiftCodes = useMemo(
    () => new Set((payload?.entries || []).map((entry) => entry.shift_code || "OFF")),
    [payload],
  );

  const shownEmployees = (payload?.employees || []).filter((employee) => !personId || employee.id === personId);
  const person = payload?.employees.find((employee) => employee.id === personId);
  const monthDates = monthWorkDates(month);
  const weekDates = WORK_DAYS.map((_, index) => addDays(weekStart, index));
  const totalWeeks = view === "month" ? monthWeekStarts(month).length : 1;
  const missingNote =
    view === "month" && payload && publishedWeeks < totalWeeks
      ? `${totalWeeks - publishedWeeks} of ${totalWeeks} weeks in ${monthName(month)} aren't published yet, so those days are blank.`
      : "";

  // The month laid out like the manager's Schedule page: a block per week.
  function monthSheet(): ScheduleSheetData {
    return {
      title: `${payload?.store.name ? `${payload.store.name} · ` : ""}${monthName(month)} schedule`,
      subtitle: `Printed ${new Date().toLocaleDateString()}`,
      weeks: monthWeekStarts(month).map((weekOf) => {
        const dates = WORK_DAYS.map((name, index) => ({ name, date: addDays(weekOf, index) }));
        const published = (payload?.entries || []).some((entry) => entry.shift_date >= weekOf && entry.shift_date <= addDays(weekOf, 5));
        return {
          label: `Week of ${parseDate(weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          status: published ? "Published" : "Not published yet",
          days: dates.map((day) => ({
            date: day.date,
            name: day.name,
            dateLabel: parseDate(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            inMonth: day.date.slice(0, 7) === month.slice(0, 7),
          })),
          rows: shownEmployees.map((employee) => {
            const cells = dates.map((day) => {
              const cell = cellFor(employee.id, day.date);
              return { ...cell, label: cell.label === "Off" ? "OFF" : cell.label, className: cell.label === "Off" ? "bg-slate-100 text-slate-700" : cell.className, opener: false, closer: false };
            });
            const hours = cells.reduce((sum, cell) => sum + cell.hours, 0);
            return { id: employee.id, name: employee.employee_name, position: employee.position, cells, hours, hoursClassName: "bg-slate-100 text-slate-800" };
          }),
          footer: dates.map((day) => `${(payload?.employees || []).filter((employee) => cellFor(employee.id, day.date).working).length} working`),
        };
      }),
      legend,
    };
  }

  const legend = Array.from(shiftMap.entries())
    .filter(([code]) => code !== "OFF" && usedShiftCodes.has(code))
    .map(([, shift]) => shift);

  function personSheet() {
    if (!person) return null;
    return (
      <PersonMonthSheet
        storeName={payload?.store.name}
        name={person.employee_name}
        month={month}
        cellsByDate={new Map(monthDates.map((day) => [day.date, cellFor(person.id, day.date)]))}
        note={missingNote || undefined}
      />
    );
  }

  function print() {
    if (view === "week" || !payload) {
      void printPage("Team schedule");
      return;
    }
    if (person) startPrint(personSheet(), "portrait");
    else
      startPrint(<ScheduleSheet data={monthSheet()} />);
  }

  const hours = useMemo(() => {
    const totals: Record<string, number> = {};
    (payload?.entries || []).forEach((entry) => { totals[entry.employee_id] = (totals[entry.employee_id] || 0) + Number(entry.hours || 0); });
    return totals;
  }, [payload]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      {printSheet}
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
          <div className="flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">{payload?.store.name || "Workforce Scheduler"}</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{person ? `${person.employee_name}'s Schedule` : "Team Schedule"}</h1>
              <p className="mt-2 text-slate-300">{view === "month" ? monthName(month) : `Week of ${prettyDate(weekStart)}`}</p>
              {payload?.schedule.updated_at && <p className="mt-1 text-xs text-slate-400">Last updated {new Date(payload.schedule.updated_at).toLocaleString()}</p>}
            </div>
            <div className="no-print flex flex-col gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
                <div className="flex rounded-lg border border-slate-600 p-0.5">
                  {(["week", "month"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => switchView(option)}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === option ? "bg-white text-slate-950" : "text-slate-200"}`}
                    >
                      {option === "week" ? "Week" : "Month"}
                    </button>
                  ))}
                </div>
                <select
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
                  aria-label="Show"
                >
                  <option value="">Everyone</option>
                  {(payload?.employees || []).map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.employee_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => move(-1)} className="rounded-lg border border-slate-600 px-4 py-2">Previous</button>
                <button onClick={() => move(1)} className="rounded-lg border border-slate-600 px-4 py-2">Next</button>
                <button onClick={() => void shareLink(`${payload?.store.name || "Store"} schedule`, `${publicSiteUrl() || window.location.origin}${window.location.pathname}${window.location.search}`)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold">Share</button>
                <button onClick={print} className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-950">Print</button>
              </div>
            </div>
          </div>
        </header>

        {!storeSlug && <div className="rounded-xl bg-white p-8 text-center shadow"><h2 className="text-2xl font-bold">Store link required</h2><p className="mt-2 text-slate-600">Ask your manager for the Team Schedule link for your store.</p></div>}
        {errorMessage && <div className="rounded-lg bg-red-50 p-4 text-red-800">{errorMessage}</div>}
        {missingNote && <div className="no-print rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{missingNote}</div>}
        {loading ? <div className="rounded-xl bg-white p-6 shadow">Loading schedule...</div> : storeSlug && !payload ? (
          <div className="rounded-xl bg-white p-8 text-center shadow"><h2 className="text-2xl font-bold">No published schedule</h2><p className="mt-2 text-slate-600">No published schedule was found for this store and {view === "month" ? "month" : "week"}.</p></div>
        ) : payload && view === "month" ? (
          <div className="overflow-x-auto rounded-xl bg-white p-4 shadow">
            {person ? (
              <div className="min-w-[640px]">{personSheet()}</div>
            ) : (
              <div className="min-w-[1000px]">
                <ScheduleSheet data={monthSheet()} fitToPage={false} />
              </div>
            )}
          </div>
        ) : payload && (
          <>
            <div className="overflow-x-auto rounded-xl bg-white shadow">
              <table className="min-w-[1100px] w-full border-collapse">
                <thead><tr className="bg-slate-900 text-white"><th className="sticky left-0 z-20 min-w-52 bg-slate-900 p-3 text-left">Employee</th>{WORK_DAYS.map((day, index) => <th key={day} className="min-w-36 p-3 text-center"><div>{day}</div><div className="text-xs font-normal text-slate-300">{prettyDate(weekDates[index])}</div></th>)}<th className="p-3">Hours</th></tr></thead>
                <tbody>{shownEmployees.map((employee) => <tr key={employee.id} className="border-b"><td className="sticky left-0 bg-white p-3"><div className="font-semibold">{employee.employee_name}</div><div className="text-xs text-slate-500">{employee.position || "Team Member"}</div></td>{weekDates.map((date) => { const cell = cellFor(employee.id, date); return <td key={date} className="p-2 text-center"><span className={`inline-flex rounded-md px-3 py-2 text-sm font-semibold ${cell.label === "Off" ? "bg-slate-100 text-slate-700" : cell.className}`}>{cell.label === "Off" ? "OFF" : cell.label}</span></td>; })}<td className="p-3 text-center font-bold">{(hours[employee.id] || 0).toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="rounded-xl bg-white p-4 shadow"><p className="text-sm font-bold">Shift legend</p><div className="mt-3 flex flex-wrap gap-2">{legend.map((shift) => <span key={shift.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${shift.className}`}>{shift.label}</span>)}</div></div>
          </>
        )}
      </div>
    </div>
  );
}
