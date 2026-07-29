"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";

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

const emptyForm = {
  name: "",
  code: "",
  start_time: "09:00",
  end_time: "17:00",
  paid_hours: "7",
  color: "cyan",
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

  useEffect(() => {
    void loadShifts();
  }, []);

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
    const result = editing
      ? await supabase.from("shift_templates").update(payload).eq("id", editing.id)
      : await supabase.from("shift_templates").insert(payload);
    if (result.error) {
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }
    setMessage(editing ? "Shift updated." : "Custom shift added.");
    setShowForm(false);
    setSaving(false);
    await loadShifts();
  }

  async function removeShift(shift: ShiftTemplate) {
    if (!window.confirm(`Remove ${shift.name}? Existing schedules keep their saved shift code.`)) return;
    const { error } = await supabase.from("shift_templates").delete().eq("id", shift.id);
    if (error) setErrorMessage(error.message);
    else {
      setMessage("Custom shift removed.");
      await loadShifts();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Custom Shifts</h1>
          <p className="mt-1 text-slate-600">
            Add shifts for your store. They appear in the schedule dropdown and hour totals.
          </p>
        </div>
        <button onClick={openAdd} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
          Add Custom Shift
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
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border px-3 py-2" placeholder="Early Repair Shift" />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Short code</span>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border px-3 py-2" placeholder="REPAIR-EARLY" />
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
                {["cyan", "indigo", "pink", "orange", "teal", "lime"].map((color) => <option key={color}>{color}</option>)}
              </select>
            </label>
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
          <p className="p-6 text-slate-600">No custom shifts yet. The built-in shifts remain available.</p>
        ) : (
          <div className="divide-y">
            {shifts.map((shift) => (
              <div key={shift.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-bold">{shift.name} <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs">{shift.code}</span></div>
                  <div className="mt-1 text-sm text-slate-600">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {Number(shift.paid_hours).toFixed(2)} paid hours</div>
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
    </div>
  );
}
