"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Employee = {
  id: string;
  store_id: string | null;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
  hire_date: string | null;
  email: string | null;
  phone: string | null;
  notify_email: boolean;
  notify_sms: boolean;
};

type EmployeeForm = {
  employee_name: string;
  employee_id: string;
  position: string;
  status: string;
  hire_date: string;
  email: string;
  phone: string;
  notify_email: boolean;
  notify_sms: boolean;
};

const emptyForm: EmployeeForm = {
  employee_name: "",
  employee_id: "",
  position: "ASR II",
  status: "Active",
  hire_date: "",
  email: "",
  phone: "",
  notify_email: true,
  notify_sms: true,
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("employees")
      .select("id, store_id, employee_name, employee_id, position, status, hire_date, email, phone, notify_email, notify_sms")
      .order("employee_name");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
    } else {
      setEmployees((data as Employee[]) || []);
    }

    setLoading(false);
  }

  function openAddForm() {
    setEditingEmployee(null);
    setForm(emptyForm);
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function openEditForm(employee: Employee) {
    setEditingEmployee(employee);
    setForm({
      employee_name: employee.employee_name || "",
      employee_id: employee.employee_id || "",
      position: employee.position || "",
      status: employee.status || "Active",
      hire_date: employee.hire_date || "",
      email: employee.email || "",
      phone: employee.phone || "",
      notify_email: employee.notify_email ?? true,
      notify_sms: employee.notify_sms ?? true,
    });
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingEmployee(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const employeeName = form.employee_name.trim();
    if (!employeeName) {
      setErrorMessage("Employee name is required.");
      return;
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const payload = {
      employee_name: employeeName,
      employee_id: form.employee_id.trim() || null,
      position: form.position.trim() || null,
      status: form.status.trim() || "Active",
      hire_date: form.hire_date || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notify_email: form.notify_email,
      notify_sms: form.notify_sms,
    };

    const result = editingEmployee
      ? await supabase.from("employees").update(payload).eq("id", editingEmployee.id)
      : await supabase.from("employees").insert(payload);

    if (result.error) {
      console.error(result.error);
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }

    setMessage(editingEmployee ? "Employee updated." : "Employee added.");
    setShowForm(false);
    setEditingEmployee(null);
    setForm(emptyForm);
    setSaving(false);
    await loadEmployees();
  }

  async function removeEmployee(employee: Employee) {
    const confirmed = window.confirm(
      `Remove ${employee.employee_name}? This cannot be undone.`,
    );

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", employee.id);

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      return;
    }

    setMessage("Employee removed.");
    await loadEmployees();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Employees</h1>
          <p className="mt-1 text-slate-600">
            Add, edit, and manage employees used by the scheduler.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Add Employee
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Supabase RLS is blocking this action. The employees table needs
              insert, update, and delete policies for the current user.
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {editingEmployee ? "Edit Employee" : "Add Employee"}
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
              <span className="text-sm font-medium">Employee name *</span>
              <input
                required
                value={form.employee_name}
                onChange={(event) =>
                  setForm({ ...form, employee_name: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Employee name"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Employee ID</span>
              <input
                value={form.employee_id}
                onChange={(event) =>
                  setForm({ ...form, employee_id: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Optional employee ID"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Email address</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="employee@example.com"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Mobile phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="+16015551234"
              />
              <span className="text-xs text-slate-500">
                Use country code format, such as +16015551234.
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={form.notify_email}
                onChange={(event) =>
                  setForm({ ...form, notify_email: event.target.checked })
                }
                className="h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium">
                  Email schedule notifications
                </span>
                <span className="block text-xs text-slate-500">
                  Send an email when a schedule is published.
                </span>
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={form.notify_sms}
                onChange={(event) =>
                  setForm({ ...form, notify_sms: event.target.checked })
                }
                className="h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium">
                  Text schedule notifications
                </span>
                <span className="block text-xs text-slate-500">
                  Send an SMS when a schedule is published.
                </span>
              </span>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Position</span>
              <select
                value={form.position}
                onChange={(event) =>
                  setForm({ ...form, position: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Market Manager">Market Manager</option>
                <option value="Store Manager">Store Manager</option>
                <option value="Assistant Manager">Assistant Manager</option>
                <option value="Team Leader">Team Leader</option>
                <option value="Repair Tech">Repair Tech</option>
                <option value="ASR II">ASR II</option>
                <option value="ASR I">ASR I</option>
                <option value="Part Time">Part Time</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Leave">Leave</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Hire date</span>
              <input
                type="date"
                value={form.hire_date}
                onChange={(event) =>
                  setForm({ ...form, hire_date: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingEmployee
                  ? "Save Changes"
                  : "Add Employee"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading employees...
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No employees found. Click Add Employee to create the first one.
        </div>
      ) : (
        <div className="grid gap-4">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-xl bg-white p-6 shadow">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">
                      {employee.employee_name}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        employee.status === "Active"
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {employee.status || "No status"}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <p>{employee.position || "No position assigned"}</p>
                    {employee.employee_id && <p>ID: {employee.employee_id}</p>}
                    {employee.hire_date && <p>Hired: {employee.hire_date}</p>}
                    {employee.email && (
                      <p>
                        Email: {employee.email}
                        {employee.notify_email ? " · notifications on" : " · notifications off"}
                      </p>
                    )}
                    {employee.phone && (
                      <p>
                        Phone: {employee.phone}
                        {employee.notify_sms ? " · texts on" : " · texts off"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(employee)}
                    className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeEmployee(employee)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
