"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";

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

const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const builtInLabels: Record<string, string> = {
  OFF: "OFF", PTO: "PTO", HOLIDAY: "Holiday", "815-530": "8:15–5:30",
  "830-530": "8:30–5:30", "900-600": "9:00–6:00", "1030-715": "10:30–7:15",
};
const builtInClasses: Record<string, string> = {
  OFF: "bg-slate-100 text-slate-700", PTO: "bg-purple-100 text-purple-800",
  HOLIDAY: "bg-amber-100 text-amber-800", "815-530": "bg-green-100 text-green-800",
  "830-530": "bg-emerald-100 text-emerald-800", "900-600": "bg-blue-100 text-blue-800",
  "1030-715": "bg-red-100 text-red-800",
};
const customClasses: Record<string, string> = {
  cyan: "bg-cyan-100 text-cyan-800", indigo: "bg-indigo-100 text-indigo-800",
  pink: "bg-pink-100 text-pink-800", orange: "bg-orange-100 text-orange-800",
  teal: "bg-teal-100 text-teal-800", lime: "bg-lime-100 text-lime-800",
};

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
function getMonday() {
  const date = new Date(); const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); return formatDate(date);
}
function prettyDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TeamSchedulePage() {
  const [weekStart, setWeekStart] = useState(getMonday());
  const [storeSlug, setStoreSlug] = useState("");
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStoreSlug(params.get("store") || "");
    setWeekStart(params.get("week") || getMonday());
  }, []);

  useEffect(() => {
    if (!storeSlug) {
      setLoading(false);
      return;
    }
    void loadSchedule();
  }, [storeSlug, weekStart]);

  async function loadSchedule() {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("get_public_team_schedule", {
      p_store_slug: storeSlug,
      p_week_start: weekStart,
    });
    if (error) setErrorMessage(error.message);
    setPayload((data as PublicPayload | null) || null);
    setLoading(false);
  }

  function moveWeek(amount: number) {
    const next = addDays(weekStart, amount);
    setWeekStart(next);
    window.history.replaceState(null, "", `/team-schedule?store=${encodeURIComponent(storeSlug)}&week=${next}`);
  }

  const shiftMap = useMemo(() => {
    const map = new Map<string, { label: string; className: string }>();
    Object.keys(builtInLabels).forEach((code) => map.set(code, { label: builtInLabels[code], className: builtInClasses[code] }));
    (payload?.shifts || []).forEach((shift) => map.set(shift.code, { label: shift.name, className: customClasses[shift.color] || customClasses.cyan }));
    return map;
  }, [payload]);

  const hours = useMemo(() => {
    const totals: Record<string, number> = {};
    (payload?.entries || []).forEach((entry) => { totals[entry.employee_id] = (totals[entry.employee_id] || 0) + Number(entry.hours || 0); });
    return totals;
  }, [payload]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
          <div className="flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">{payload?.store.name || "Workforce Scheduler"}</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Team Schedule</h1>
              <p className="mt-2 text-slate-300">Week of {prettyDate(weekStart)}</p>
              {payload?.schedule.updated_at && <p className="mt-1 text-xs text-slate-400">Last updated {new Date(payload.schedule.updated_at).toLocaleString()}</p>}
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button onClick={() => moveWeek(-7)} className="rounded-lg border border-slate-600 px-4 py-2">Previous</button>
              <button onClick={() => moveWeek(7)} className="rounded-lg border border-slate-600 px-4 py-2">Next</button>
              <button onClick={() => void (navigator.share ? navigator.share({ title: `${payload?.store.name || "Store"} schedule`, url: window.location.href }) : navigator.clipboard.writeText(window.location.href))} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold">Share</button>
              <button onClick={() => window.print()} className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-950">Print</button>
            </div>
          </div>
        </header>

        {!storeSlug && <div className="rounded-xl bg-white p-8 text-center shadow"><h2 className="text-2xl font-bold">Store link required</h2><p className="mt-2 text-slate-600">Ask your manager for the Team Schedule link for your store.</p></div>}
        {errorMessage && <div className="rounded-lg bg-red-50 p-4 text-red-800">{errorMessage}</div>}
        {loading ? <div className="rounded-xl bg-white p-6 shadow">Loading schedule...</div> : storeSlug && !payload ? (
          <div className="rounded-xl bg-white p-8 text-center shadow"><h2 className="text-2xl font-bold">No published schedule</h2><p className="mt-2 text-slate-600">No published schedule was found for this store and week.</p></div>
        ) : payload && (
          <>
            <div className="overflow-x-auto rounded-xl bg-white shadow">
              <table className="min-w-[1100px] w-full border-collapse">
                <thead><tr className="bg-slate-900 text-white"><th className="sticky left-0 z-20 min-w-52 bg-slate-900 p-3 text-left">Employee</th>{WORK_DAYS.map((day, index) => <th key={day} className="min-w-36 p-3 text-center"><div>{day}</div><div className="text-xs font-normal text-slate-300">{prettyDate(addDays(weekStart, index))}</div></th>)}<th className="p-3">Hours</th></tr></thead>
                <tbody>{payload.employees.map((employee) => <tr key={employee.id} className="border-b"><td className="sticky left-0 bg-white p-3"><div className="font-semibold">{employee.employee_name}</div><div className="text-xs text-slate-500">{employee.position || "Team Member"}</div></td>{WORK_DAYS.map((day, index) => { const entry = payload.entries.find((item) => item.employee_id === employee.id && item.shift_date === addDays(weekStart, index)); const shift = shiftMap.get(entry?.shift_code || "OFF") || { label: entry?.shift_code || "OFF", className: "bg-slate-100 text-slate-700" }; return <td key={day} className="p-2 text-center"><span className={`inline-flex rounded-md px-3 py-2 text-sm font-semibold ${shift.className}`}>{shift.label}</span></td>; })}<td className="p-3 text-center font-bold">{(hours[employee.id] || 0).toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="rounded-xl bg-white p-4 shadow"><p className="text-sm font-bold">Shift legend</p><div className="mt-3 flex flex-wrap gap-2">{Array.from(shiftMap.entries()).map(([code, shift]) => <span key={code} className={`rounded-full px-3 py-1 text-xs font-semibold ${shift.className}`}>{shift.label}</span>)}</div></div>
          </>
        )}
      </div>
    </div>
  );
}
