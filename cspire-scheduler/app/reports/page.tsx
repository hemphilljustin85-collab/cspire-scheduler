"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type ScheduleRecord = {
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
  last_updated: string | null;
};

type PTORecord = {
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

const WORK_DAYS = [
  { name: "Monday", offset: 0 },
  { name: "Tuesday", offset: 1 },
  { name: "Wednesday", offset: 2 },
  { name: "Thursday", offset: 3 },
  { name: "Friday", offset: 4 },
  { name: "Saturday", offset: 5 },
];

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value: string, numberOfDays: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + numberOfDays);
  return formatLocalDate(date);
}

function getMonday(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + difference);
  return formatLocalDate(copy);
}

function displayDate(value: string) {
  return parseLocalDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftLabel(code: string) {
  const labels: Record<string, string> = {
    OFF: "OFF",
    PTO: "PTO",
    HOLIDAY: "Holiday",
    "815-530": "8:15–5:30",
    "830-530": "8:30–5:30",
    "900-600": "9:00–6:00",
    "1030-715": "10:30–7:15",
  };

  return labels[code] || code;
}

function shiftClass(code: string) {
  const classes: Record<string, string> = {
    OFF: "bg-slate-100 text-slate-700",
    PTO: "bg-purple-100 text-purple-800",
    HOLIDAY: "bg-amber-100 text-amber-800",
    "815-530": "bg-green-100 text-green-800",
    "830-530": "bg-emerald-100 text-emerald-800",
    "900-600": "bg-blue-100 text-blue-800",
    "1030-715": "bg-red-100 text-red-800",
  };

  return classes[code] || "bg-slate-100 text-slate-700";
}

export default function ReportsPage() {
  const [weekStart, setWeekStart] = useState(getMonday());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRecord | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [ptoRecords, setPtoRecords] = useState<PTORecord[]>([]);
  const [ruleCount, setRuleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadReport();
  }, [weekStart]);

  async function loadReport() {
    setLoading(true);
    setErrorMessage("");

    const weekEnd = addDays(weekStart, 5);

    const [
      employeeResult,
      scheduleResult,
      metricResult,
      ptoResult,
      ruleResult,
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
          "employee_id, monday_closes, friday_closes, saturday_closes, saturdays_off, current_hours, total_hours, days_off, last_updated",
        ),
      supabase
        .from("employee_time_off")
        .select("employee_id, start_date, end_date, status, reason")
        .eq("status", "Approved")
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart),
      supabase
        .from("ai_rules")
        .select("id", { count: "exact", head: true }),
    ]);

    const firstError =
      employeeResult.error ||
      scheduleResult.error ||
      metricResult.error ||
      ptoResult.error ||
      ruleResult.error;

    if (firstError) {
      setErrorMessage(firstError.message);
      setLoading(false);
      return;
    }

    const employeeData = (employeeResult.data as Employee[]) || [];
    setEmployees(employeeData);
    setMetrics((metricResult.data as Metric[]) || []);
    setPtoRecords((ptoResult.data as PTORecord[]) || []);
    setRuleCount(ruleResult.count || 0);

    if (!scheduleResult.data) {
      setSchedule(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    const scheduleData = scheduleResult.data as ScheduleRecord;
    setSchedule(scheduleData);

    const { data: entryData, error: entryError } = await supabase
      .from("schedule_entries")
      .select("employee_id, shift_date, shift_code, hours")
      .eq("schedule_id", scheduleData.id);

    if (entryError) {
      setErrorMessage(entryError.message);
      setLoading(false);
      return;
    }

    setEntries((entryData as ScheduleEntry[]) || []);
    setLoading(false);
  }

  function moveWeek(days: number) {
    setWeekStart(addDays(weekStart, days));
  }

  function getEntry(employeeId: string, offset: number) {
    const date = addDays(weekStart, offset);

    return entries.find(
      (entry) =>
        entry.employee_id === employeeId &&
        entry.shift_date === date,
    );
  }

  const reportRows = useMemo(() => {
    return employees.map((employee) => {
      const employeeEntries = entries.filter(
        (entry) => entry.employee_id === employee.id,
      );
      const metric = metrics.find(
        (item) => item.employee_id === employee.id,
      );

      return {
        employee,
        metric,
        hours: employeeEntries.reduce(
          (sum, entry) => sum + Number(entry.hours || 0),
          0,
        ),
      };
    });
  }, [employees, entries, metrics]);

  const summary = useMemo(() => {
    const totalHours = reportRows.reduce(
      (sum, row) => sum + row.hours,
      0,
    );

    const scheduledEmployees = reportRows.filter((row) =>
      entries.some((entry) => entry.employee_id === row.employee.id),
    ).length;

    return {
      totalEmployees: employees.length,
      scheduledEmployees,
      totalHours,
      approvedPTO: ptoRecords.length,
      activeRules: ruleCount,
    };
  }, [reportRows, employees, entries, ptoRecords, ruleCount]);

  function fairnessStatus(metric?: Metric) {
    if (!metric) return "No metrics";

    if (Number(metric.current_hours || 0) > 40) {
      return "Over 40 hours";
    }

    if (Number(metric.current_hours || 0) < 35) {
      return "Low hours";
    }

    if (
      Number(metric.saturday_closes || 0) > 0 &&
      Number(metric.saturdays_off || 0) === 0
    ) {
      return "Needs Saturday off";
    }

    return "Balanced";
  }

  function printReport() {
    window.print();
  }

  function exportCsv() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Employee", "Employee ID", ...WORK_DAYS.map((day) => day.name), "Weekly Hours"],
      ...reportRows.map((row) => [
        row.employee.employee_name,
        row.employee.employee_id || "",
        ...WORK_DAYS.map((day) => getEntry(row.employee.id, day.offset)?.shift_code || "OFF"),
        row.hours.toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${weekStart}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Reports</h1>
          <p className="mt-1 text-slate-600">
            Review and print weekly schedules, hours, PTO, and fairness.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => moveWeek(-7)}
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
            onClick={() => moveWeek(7)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Next Week
          </button>

          <button
            type="button"
            onClick={printReport}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Print Report
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!schedule}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="no-print rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">Reports error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading report...
        </div>
      ) : (
        <>
          <div className="print-header hidden">
            <h1 className="text-3xl font-bold">Workforce Schedule Report</h1>
            <p className="mt-1">
              Week of {displayDate(weekStart)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl bg-white p-5 shadow">
              <div className="text-sm text-slate-500">Active Employees</div>
              <div className="mt-1 text-3xl font-bold">
                {summary.totalEmployees}
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow">
              <div className="text-sm text-slate-500">Scheduled Employees</div>
              <div className="mt-1 text-3xl font-bold">
                {summary.scheduledEmployees}
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow">
              <div className="text-sm text-slate-500">Total Scheduled Hours</div>
              <div className="mt-1 text-3xl font-bold">
                {summary.totalHours.toFixed(2)}
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow">
              <div className="text-sm text-slate-500">Approved PTO</div>
              <div className="mt-1 text-3xl font-bold">
                {summary.approvedPTO}
              </div>
            </div>

            <div className="rounded-xl bg-white p-5 shadow">
              <div className="text-sm text-slate-500">Active Rules</div>
              <div className="mt-1 text-3xl font-bold">
                {summary.activeRules}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">Weekly Schedule</h2>
                <p className="text-sm text-slate-500">
                  Week of {displayDate(weekStart)}
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                Status: {schedule?.status || "No schedule"}
              </span>
            </div>

            {!schedule ? (
              <div className="mt-5 rounded-lg bg-amber-50 p-4 text-amber-800">
                No saved schedule was found for this week.
              </div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-[1100px] w-full border-collapse">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-3 text-left">Employee</th>
                      {WORK_DAYS.map((day) => (
                        <th key={day.name} className="p-3 text-center">
                          <div>{day.name}</div>
                          <div className="text-xs font-normal text-slate-300">
                            {displayDate(addDays(weekStart, day.offset))}
                          </div>
                        </th>
                      ))}
                      <th className="p-3 text-center">Hours</th>
                    </tr>
                  </thead>

                  <tbody>
                    {reportRows.map((row) => (
                      <tr
                        key={row.employee.id}
                        className="border-b border-slate-200"
                      >
                        <td className="p-3">
                          <div className="font-semibold">
                            {row.employee.employee_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.employee.position || "No position"}
                          </div>
                        </td>

                        {WORK_DAYS.map((day) => {
                          const entry = getEntry(
                            row.employee.id,
                            day.offset,
                          );
                          const code = entry?.shift_code || "OFF";

                          return (
                            <td key={day.name} className="p-2 text-center">
                              <span
                                className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${shiftClass(
                                  code,
                                )}`}
                              >
                                {shiftLabel(code)}
                              </span>
                            </td>
                          );
                        })}

                        <td className="p-3 text-center font-bold">
                          {row.hours.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white p-5 shadow">
            <h2 className="text-2xl font-bold">Hours and Fairness Summary</h2>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[950px] w-full border-collapse">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-center">Hours</th>
                    <th className="p-3 text-center">Days Off</th>
                    <th className="p-3 text-center">Monday Closes</th>
                    <th className="p-3 text-center">Friday Closes</th>
                    <th className="p-3 text-center">Saturday Closes</th>
                    <th className="p-3 text-center">Saturdays Off</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {reportRows.map((row) => (
                    <tr
                      key={row.employee.id}
                      className="border-b border-slate-200"
                    >
                      <td className="p-3">
                        <div className="font-semibold">
                          {row.employee.employee_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.employee.employee_id
                            ? `ID: ${row.employee.employee_id}`
                            : row.employee.position || ""}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {row.hours.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        {row.metric?.days_off ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        {row.metric?.monday_closes ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        {row.metric?.friday_closes ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        {row.metric?.saturday_closes ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        {row.metric?.saturdays_off ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        {fairnessStatus(row.metric)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl bg-white p-5 shadow">
              <h2 className="text-2xl font-bold">PTO Summary</h2>

              {ptoRecords.length === 0 ? (
                <p className="mt-4 text-slate-500">
                  No approved PTO overlaps this week.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {ptoRecords.map((record, index) => {
                    const employee = employees.find(
                      (item) => item.id === record.employee_id,
                    );

                    return (
                      <div
                        key={`${record.employee_id}-${record.start_date}-${index}`}
                        className="rounded-lg bg-purple-50 p-3"
                      >
                        <div className="font-semibold text-purple-900">
                          {employee?.employee_name || "Unknown employee"}
                        </div>
                        <div className="text-sm text-purple-800">
                          {displayDate(record.start_date)} through{" "}
                          {displayDate(record.end_date)}
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

            <div className="rounded-xl bg-white p-5 shadow">
              <h2 className="text-2xl font-bold">Report Health</h2>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>Schedule available</span>
                  <span className="font-semibold">
                    {schedule ? "Yes" : "No"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>Metrics available</span>
                  <span className="font-semibold">
                    {metrics.length > 0 ? "Yes" : "No"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>PTO tracking</span>
                  <span className="font-semibold">Enabled</span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <span>Rules loaded</span>
                  <span className="font-semibold">{ruleCount}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .print-header {
            display: block !important;
            margin-bottom: 20px;
          }

          aside {
            display: none !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
          }

          .shadow {
            box-shadow: none !important;
          }

          table {
            font-size: 10px !important;
          }

          @page {
            size: landscape;
            margin: 0.4in;
          }
        }
      `}</style>
    </div>
  );
}
