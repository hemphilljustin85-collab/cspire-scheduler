"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type Schedule = {
  id: string;
  week_start: string;
  status: string;
};

type ScheduleEntry = {
  employee_id: string;
  shift_date: string;
  shift_code: string;
  hours: number;
};

type Metric = {
  employee_id: string;
  monday_closes: number;
  friday_closes: number;
  saturday_closes: number;
  saturdays_off: number;
  current_hours: number;
  total_hours: number;
  days_off: number;
};

type PTORecord = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

type Settings = {
  openers_per_day: number;
  closers_per_day: number;
  target_hours: number;
  days_off_per_week: number;
  saturday_off_goal: number;
  manager_saturday_goal: number;
};

const DEFAULT_SETTINGS: Settings = {
  openers_per_day: 2,
  closers_per_day: 2,
  target_hours: 40,
  days_off_per_week: 1,
  saturday_off_goal: 1,
  manager_saturday_goal: 1,
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

function getMonday(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return formatDate(copy);
}

function prettyDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [weekStart, setWeekStart] = useState(getMonday());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [pto, setPto] = useState<PTORecord[]>([]);
  const [ruleCount, setRuleCount] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadDashboard();
  }, [weekStart]);

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");

    const weekEnd = addDays(weekStart, 5);

    const [
      employeeResult,
      scheduleResult,
      metricResult,
      ptoResult,
      ruleResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_name, employee_id, position, status")
        .or("status.eq.Active,status.is.null")
        .order("employee_name"),
      supabase
        .from("schedules")
        .select("id, week_start, status")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("schedule_metrics")
        .select(
          "employee_id, monday_closes, friday_closes, saturday_closes, saturdays_off, current_hours, total_hours, days_off",
        ),
      supabase
        .from("employee_time_off")
        .select("id, employee_id, start_date, end_date, status, reason")
        .eq("status", "Approved")
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart),
      supabase
        .from("ai_rules")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("scheduler_settings")
        .select(
          "openers_per_day, closers_per_day, target_hours, days_off_per_week, saturday_off_goal, manager_saturday_goal",
        )
        .limit(1)
        .maybeSingle(),
    ]);

    const error =
      employeeResult.error ||
      scheduleResult.error ||
      metricResult.error ||
      ptoResult.error ||
      ruleResult.error ||
      settingsResult.error;

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setEmployees((employeeResult.data as Employee[]) || []);
    setMetrics((metricResult.data as Metric[]) || []);
    setPto((ptoResult.data as PTORecord[]) || []);
    setRuleCount(ruleResult.count || 0);
    setSettings(
      settingsResult.data
        ? (settingsResult.data as Settings)
        : DEFAULT_SETTINGS,
    );

    if (!scheduleResult.data) {
      setSchedule(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    const currentSchedule = scheduleResult.data as Schedule;
    setSchedule(currentSchedule);

    const { data, error: entryError } = await supabase
      .from("schedule_entries")
      .select("employee_id, shift_date, shift_code, hours")
      .eq("schedule_id", currentSchedule.id);

    if (entryError) {
      setErrorMessage(entryError.message);
      setLoading(false);
      return;
    }

    setEntries((data as ScheduleEntry[]) || []);
    setLoading(false);
  }

  const summary = useMemo(() => {
    const scheduledIds = new Set(entries.map((entry) => entry.employee_id));
    const totalHours = entries.reduce(
      (sum, entry) => sum + Number(entry.hours || 0),
      0,
    );

    const alerts: {
      employeeId: string;
      employeeName: string;
      message: string;
      level: "high" | "medium";
    }[] = [];

    for (const employee of employees) {
      const metric = metrics.find(
        (item) => item.employee_id === employee.id,
      );

      if (!metric) continue;

      const hours = Number(metric.current_hours || 0);
      const target = Number(settings.target_hours || 40);

      if (hours > target) {
        alerts.push({
          employeeId: employee.id,
          employeeName: employee.employee_name,
          message: `${hours.toFixed(2)} hours is above the ${target}-hour target.`,
          level: "high",
        });
      } else if (hours > 0 && hours < target - 5) {
        alerts.push({
          employeeId: employee.id,
          employeeName: employee.employee_name,
          message: `${hours.toFixed(2)} hours is below target.`,
          level: "medium",
        });
      }

      if (
        Number(metric.days_off || 0) <
        Number(settings.days_off_per_week || 1)
      ) {
        alerts.push({
          employeeId: employee.id,
          employeeName: employee.employee_name,
          message: `Only ${metric.days_off || 0} day(s) off this week.`,
          level: "high",
        });
      }

      if (
        Number(metric.saturday_closes || 0) > 0 &&
        Number(metric.saturdays_off || 0) <
          Number(settings.saturday_off_goal || 1)
      ) {
        alerts.push({
          employeeId: employee.id,
          employeeName: employee.employee_name,
          message: "Saturday fairness may need review.",
          level: "medium",
        });
      }
    }

    return {
      activeEmployees: employees.length,
      scheduledEmployees: scheduledIds.size,
      totalHours,
      approvedPTO: pto.length,
      activeRules: ruleCount,
      alerts,
    };
  }, [employees, entries, metrics, pto, ruleCount, settings]);

  const quickLinks = [
    ["/schedule", "Build Schedule", "Create and save the weekly schedule."],
    ["/employees", "Employees", "Add, update, or deactivate employees."],
    ["/pto", "PTO", "Review approved and upcoming time off."],
    ["/rules", "Rules", "Manage scheduling and employee rules."],
    ["/metrics", "Metrics", "Review hours, closes, and fairness."],
    ["/reports", "Reports", "Print the weekly schedule and summary."],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Dashboard</h1>
          <p className="mt-1 text-slate-600">
            Live workforce overview for the week of {prettyDate(weekStart)}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Previous Week
          </button>

          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
            <span className="text-sm font-medium">Week of</span>
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="py-2 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Next Week
          </button>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Dashboard error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading dashboard...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ["Active Employees", summary.activeEmployees],
              ["Scheduled Employees", summary.scheduledEmployees],
              ["Scheduled Hours", summary.totalHours.toFixed(2)],
              ["Approved PTO", summary.approvedPTO],
              ["Active Rules", summary.activeRules],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-white p-5 shadow">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="mt-1 text-3xl font-bold">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl bg-white p-6 shadow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Current Week Status</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Week of {prettyDate(weekStart)}
                  </p>
                </div>

                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    schedule
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {schedule
                    ? schedule.status || "Saved"
                    : "No saved schedule"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Schedule Coverage</p>
                  <p className="mt-1 text-2xl font-bold">
                    {summary.scheduledEmployees} / {summary.activeEmployees}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    active employees scheduled
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Average Hours</p>
                  <p className="mt-1 text-2xl font-bold">
                    {summary.scheduledEmployees
                      ? (
                          summary.totalHours / summary.scheduledEmployees
                        ).toFixed(2)
                      : "0.00"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    per scheduled employee
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Target Hours</p>
                  <p className="mt-1 text-2xl font-bold">
                    {Number(settings.target_hours || 40).toFixed(0)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">per employee</p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Daily Staffing Goal</p>
                  <p className="mt-1 text-2xl font-bold">
                    {settings.openers_per_day} / {settings.closers_per_day}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    openers / closers
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/schedule"
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >
                  Open Schedule
                </Link>
                <Link
                  href="/reports"
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50"
                >
                  View Weekly Report
                </Link>
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Fairness Alerts</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Employees who may need schedule adjustments.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
                  {summary.alerts.length}
                </span>
              </div>

              {summary.alerts.length === 0 ? (
                <div className="mt-5 rounded-lg bg-green-50 p-4 text-green-800">
                  No fairness alerts were found for this week.
                </div>
              ) : (
                <div className="mt-5 max-h-80 space-y-3 overflow-y-auto">
                  {summary.alerts.slice(0, 8).map((alert, index) => (
                    <div
                      key={`${alert.employeeId}-${index}`}
                      className={`rounded-lg border p-3 ${
                        alert.level === "high"
                          ? "border-red-200 bg-red-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="font-semibold">{alert.employeeName}</div>
                      <div className="mt-1 text-sm text-slate-700">
                        {alert.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Link
                href="/metrics"
                className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50"
              >
                Open Metrics
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">
                    Approved PTO This Week
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Requests overlapping the selected week.
                  </p>
                </div>
                <Link
                  href="/pto"
                  className="text-sm font-semibold text-blue-600"
                >
                  Manage PTO
                </Link>
              </div>

              {pto.length === 0 ? (
                <p className="mt-5 text-slate-500">
                  No approved PTO overlaps this week.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {pto.slice(0, 4).map((record) => {
                    const employee = employees.find(
                      (item) => item.id === record.employee_id,
                    );

                    return (
                      <div
                        key={record.id}
                        className="rounded-lg bg-purple-50 p-3"
                      >
                        <div className="font-semibold text-purple-900">
                          {employee?.employee_name || "Unknown employee"}
                        </div>
                        <div className="text-sm text-purple-800">
                          {prettyDate(record.start_date)} through{" "}
                          {prettyDate(record.end_date)}
                        </div>
                        {record.reason && (
                          <div className="mt-1 text-sm text-purple-700">
                            {record.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white p-6 shadow">
              <h2 className="text-2xl font-bold">Store Goals</h2>

              <div className="mt-5 space-y-3">
                {[
                  ["Openers per day", settings.openers_per_day],
                  ["Closers per day", settings.closers_per_day],
                  ["Target hours", settings.target_hours],
                  ["Days off per week", settings.days_off_per_week],
                  ["Saturday-off goal", settings.saturday_off_goal],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                  >
                    <span>{label}</span>
                    <span className="font-bold">{value}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/settings"
                className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50"
              >
                Edit Settings
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Quick Actions</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quickLinks.map(([href, title, description]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-xl bg-white p-5 shadow transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {description}
                  </p>
                  <p className="mt-4 text-sm font-semibold text-blue-600">
                    Open →
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
