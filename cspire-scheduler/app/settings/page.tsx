"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Settings = {
  id: string;
  openers_per_day: number;
  closers_per_day: number;
  target_hours: number;
  days_off_per_week: number;
  saturday_off_goal: number;
  manager_saturday_goal: number;
};

type SettingsForm = Omit<Settings, "id">;

const defaultSettings: SettingsForm = {
  openers_per_day: 2,
  closers_per_day: 2,
  target_hours: 40,
  days_off_per_week: 1,
  saturday_off_goal: 1,
  manager_saturday_goal: 2,
};

export default function SettingsPage() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [form, setForm] = useState<SettingsForm>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const { data, error } = await supabase
      .from("scheduler_settings")
      .select(
        "id, openers_per_day, closers_per_day, target_hours, days_off_per_week, saturday_off_goal, manager_saturday_goal",
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setSettingsId(null);
      setForm(defaultSettings);
      setLoading(false);
      return;
    }

    setSettingsId(data.id);
    setForm({
      openers_per_day: Number(data.openers_per_day ?? 2),
      closers_per_day: Number(data.closers_per_day ?? 2),
      target_hours: Number(data.target_hours ?? 40),
      days_off_per_week: Number(data.days_off_per_week ?? 1),
      saturday_off_goal: Number(data.saturday_off_goal ?? 1),
      manager_saturday_goal: Number(data.manager_saturday_goal ?? 2),
    });
    setLoading(false);
  }

  function updateNumber(
    field: keyof SettingsForm,
    value: string,
  ) {
    const parsedValue = Number(value);

    setForm((current) => ({
      ...current,
      [field]: Number.isFinite(parsedValue) ? parsedValue : 0,
    }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const payload = {
      openers_per_day: Math.max(0, Math.floor(form.openers_per_day)),
      closers_per_day: Math.max(0, Math.floor(form.closers_per_day)),
      target_hours: Math.max(0, form.target_hours),
      days_off_per_week: Math.max(
        0,
        Math.floor(form.days_off_per_week),
      ),
      saturday_off_goal: Math.max(
        0,
        Math.floor(form.saturday_off_goal),
      ),
      manager_saturday_goal: Math.max(
        0,
        Math.floor(form.manager_saturday_goal),
      ),
    };

    const result = settingsId
      ? await supabase
          .from("scheduler_settings")
          .update(payload)
          .eq("id", settingsId)
          .select("id")
          .single()
      : await supabase
          .from("scheduler_settings")
          .insert(payload)
          .select("id")
          .single();

    if (result.error) {
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }

    setSettingsId(result.data.id);
    setForm(payload);
    setMessage("Settings saved successfully.");
    setSaving(false);
  }

  async function resetDefaults() {
    const confirmed = window.confirm(
      "Reset all scheduler settings to their default values?",
    );

    if (!confirmed) return;

    setForm(defaultSettings);
    setMessage(
      "Default values loaded. Click Save Settings to store them.",
    );
    setErrorMessage("");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">Settings</h1>
        <div className="rounded-xl bg-white p-6 shadow">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Settings</h1>
        <p className="mt-1 text-slate-600">
          Manage the default staffing requirements used by the scheduler.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Settings error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>

          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Supabase RLS is blocking this action. The scheduler_settings
              table needs select, insert, and update policies.
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={saveSettings}
        className="rounded-xl bg-white p-6 shadow"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="font-medium">Openers per day</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.openers_per_day}
              onChange={(event) =>
                updateNumber("openers_per_day", event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="font-medium">Closers per day</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.closers_per_day}
              onChange={(event) =>
                updateNumber("closers_per_day", event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="font-medium">Target weekly hours</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={form.target_hours}
              onChange={(event) =>
                updateNumber("target_hours", event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="font-medium">Days off per week</span>
            <input
              type="number"
              min="0"
              max="6"
              step="1"
              value={form.days_off_per_week}
              onChange={(event) =>
                updateNumber("days_off_per_week", event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="font-medium">Saturday-off goal</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.saturday_off_goal}
              onChange={(event) =>
                updateNumber("saturday_off_goal", event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="font-medium">
              Manager Saturday goal
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.manager_saturday_goal}
              onChange={(event) =>
                updateNumber(
                  "manager_saturday_goal",
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        {!settingsId && (
          <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            No settings row was found. Saving will create the first one
            using these values.
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => void resetDefaults()}
            className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
          >
            Reset Defaults
          </button>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        These values are the scheduler defaults. Your Rules page can still
        add more specific store-wide or employee-level exceptions.
      </div>
    </div>
  );
}
