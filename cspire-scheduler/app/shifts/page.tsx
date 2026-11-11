"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import {
  SHIFT_COLORS,
  STARTER_SHIFTS,
  STARTER_SHIFTS_HIDDEN,
  STARTER_SHIFTS_RULE,
} from "../../src/lib/shifts";

type ShiftTemplate = {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  paid_hours: number;
  color: string;
  active: boolean;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5];
const ALLOWED_DAYS_RULE = "allowed_days_for_shift";

/** Day limits saved as "Allowed days for shift" rules (CODE|Monday,Tuesday). */
type DayLimit = { ids: string[]; days: number[] };

function parseDays(value: string) {
  return value
    .split(",")
    .map((day) => WEEKDAYS.findIndex((name) => name.toLowerCase() === day.trim().toLowerCase()))
    .filter((day) => day >= 0);
}

function describeDays(days: number[]) {
  if (days.length === ALL_DAYS.length) return "Any day";
  if (days.length === 1) return `${WEEKDAYS[days[0]]}s only`;
  return `${days.map((day) => WEEKDAYS[day].slice(0, 3)).join(", ")} only`;
}

function DayPicker({ days, onChange, disabled }: { days: number[]; onChange: (days: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((name, day) => {
        const on = days.includes(day);
        return (
          <button
            key={name}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((item) => item !== day) : [...days, day].sort())}
            className={`rounded-md border px-2.5 py-1 text-sm font-semibold disabled:opacity-50 ${
              on ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-400 line-through"
            }`}
          >
            {name.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

const emptyForm = {
  name: "",
  code: "",
  start_time: "09:00",
  end_time: "17:00",
  paid_hours: "7",
  color: "cyan",
  days: ALL_DAYS,
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [starterRuleId, setStarterRuleId] = useState<string | null>(null);
  const [updatingStarters, setUpdatingStarters] = useState(false);
  const [dayLimits, setDayLimits] = useState<Record<string, DayLimit>>({});
  const [savingDaysFor, setSavingDaysFor] = useState<string | null>(null);
  const startersHidden = starterRuleId !== null;

  useEffect(() => {
    void Promise.all([loadShifts(), loadStarterSetting(), loadDayLimits()]);
  }, []);

  async function loadDayLimits() {
    // Only store-wide rules without dates; dated or per-person rules stay on the Rules page.
    const { data, error } = await supabase
      .from("ai_rules")
      .select("id, rule_value, start_date, end_date")
      .eq("rule_type", ALLOWED_DAYS_RULE)
      .is("employee_id", null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    const limits: Record<string, DayLimit> = {};
    for (const rule of (data as Array<{ id: string; rule_value: string; start_date: string | null; end_date: string | null }>) || []) {
      if (rule.start_date || rule.end_date) continue;
      const [code, dayValues] = rule.rule_value.split("|");
      if (!code || !dayValues) continue;
      const key = code.trim();
      const existing = limits[key] ?? { ids: [], days: [] };
      existing.ids.push(rule.id);
      existing.days = Array.from(new Set([...existing.days, ...parseDays(dayValues)])).sort();
      limits[key] = existing;
    }
    setDayLimits(limits);
  }

  function daysFor(code: string) {
    return dayLimits[code]?.days ?? ALL_DAYS;
  }

  /**
   * Replace the day limit for a shift code. All days = no limit (rule removed).
   * Returns an error message, or null when it worked.
   */
  async function saveDayLimit(code: string, days: number[], previousCode = code): Promise<string | null> {
    if (days.length === 0) return "Pick at least one day the shift can be used.";
    const existing = [...(dayLimits[previousCode]?.ids ?? []), ...(previousCode !== code ? dayLimits[code]?.ids ?? [] : [])];
    if (existing.length > 0) {
      const { data, error } = await supabase.from("ai_rules").delete().in("id", existing).select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        return "The shift's days couldn't be changed. Your account may not have permission to change rules.";
      }
    }
    if (days.length < ALL_DAYS.length) {
      const { data, error } = await supabase
        .from("ai_rules")
        .insert({
          employee_id: null,
          rule_type: ALLOWED_DAYS_RULE,
          rule_value: `${code}|${days.map((day) => WEEKDAYS[day]).join(",")}`,
          start_date: null,
          end_date: null,
        })
        .select("id");
      if (error) return error.message;
      if (!data || data.length === 0) {
        return "The shift's days couldn't be saved. Your account may not have permission to add rules.";
      }
    }
    await loadDayLimits();
    return null;
  }

  async function changeStarterDays(code: string, label: string, days: number[]) {
    setMessage("");
    setErrorMessage("");
    setSavingDaysFor(code);
    const error = await saveDayLimit(code, days);
    setSavingDaysFor(null);
    if (error) setErrorMessage(error);
    else setMessage(`${label}: ${describeDays(days).toLowerCase()}.`);
  }

  async function loadStarterSetting() {
    const { data } = await supabase
      .from("ai_rules")
      .select("id")
      .eq("rule_type", STARTER_SHIFTS_RULE)
      .eq("rule_value", STARTER_SHIFTS_HIDDEN)
      .is("employee_id", null)
      .limit(1);
    setStarterRuleId((data as Array<{ id: string }> | null)?.[0]?.id ?? null);
  }

  async function toggleStarterShifts() {
    setUpdatingStarters(true);
    setErrorMessage("");
    setMessage("");
    if (startersHidden) {
      const { error } = await supabase.from("ai_rules").delete().eq("id", starterRuleId);
      if (error) setErrorMessage(error.message);
      else setMessage("Starter shifts are showing again.");
    } else {
      if (shifts.length === 0 && !window.confirm("You haven't added your own shifts yet. Hide the starter shifts anyway?")) {
        setUpdatingStarters(false);
        return;
      }
      const { error } = await supabase.from("ai_rules").insert({
        employee_id: null,
        rule_type: STARTER_SHIFTS_RULE,
        rule_value: STARTER_SHIFTS_HIDDEN,
        start_date: null,
        end_date: null,
      });
      if (error) setErrorMessage(error.message);
      else setMessage("Starter shifts hidden. Only your shifts will be offered and auto-scheduled.");
    }
    await loadStarterSetting();
    setUpdatingStarters(false);
  }

  async function loadShifts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("shift_templates")
      .select("id, code, name, start_time, end_time, paid_hours, color, active")
      .order("start_time");
    if (error) setErrorMessage(error.message);
    else setShifts((data as ShiftTemplate[]) || []);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setErrorMessage("");
    setMessage("");
  }

  function openEdit(shift: ShiftTemplate) {
    setEditing(shift);
    setForm({
      name: shift.name,
      code: shift.code,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      paid_hours: String(shift.paid_hours),
      color: shift.color,
      days: daysFor(shift.code),
    });
    setShowForm(true);
  }

  async function saveShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    const code = form.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const payload = {
      name: form.name.trim(),
      code,
      start_time: form.start_time,
      end_time: form.end_time,
      paid_hours: Number(form.paid_hours),
      color: form.color,
      active: true,
    };
    if (form.days.length === 0) {
      setErrorMessage("Pick at least one day the shift can be used.");
      setSaving(false);
      return;
    }
    const result = editing
      ? await supabase.from("shift_templates").update(payload).eq("id", editing.id).select("id")
      : await supabase.from("shift_templates").insert(payload).select("id");
    if (result.error) {
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }
    if (!result.data || result.data.length === 0) {
      setErrorMessage("This shift couldn't be saved. Your account may not have permission to change shifts. Ask the workspace owner to check access.");
      setSaving(false);
      return;
    }
    const previousCode = editing?.code ?? code;
    const daysChanged =
      previousCode !== code ||
      daysFor(previousCode).join(",") !== form.days.join(",");
    if (daysChanged) {
      const dayError = await saveDayLimit(code, form.days, previousCode);
      if (dayError) {
        setErrorMessage(`Shift saved, but its days weren't: ${dayError}`);
        setSaving(false);
        await loadShifts();
        return;
      }
    }
    setMessage(editing ? "Shift updated." : "Shift added.");
    setShowForm(false);
    setSaving(false);
    await loadShifts();
  }

  async function removeShift(shift: ShiftTemplate) {
    if (!window.confirm(`Remove ${shift.name}? Existing schedules keep their saved shift code.`)) return;
    const { data, error } = await supabase.from("shift_templates").delete().eq("id", shift.id).select("id");
    if (error) setErrorMessage(error.message);
    else if (!data || data.length === 0) {
      // Supabase returns no error when access rules block a delete; it just removes nothing.
      setErrorMessage("This shift couldn't be removed. Your account may not have permission to delete shifts. Ask the workspace owner to check access.");
    } else {
      // Clean up its day limit too.
      const limitIds = dayLimits[shift.code]?.ids ?? [];
      if (limitIds.length > 0) await supabase.from("ai_rules").delete().in("id", limitIds);
      setMessage("Shift removed.");
      await Promise.all([loadShifts(), loadDayLimits()]);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Shifts</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Set up the shifts your business actually works, and which days each one can be
            used. Auto Generate treats the earliest-starting shifts as openers and the
            latest-ending shifts as closers, so any hours work.
          </p>
        </div>
        <button onClick={openAdd} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
          Add Shift
        </button>
      </div>

      {message && <div className="rounded-lg bg-green-50 p-3 text-green-800">{message}</div>}
      {errorMessage && <div className="rounded-lg bg-red-50 p-3 text-red-800">{errorMessage}</div>}

      {showForm && (
        <form onSubmit={saveShift} className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-xl font-bold">{editing ? "Edit Shift" : "New Shift"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium">Shift name</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border px-3 py-2" placeholder="Morning, Lunch rush, Close..." />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Short code</span>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border px-3 py-2" placeholder="AM" />
              <span className="block text-xs text-slate-500">A short nickname used in rules, like AM or CLOSE.</span>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Paid hours</span>
              <input required type="number" min="0" step="0.25" value={form.paid_hours} onChange={(e) => setForm({ ...form, paid_hours: e.target.value })} className="w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Start time</span>
              <input required type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">End time</span>
              <input required type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Color</span>
              <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-full rounded-lg border px-3 py-2">
                {SHIFT_COLORS.map((color) => <option key={color}>{color}</option>)}
              </select>
            </label>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <span className="text-sm font-medium">Days this shift can be used</span>
              <DayPicker days={form.days} onChange={(days) => setForm({ ...form, days })} />
              <span className="block text-xs text-slate-500">
                {form.days.length === 0
                  ? "Pick at least one day."
                  : `${describeDays(form.days)}. Auto Generate only uses it on these days, and the schedule only offers it on these days.`}
              </span>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2">Cancel</button>
            <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Shift"}</button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-white shadow">
        {loading ? (
          <p className="p-6">Loading shifts...</p>
        ) : shifts.length === 0 ? (
          <div className="p-6 text-slate-600">
            <p className="font-semibold text-slate-900">You haven&apos;t added any shifts yet.</p>
            <p className="mt-1">Tap Add Shift to create one for each shift your team works (for example Morning 7–3 and Evening 3–11).</p>
          </div>
        ) : (
          <div className="divide-y">
            {shifts.map((shift) => (
              <div key={shift.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-bold">{shift.name} <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs">{shift.code}</span></div>
                  <div className="mt-1 text-sm text-slate-600">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {Number(shift.paid_hours).toFixed(2)} paid hours · {describeDays(daysFor(shift.code))}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(shift)} className="rounded-lg border px-3 py-2">Edit</button>
                  <button onClick={() => void removeShift(shift)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Starter shifts</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Sample shifts so you can try the scheduler right away. Hide them once
              your own shifts are set up. Past schedules that used them still show correctly.
            </p>
          </div>
          <button
            type="button"
            disabled={updatingStarters}
            onClick={() => void toggleStarterShifts()}
            className="shrink-0 rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
          >
            {startersHidden ? "Show starter shifts" : "Hide starter shifts"}
          </button>
        </div>
        <div className={`mt-4 divide-y ${startersHidden ? "opacity-50" : ""}`}>
          {STARTER_SHIFTS.map((shift) => (
            <div key={shift.code} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${shift.className}`}>
                  {shift.label} · {shift.hours} hrs
                </span>
                <span className="ml-2 text-sm text-slate-500">{describeDays(daysFor(shift.code))}</span>
              </div>
              <DayPicker
                days={daysFor(shift.code)}
                disabled={savingDaysFor !== null}
                onChange={(days) => void changeStarterDays(shift.code, shift.label, days)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
