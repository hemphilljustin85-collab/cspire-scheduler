"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type PTORecord = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  created_at: string | null;
};

type PTOForm = {
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
};

const emptyForm: PTOForm = {
  employee_id: "",
  start_date: "",
  end_date: "",
  reason: "",
  status: "Approved",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PTOPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ptoRecords, setPtoRecords] = useState<PTORecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PTORecord | null>(null);
  const [form, setForm] = useState<PTOForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void Promise.all([loadEmployees(), loadPTO()]);
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

  async function loadPTO() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("employee_time_off")
      .select("id, employee_id, start_date, end_date, reason, status, created_at")
      .order("start_date");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
    } else {
      setPtoRecords((data as PTORecord[]) || []);
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

  function openEditForm(record: PTORecord) {
    setEditingRecord(record);
    setForm({
      employee_id: record.employee_id,
      start_date: record.start_date,
      end_date: record.end_date,
      reason: record.reason || "",
      status: record.status || "Approved",
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

    const payload = {
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
      status: form.status,
    };

    const result = editingRecord
      ? await supabase
          .from("employee_time_off")
          .update(payload)
          .eq("id", editingRecord.id)
      : await supabase.from("employee_time_off").insert(payload);

    if (result.error) {
      console.error(result.error);
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }

    setMessage(editingRecord ? "PTO request updated." : "PTO request added.");
    setShowForm(false);
    setEditingRecord(null);
    setForm(emptyForm);
    setSaving(false);
    await loadPTO();
  }

  async function removePTO(record: PTORecord) {
    const employee = employees.find(
      (item) => item.id === record.employee_id,
    );

    const confirmed = window.confirm(
      `Remove PTO for ${employee?.employee_name || "this employee"} from ${formatDate(
        record.start_date,
      )} through ${formatDate(record.end_date)}?`,
    );

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("employee_time_off")
      .delete()
      .eq("id", record.id);

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      return;
    }

    setMessage("PTO request removed.");
    await loadPTO();
  }

  function getEmployee(record: PTORecord) {
    return employees.find((employee) => employee.id === record.employee_id);
  }

  const sortedRecords = useMemo(
    () =>
      [...ptoRecords].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      ),
    [ptoRecords],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">PTO Management</h1>
          <p className="mt-1 text-slate-600">
            Add and manage employee time off used by the schedule generator.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Add PTO
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">PTO error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>

          {errorMessage.toLowerCase().includes("status") && (
            <p className="mt-2 text-sm">
              The employee_time_off table needs a status column.
            </p>
          )}

          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Supabase RLS is blocking this action. The employee_time_off table
              needs select, insert, update, and delete policies.
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {editingRecord ? "Edit PTO" : "Add PTO"}
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
                  : "Add PTO"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading PTO records...
        </div>
      ) : sortedRecords.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No PTO records have been added yet.
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
                      onClick={() => void removePTO(record)}
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
