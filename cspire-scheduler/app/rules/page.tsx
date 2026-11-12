"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { parseAvoidDays, parseClosingPattern } from "../../src/lib/closingPrefs";

type Rule = {
  id: string;
  store_id: string | null;
  employee_id: string | null;
  rule_type: string;
  rule_value: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
};

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type RuleForm = {
  employee_id: string;
  rule_type: string;
  rule_value: string;
  start_date: string;
  end_date: string;
};

const emptyForm: RuleForm = {
  employee_id: "",
  rule_type: "openers_per_day",
  rule_value: "2",
  start_date: "",
  end_date: "",
};

const RULE_TYPES = [
  { value: "openers_per_day", label: "Openers per day" },
  { value: "closers_per_day", label: "Closers per day" },
  { value: "target_hours", label: "Target weekly hours" },
  { value: "days_off_per_week", label: "Days off per week" },
  { value: "saturday_off_goal", label: "Saturday-off goal" },
  { value: "manager_saturday_goal", label: "Manager Saturday goal" },
  { value: "availability", label: "Employee availability" },
  { value: "unavailable", label: "Employee unavailable" },
  { value: "preferred_shift", label: "Preferred shift" },
  { value: "required_shift", label: "Required employee shift" },
  { value: "allowed_days_for_shift", label: "Allowed days for shift" },
  { value: "blocked_days_for_shift", label: "Blocked days for shift" },
  { value: "preferred_day_off", label: "Preferred employee day off" },
  { value: "monthly_close_target", label: "Closes per month on a day" },
  { value: "monthly_open_target", label: "Opens per month on a day" },
  { value: "avoid_closing_days", label: "Prefers not to close on" },
  { value: "closing_pattern", label: "Closing shifts: back-to-back or spread out" },
  { value: "custom", label: "Custom rule" },
];

function formatRuleType(value: string) {
  return (
    RULE_TYPES.find((rule) => rule.value === value)?.label ??
    value.replaceAll("_", " ")
  );
}

function getRulePlaceholder(ruleType: string) {
  switch (ruleType) {
    case "allowed_days_for_shift": return "Example: AM|Monday";
    case "blocked_days_for_shift": return "Example: AM|Saturday";
    case "required_shift": return "Example: Monday|CLOSE";
    case "preferred_day_off": return "Example: Saturday";
    case "availability": return "Example: Monday,Tuesday,Wednesday";
    case "unavailable": return "Example: Friday,Saturday";
    case "preferred_shift": return "Example: AM";
    case "monthly_close_target": return "Example: Saturday|2";
    case "monthly_open_target": return "Example: Monday|2";
    case "avoid_closing_days": return "Example: Thursday";
    case "closing_pattern": return "Together or Apart";
    default: return "Example: 2, 40, or Monday";
  }
}

function getRuleHelp(ruleType: string) {
  switch (ruleType) {
    case "allowed_days_for_shift": return "Format: SHIFT|DAY or SHIFT|DAY,DAY, using a short code from the Shifts page. Example: AM|Monday means the AM shift may only be assigned on Monday.";
    case "blocked_days_for_shift": return "Format: SHIFT|DAY or SHIFT|DAY,DAY. The generator will avoid that shift on those days.";
    case "required_shift": return "Choose an employee, then use DAY|SHIFT with a short code from the Shifts page. Example: Monday|CLOSE.";
    case "preferred_day_off": return "Choose an employee and enter a day such as Saturday.";
    case "monthly_close_target": return "Format: DAY|NUMBER. Example: Saturday|2 means this person should close about 2 Saturdays each month (0 means avoid closing that day). Choose All employees to set it for everyone; a rule for one person overrides it. Auto Generate also counts closes already saved earlier in the month and in the previous month so it stays even.";
    case "avoid_closing_days": return "Choose an employee and enter one or more days, e.g. Thursday or Thursday,Friday. Auto Generate avoids giving them closing shifts on these days when it can, and the schedule check shows a heads-up when they close on one.";
    case "closing_pattern": return "Choose an employee and enter Together (they prefer closing shifts back-to-back, like Thu–Fri–Sat) or Apart (they prefer closes spread out, never two nights in a row). Auto Generate follows this when it can, and the schedule check shows a heads-up when it isn't met.";
    case "monthly_open_target": return "Format: DAY|NUMBER. Example: Monday|2 means this person should open about 2 Mondays each month (0 means avoid opening that day). Choose All employees to set it for everyone; a rule for one person overrides it.";
    case "availability": return "Choose an employee and list allowed days separated by commas.";
    case "unavailable": return "Choose an employee and list blocked days separated by commas.";
    default: return "Choose All employees for a store-wide rule. Date fields are optional.";
  }
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Bring the form into view when it opens (the Edit buttons can be far down the list).
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showForm, editingRule]);

  useEffect(() => {
    void Promise.all([loadRules(), loadEmployees()]);
  }, []);

  async function loadRules() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("ai_rules")
      .select(
        "id, store_id, employee_id, rule_type, rule_value, start_date, end_date, created_at",
      )
      .order("rule_type");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
    } else {
      // The starter-shift toggle and holidays have their own pages, not this list.
      setRules(((data as Rule[]) || []).filter((rule) => !["starter_shifts", "holiday", "employee_order", "positions", "position_requirement"].includes(rule.rule_type)));
    }

    setLoading(false);
  }


  async function loadEmployees() {
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_name, employee_id, position, status")
      .or("status.eq.Active,status.is.null")
      .order("employee_name");

    if (error) {
      console.error(error);
      setErrorMessage((current) =>
        current ? `${current} | ${error.message}` : error.message,
      );
      return;
    }

    setEmployees((data as Employee[]) || []);
  }

  function openAddForm() {
    setEditingRule(null);
    setForm(emptyForm);
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function openEditForm(rule: Rule) {
    setEditingRule(rule);
    setForm({
      employee_id: rule.employee_id || "",
      rule_type: rule.rule_type,
      rule_value: rule.rule_value,
      start_date: rule.start_date || "",
      end_date: rule.end_date || "",
    });
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingRule(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.rule_type.trim() || !form.rule_value.trim()) {
      setErrorMessage("Rule type and rule value are required.");
      return;
    }

    if (["avoid_closing_days", "closing_pattern"].includes(form.rule_type) && !form.employee_id) {
      setErrorMessage("Choose the employee this closing preference is for.");
      return;
    }

    if (form.rule_type === "avoid_closing_days") {
      const listed = form.rule_value.split(",").filter((day) => day.trim()).length;
      if (listed === 0 || parseAvoidDays(form.rule_value).length !== listed) {
        setErrorMessage("Enter one or more days Monday–Saturday, separated by commas, e.g. Thursday,Friday.");
        return;
      }
    }

    if (form.rule_type === "closing_pattern" && !parseClosingPattern(form.rule_value)) {
      setErrorMessage("Enter Together (closing shifts back-to-back) or Apart (spread out).");
      return;
    }

    if (["monthly_close_target", "monthly_open_target"].includes(form.rule_type)) {
      const [dayValue, countValue] = form.rule_value.split("|").map((part) => part.trim());
      const validDay = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].includes((dayValue || "").toLowerCase());
      const count = Number(countValue);
      if (!validDay || countValue === undefined || countValue === "" || !Number.isInteger(count) || count < 0 || count > 6) {
        setErrorMessage("Use DAY|NUMBER, for example Saturday|2 (a day Monday–Saturday and a whole number from 0 to 6).");
        return;
      }
    }

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const payload = {
      employee_id: form.employee_id.trim() || null,
      rule_type: form.rule_type.trim(),
      rule_value: form.rule_value.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };

    const result = editingRule
      ? await supabase.from("ai_rules").update(payload).eq("id", editingRule.id).select("id")
      : await supabase.from("ai_rules").insert(payload).select("id");

    if (result.error) {
      console.error(result.error);
      setErrorMessage(result.error.message);
      setSaving(false);
      return;
    }

    // Supabase returns no error when access rules block a change; it just changes nothing.
    if (!result.data || result.data.length === 0) {
      setErrorMessage(
        editingRule
          ? "This rule couldn't be updated. Your account may not have permission to edit rules. Ask the workspace owner to check access."
          : "This rule couldn't be added. Your account may not have permission to add rules. Ask the workspace owner to check access.",
      );
      setSaving(false);
      return;
    }

    setMessage(editingRule ? "Rule updated." : "Rule added.");
    setShowForm(false);
    setEditingRule(null);
    setForm(emptyForm);
    setSaving(false);
    await loadRules();
  }

  function getEmployeeLabel(employeeUuid: string | null) {
    if (!employeeUuid) return "Applies to all employees";

    const employee = employees.find((item) => item.id === employeeUuid);

    if (!employee) return `Employee: ${employeeUuid}`;

    return employee.employee_id
      ? `${employee.employee_name} — ${employee.employee_id}`
      : employee.employee_name;
  }

  async function removeRule(rule: Rule) {
    const confirmed = window.confirm(
      `Remove the rule "${formatRuleType(rule.rule_type)}"?`,
    );

    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    const { data, error } = await supabase
      .from("ai_rules")
      .delete()
      .eq("id", rule.id)
      .select("id");

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setErrorMessage("This rule couldn't be removed. Your account may not have permission to remove rules. Ask the workspace owner to check access.");
      return;
    }

    setMessage("Rule removed.");
    await loadRules();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Rules Management</h1>
          <p className="mt-1 text-slate-600">
            Add store-wide and employee-specific scheduling rules.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Add Rule
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Rules error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Your account doesn&apos;t have permission to change rules. Ask the
              workspace owner to check your access on the Team page.
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="scroll-mt-4 rounded-xl bg-white p-6 shadow">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {editingRule ? "Edit Rule" : "Add Rule"}
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
              <span className="text-sm font-medium">Rule type *</span>
              <select
                value={form.rule_type}
                onChange={(event) => {
                  const ruleType = event.target.value;
                  setForm({
                    ...form,
                    rule_type: ruleType,
                    rule_value:
                      ruleType === "allowed_days_for_shift"
                        ? "AM|Monday"
                        : ruleType === "blocked_days_for_shift"
                          ? "AM|Saturday"
                          : ruleType === "required_shift"
                            ? "Monday|CLOSE"
                            : ruleType === "preferred_day_off"
                              ? "Saturday"
                              : ruleType === "monthly_close_target"
                                ? "Saturday|2"
                                : ruleType === "monthly_open_target"
                                  ? "Monday|2"
                                  : ruleType === "avoid_closing_days"
                                    ? "Thursday"
                                    : ruleType === "closing_pattern"
                                      ? "Together"
                                      : form.rule_value,
                  });
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {RULE_TYPES.map((rule) => (
                  <option key={rule.value} value={rule.value}>
                    {rule.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Rule value *</span>
              <input
                required
                value={form.rule_value}
                onChange={(event) =>
                  setForm({ ...form, rule_value: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder={getRulePlaceholder(form.rule_type)}
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Employee</span>
              <select
                value={form.employee_id}
                onChange={(event) =>
                  setForm({ ...form, employee_id: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">All employees / store-wide rule</option>
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
              <span className="text-sm font-medium">Start date</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">End date</span>
              <input
                type="date"
                value={form.end_date}
                onChange={(event) =>
                  setForm({ ...form, end_date: event.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            {getRuleHelp(form.rule_type)}
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
                : editingRule
                  ? "Save Changes"
                  : "Add Rule"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No scheduling rules have been added yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-xl bg-white p-6 shadow">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                    {formatRuleType(rule.rule_type)}
                  </div>

                  <div className="mt-2 text-2xl font-bold text-slate-900">
                    {rule.rule_value}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      {getEmployeeLabel(rule.employee_id)}
                    </span>

                    {(rule.start_date || rule.end_date) && (
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {rule.start_date || "Any time"} through{" "}
                        {rule.end_date || "No end date"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(rule)}
                    className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeRule(rule)}
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
