"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { downloadCsv } from "../../src/lib/csv";
import {
  TIME_OFF_TYPES,
  TIME_OFF_TYPE_SQL,
  isMissingTypeColumn,
  timeOffType,
  type TimeOffType,
} from "../../src/lib/timeOff";

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type TimeOffRecord = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  created_at: string | null;
  /** Missing until the request_type column is added; treated as PTO. */
  request_type?: string | null;
};

type TimeOffForm = {
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  request_type: TimeOffType;
};

const emptyForm: TimeOffForm = {
  employee_id: "",
  start_date: "",
  end_date: "",
  reason: "",
  status: "Approved",
  request_type: "pto",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DaysOffPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [requests, setRequests] = useState<TimeOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TimeOffRecord | null>(null);
  const [form, setForm] = useState<TimeOffForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // False until the request_type column exists; then requests can be PTO or a day off.
  const [typeColumnReady, setTypeColumnReady] = useState(true);

  useEffect(() => {
    void Promise.all([loadEmployees(), loadRequests()]);
  }, []);

  async function loadEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_name, employee_id, position, status")
      .or("status.eq.Active,status.is.null")
      .order("employee_name");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      return;
    }

    setEmployees((data as Employee[]) || []);
  }

  async function loadRequests() {
    setLoading(true);
    setErrorMessage("");

    // select("*") so this works before and after the request_type column is added.
    const { data, error } = await supabase
      .from("employee_time_off")
      .select("*")
      .order("start_date");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
    } else {
      const records = (data as TimeOffRecord[]) || [];
      setRequests(records);
      setTypeColumnReady(records.length === 0 || records.some((record) => "request_type" in record));
    }

    setLoading(false);
  }

  function openAddForm() {
    setEditingRecord(null);
    setForm(emptyForm);
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function openEditForm(record: TimeOffRecord) {
    setEditingRecord(record);
    setForm({
      employee_id: record.employee_id,
      start_date: record.start_date,
      end_date: record.end_date,
      reason: record.reason || "",
      status: record.status || "Approved",
      request_type: timeOffType(record),
    });
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingRecord(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.employee_id || !form.start_date || !form.end_date) {
      setErrorMessage("Employee, start date, and end date are required.");
      return;
    }

    if (form.end_date < form.start_date) {
      setErrorMessage("End date cannot be before start date.");
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const basePayload = {
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
      status: form.status,
    };
    // Before the request_type column exists every request is PTO, so only send it once it can be saved.
    const payload = typeColumnReady || form.request_type !== "pto"
      ? { ...basePayload, request_type: form.request_type }
      : basePayload;

    const result = editingRecord
      ? await supabase
          .from("employee_time_off")
          .update(payload)
          .eq("id", editingRecord.id)
          .select("id")
      : await supabase.from("employee_time_off").insert(payload).select("id");

    if (result.error) {
      console.error(result.error);
      if (isMissingTypeColumn(result.error.message)) {
        setTypeColumnReady(false);
        setErrorMessage(
          "Your database needs a one-time update before requests can be marked as PTO or a day off. Run the SQL shown below in Supabase, then try again.",
        );
      } else {
        setErrorMessage(result.error.message);
      }
      setSaving(false);
      return;
    }

    if (!result.data || result.data.length === 0) {
      setErrorMessage("This request couldn't be saved. Your account may not have permission to change days off.");
      setSaving(false);
      return;
    }

    setMessage(editingRecord ? "Days off request updated." : "Days off request added.");
    setShowForm(false);
    setEditingRecord(null);
    setForm(emptyForm);
    setSaving(false);
    await loadRequests();
  }

  async function removeRequest(record: TimeOffRecord) {
    const employee = employees.find(
      (item) => item.id === record.employee_id,
    );

    const confirmed = window.confirm(
      `Remove the days off for ${employee?.employee_name || "this employee"} from ${formatDate(
        record.start_date,
      )} through ${formatDate(record.end_date)}?`,
    );

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { data, error } = await supabase
      .from("employee_time_off")
      .delete()
      .eq("id", record.id)
      .select("id");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setErrorMessage("This request couldn't be removed. Your account may not have permission to change days off.");
      return;
    }

    setMessage("Days off request removed.");
    await loadRequests();
  }

  function getEmployee(record: TimeOffRecord) {
    return employees.find((employee) => employee.id === record.employee_id);
  }

  const sortedRecords = useMemo(
    () =>
      [...requests].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      ),
    [requests],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Days Off Requests</h1>
          <p className="mt-1 text-slate-600">
            Add days off for your team. Each request either uses PTO (paid) or is
            just a day off. Approved requests are locked into the schedule.
          </p>
        </div>

        <div className="flex gap-2">
        <button type="button" onClick={() => downloadCsv("days-off.csv", [
          ["Employee","Type","Start Date","End Date","Status","Reason"],
          ...sortedRecords.map((record) => [employees.find((employee)=>employee.id===record.employee_id)?.employee_name || "Employee",TIME_OFF_TYPES[timeOffType(record)].badge,record.start_date,record.end_date,record.status,record.reason]),
        ])} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50">Export CSV</button>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Add Days Off
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
          <p className="font-semibold">Days off error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>

          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Your account doesn&apos;t have permission to do this. Ask the
              workspace owner to check your access on the Team page.
            </p>
          )}
        </div>
      )}

      {!typeColumnReady && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">One-time setup needed</p>
          <p className="mt-1 text-sm">
            To mark requests as PTO or a regular day off, run this once in Supabase
            (SQL Editor → New query → Run). Until then, every request counts as PTO.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-800">{TIME_OFF_TYPE_SQL}</pre>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {editingRecord ? "Edit Days Off" : "Add Days Off"}
            </h2>

            <button
              type="button"
              onClick={closeForm}
              className="rounded-md px-3 py-1 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 md:col-span-2">
              <legend className="text-sm font-medium">Type *</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(TIME_OFF_TYPES) as TimeOffType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={form.request_type === type}
                    onClick={() => setForm({ ...form, request_type: type })}
                    className={`rounded-lg border p-4 text-left ${
                      form.request_type === type
                        ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-semibold">{TIME_OFF_TYPES[type].label}</span>
                    <span className="mt-1 block text-sm text-slate-600">{TIME_OFF_TYPES[type].description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="space-y-1">
              <span className="text-sm font-medium">Employee *</span>
              <select
                required
                value={form.employee_id}
                onChange={(event) =>
                  setForm({ ...form, employee_id: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_name}
                    {employee.employee_id
                      ? ` — ${employee.employee_id}`
                      : ""}
                    {employee.position ? ` (${employee.position})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Status *</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Denied">Denied</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Start date *</span>
              <input
                required
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">End date *</span>
              <input
                required
                type="date"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={(event) =>
                  setForm({ ...form, end_date: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium">Reason or note</span>
              <textarea
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Vacation, appointment, personal day, etc."
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingRecord
                  ? "Save Changes"
                  : "Add Days Off"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading days off...
        </div>
      ) : sortedRecords.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No days off requests yet. Tap Add Days Off to add one.
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedRecords.map((record) => {
            const employee = getEmployee(record);

            return (
              <div key={record.id} className="rounded-xl bg-white p-6 shadow">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold">
                        {employee?.employee_name || "Unknown employee"}
                      </h2>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          record.status === "Approved"
                            ? "bg-green-100 text-green-800"
                            : record.status === "Denied"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {record.status || "Pending"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${TIME_OFF_TYPES[timeOffType(record)].className}`}
                      >
                        {TIME_OFF_TYPES[timeOffType(record)].badge}
                      </span>
                    </div>

                    <p className="mt-2 font-medium text-slate-700">
                      {formatDate(record.start_date)} through{" "}
                      {formatDate(record.end_date)}
                    </p>

                    {employee?.employee_id && (
                      <p className="mt-1 text-sm text-slate-500">
                        Employee ID: {employee.employee_id}
                      </p>
                    )}

                    {record.reason && (
                      <p className="mt-3 text-sm text-slate-600">
                        {record.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(record)}
                      className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => void removeRequest(record)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
