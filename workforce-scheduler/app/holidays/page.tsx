"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import {
  DEFAULT_HOLIDAY_SETTINGS,
  HOLIDAY_RULE,
  formatTime,
  holidayToRule,
  holidayWorkedHours,
  isSunday,
  ruleToHoliday,
  shortDayHours,
  usHolidays,
  type Holiday,
  type HolidayRuleRow,
} from "../../src/lib/holidays";

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function summary(holiday: Holiday) {
  const pay = holiday.paid ? `${holiday.paidHours} paid hrs` : "unpaid";
  if (holiday.mode === "closed") return `Closed · ${pay}`;
  return `Open ${formatTime(holiday.open)}–${formatTime(holiday.close)} · ${pay}`;
}

function HolidayCard({
  holiday,
  onSave,
  onRemove,
}: {
  holiday: Holiday;
  onSave: (holiday: Holiday) => Promise<boolean>;
  onRemove: (holiday: Holiday) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Holiday>(holiday);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(holiday);
  const invalidHours = draft.mode === "short" && shortDayHours(draft) <= 0;

  async function save() {
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Holiday</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>
        <p className="text-sm text-slate-500 sm:pt-7">{displayDate(holiday.date)} · {summary(holiday)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["closed", "short"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setDraft({ ...draft, mode })}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              draft.mode === mode ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700"
            }`}
          >
            {mode === "closed" ? "Closed all day" : "Open shortened hours"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {draft.mode === "short" && (
          <>
            <label className="space-y-1">
              <span className="text-sm font-medium">Opens</span>
              <input
                type="time"
                value={draft.open}
                onChange={(event) => setDraft({ ...draft, open: event.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Closes</span>
              <input
                type="time"
                value={draft.close}
                onChange={(event) => setDraft({ ...draft, close: event.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          </>
        )}
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={draft.paid}
            onChange={(event) => setDraft({ ...draft, paid: event.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">Paid holiday</span>
        </label>
        {draft.paid && (
          <label className="space-y-1">
            <span className="text-sm font-medium">Paid hours per person</span>
            <input
              type="number"
              min="0"
              max="24"
              step="0.25"
              value={draft.paidHours}
              onChange={(event) => setDraft({ ...draft, paidHours: Number(event.target.value) })}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
        )}
      </div>

      <p className="text-sm text-slate-600">
        {draft.mode === "closed"
          ? `Everyone is off. Each person gets ${draft.paid ? `${draft.paidHours} paid holiday hours` : "0 hours"} for the day.`
          : invalidHours
            ? "Closing time must be after opening time."
            : `Auto Generate schedules enough people to cover your usual opener and closer counts for the ${shortDayHours(draft)}-hour day. People working count ${holidayWorkedHours(draft)} hours${
                draft.paid && holidayWorkedHours(draft) > shortDayHours(draft) ? " (topped up to the paid holiday hours)" : ""
              }; everyone else is off with ${draft.paid ? `${draft.paidHours} paid hours` : "0 hours"}.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!changed || busy || invalidHours || !draft.name.trim() || !draft.date}
          onClick={() => void save()}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRemove(holiday)}
          className="rounded-lg border border-red-200 px-4 py-2 text-red-700 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function HolidaysPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [customName, setCustomName] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    void loadHolidays();
  }, []);

  async function loadHolidays() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_rules")
      .select("id, rule_type, rule_value, employee_id, start_date, end_date")
      .eq("rule_type", HOLIDAY_RULE)
      .is("employee_id", null)
      .order("start_date");
    if (error) setErrorMessage(error.message);
    else {
      setHolidays(
        ((data as HolidayRuleRow[]) || [])
          .map(ruleToHoliday)
          .filter((holiday): holiday is Holiday => holiday !== null),
      );
    }
    setLoading(false);
  }

  const yearHolidays = useMemo(
    () => holidays.filter((holiday) => holiday.date.startsWith(String(year))),
    [holidays, year],
  );

  const suggestions = useMemo(
    () =>
      usHolidays(year).filter(
        (suggestion) =>
          !holidays.some((holiday) => holiday.date === suggestion.date && holiday.name === suggestion.name),
      ),
    [holidays, year],
  );

  function clearNotices() {
    setMessage("");
    setErrorMessage("");
  }

  async function addHoliday(name: string, date: string, source: Holiday["source"]) {
    clearNotices();
    if (holidays.some((holiday) => holiday.date === date)) {
      setErrorMessage(`There's already a holiday on ${displayDate(date)}. Edit that one instead.`);
      return false;
    }
    setAdding(`${name}|${date}`);
    const { error } = await supabase
      .from("ai_rules")
      .insert(holidayToRule({ ...DEFAULT_HOLIDAY_SETTINGS, name, date, source }));
    setAdding(null);
    if (error) {
      setErrorMessage(error.message);
      return false;
    }
    setMessage(`${name} added as closed and paid. Change it below if you're open shortened hours.`);
    await loadHolidays();
    return true;
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault();
    if (await addHoliday(customName.trim(), customDate, "custom")) {
      setCustomName("");
      setCustomDate("");
    }
  }

  async function saveHoliday(holiday: Holiday) {
    clearNotices();
    if (holidays.some((other) => other.id !== holiday.id && other.date === holiday.date)) {
      setErrorMessage(`There's already a holiday on ${displayDate(holiday.date)}.`);
      return false;
    }
    const { data, error } = await supabase
      .from("ai_rules")
      .update(holidayToRule(holiday))
      .eq("id", holiday.id)
      .select("id");
    if (error) {
      setErrorMessage(error.message);
      return false;
    }
    if (!data || data.length === 0) {
      setErrorMessage("This holiday couldn't be saved. Your account may not have permission to change rules.");
      return false;
    }
    setMessage(`${holiday.name} saved. Re-run Auto Generate for that week to apply it.`);
    await loadHolidays();
    return true;
  }

  async function removeHoliday(holiday: Holiday) {
    if (!window.confirm(`Remove ${holiday.name}? Schedules you already saved keep their shifts.`)) return;
    clearNotices();
    const { data, error } = await supabase.from("ai_rules").delete().eq("id", holiday.id).select("id");
    if (error) setErrorMessage(error.message);
    else if (!data || data.length === 0) {
      setErrorMessage("This holiday couldn't be removed. Your account may not have permission to change rules.");
    } else {
      setMessage(`${holiday.name} removed.`);
      await loadHolidays();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Holidays</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Pick the holidays your business observes. For each one, choose whether you&apos;re closed
            or open shortened hours, and whether it&apos;s paid. Auto Generate follows these settings.
          </p>
        </div>
        <div className="flex gap-2">
          {[thisYear, thisYear + 1].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setYear(option)}
              className={`rounded-lg px-4 py-2 font-semibold ${
                year === option ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="rounded-lg bg-green-50 p-3 text-green-800">{message}</div>}
      {errorMessage && <div className="rounded-lg bg-red-50 p-3 text-red-800">{errorMessage}</div>}

      <div className="rounded-xl bg-white shadow">
        <h2 className="border-b p-5 text-xl font-bold">Your {year} holidays</h2>
        {loading ? (
          <p className="p-5">Loading holidays...</p>
        ) : yearHolidays.length === 0 ? (
          <p className="p-5 text-slate-600">No holidays for {year} yet. Add US holidays or your own below.</p>
        ) : (
          <div className="divide-y">
            {yearHolidays.map((holiday) => (
              <HolidayCard key={`${holiday.id}-${JSON.stringify(holiday)}`} holiday={holiday} onSave={saveHoliday} onRemove={removeHoliday} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-bold">US holidays</h2>
        <p className="mt-1 text-sm text-slate-600">
          Tap Add for each holiday you observe. Dates are the actual calendar dates.
        </p>
        <div className="mt-4 divide-y">
          {suggestions.length === 0 ? (
            <p className="py-3 text-slate-600">You&apos;ve added every US holiday for {year}.</p>
          ) : (
            suggestions.map((suggestion) => {
              const sunday = isSunday(suggestion.date);
              return (
                <div key={suggestion.name} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold">{suggestion.name}</p>
                    <p className="text-sm text-slate-500">
                      {displayDate(suggestion.date)}
                      {sunday ? " · falls on a Sunday, so it doesn't affect the schedule" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sunday || adding !== null}
                    onClick={() => void addHoliday(suggestion.name, suggestion.date, "us")}
                    className="shrink-0 rounded-lg border px-4 py-2 font-semibold disabled:opacity-40"
                  >
                    {adding === `${suggestion.name}|${suggestion.date}` ? "Adding..." : "Add"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <form onSubmit={addCustom} className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-bold">Add your own holiday</h2>
        <p className="mt-1 text-sm text-slate-600">For company days, local events, or anything not listed above.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            required
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="Example: Company picnic"
            className="rounded-lg border px-3 py-2"
          />
          <input
            required
            type="date"
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
            className="rounded-lg border px-3 py-2"
          />
          <button
            type="submit"
            disabled={adding !== null}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Add holiday
          </button>
        </div>
      </form>
    </div>
  );
}
