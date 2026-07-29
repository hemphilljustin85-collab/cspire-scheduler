"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { downloadCsv } from "../../src/lib/csv";

type Employee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  position: string | null;
  status: string | null;
};

type Metric = {
  id: string;
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

type MetricRow = Metric & {
  employee?: Employee;
};

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MetricsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const [employeeResult, metricResult] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_name, employee_id, position, status")
        .order("employee_name"),
      supabase
        .from("schedule_metrics")
        .select(
          "id, employee_id, monday_closes, friday_closes, saturday_closes, saturdays_off, current_hours, total_hours, days_off, last_updated",
        ),
    ]);

    if (employeeResult.error) {
      setErrorMessage(employeeResult.error.message);
      setLoading(false);
      return;
    }

    if (metricResult.error) {
      setErrorMessage(metricResult.error.message);
      setLoading(false);
      return;
    }

    setEmployees((employeeResult.data as Employee[]) || []);
    setMetrics((metricResult.data as Metric[]) || []);
    setLoading(false);
  }

  const rows = useMemo<MetricRow[]>(() => {
    return metrics
      .map((metric) => ({
        ...metric,
        employee: employees.find(
          (employee) => employee.id === metric.employee_id,
        ),
      }))
      .sort((a, b) =>
        (a.employee?.employee_name || "").localeCompare(
          b.employee?.employee_name || "",
        ),
      );
  }, [employees, metrics]);

  const summary = useMemo(() => {
    if (rows.length === 0) {
      return {
        averageHours: 0,
        totalMondayCloses: 0,
        totalFridayCloses: 0,
        totalSaturdayCloses: 0,
        totalSaturdaysOff: 0,
      };
    }

    return {
      averageHours:
        rows.reduce(
          (sum, row) => sum + Number(row.current_hours || 0),
          0,
        ) / rows.length,
      totalMondayCloses: rows.reduce(
        (sum, row) => sum + Number(row.monday_closes || 0),
        0,
      ),
      totalFridayCloses: rows.reduce(
        (sum, row) => sum + Number(row.friday_closes || 0),
        0,
      ),
      totalSaturdayCloses: rows.reduce(
        (sum, row) => sum + Number(row.saturday_closes || 0),
        0,
      ),
      totalSaturdaysOff: rows.reduce(
        (sum, row) => sum + Number(row.saturdays_off || 0),
        0,
      ),
    };
  }, [rows]);

  function fairnessStatus(row: MetricRow) {
    const closes =
      Number(row.monday_closes || 0) +
      Number(row.friday_closes || 0) +
      Number(row.saturday_closes || 0);

    if (Number(row.current_hours || 0) > 40) {
      return {
        label: "Over 40 hrs",
        className: "bg-red-100 text-red-800",
      };
    }

    if (Number(row.current_hours || 0) < 35) {
      return {
        label: "Low hours",
        className: "bg-amber-100 text-amber-800",
      };
    }

    if (closes >= 8 && Number(row.saturdays_off || 0) === 0) {
      return {
        label: "Needs Saturday off",
        className: "bg-orange-100 text-orange-800",
      };
    }

    return {
      label: "Balanced",
      className: "bg-green-100 text-green-800",
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Metrics</h1>
          <p className="mt-1 text-slate-600">
            Track hours, closing shifts, days off, and schedule fairness.
          </p>
        </div>

        <div className="flex gap-2">
        <button type="button" onClick={() => downloadCsv("metrics.csv", [
          ["Employee","Current Hours","Total Hours","Days Off","Monday Closes","Friday Closes","Saturday Closes","Saturdays Off"],
          ...metrics.map((metric) => [employees.find((employee)=>employee.id===metric.employee_id)?.employee_name || "Employee",metric.current_hours,metric.total_hours,metric.days_off,metric.monday_closes,metric.friday_closes,metric.saturday_closes,metric.saturdays_off]),
        ])} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">Export CSV</button>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
        >
          Refresh Metrics
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
          <p className="font-semibold">Metrics error</p>
          <p className="mt-1 text-sm">{errorMessage}</p>

          {errorMessage.toLowerCase().includes("row-level security") && (
            <p className="mt-2 text-sm">
              Supabase RLS is blocking this page. The schedule_metrics table
              needs a select policy.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Average hours</div>
          <div className="mt-1 text-3xl font-bold">
            {summary.averageHours.toFixed(2)}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Monday closes</div>
          <div className="mt-1 text-3xl font-bold">
            {summary.totalMondayCloses}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Friday closes</div>
          <div className="mt-1 text-3xl font-bold">
            {summary.totalFridayCloses}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Saturday closes</div>
          <div className="mt-1 text-3xl font-bold">
            {summary.totalSaturdayCloses}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <div className="text-sm text-slate-500">Saturdays off</div>
          <div className="mt-1 text-3xl font-bold">
            {summary.totalSaturdaysOff}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl bg-white p-6 shadow">
          Loading metrics...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center shadow">
          No schedule metrics were found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow">
          <table className="min-w-[1100px] w-full border-collapse">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="p-4 text-left">Employee</th>
                <th className="p-4 text-center">Current Hours</th>
                <th className="p-4 text-center">Total Hours</th>
                <th className="p-4 text-center">Days Off</th>
                <th className="p-4 text-center">Monday Closes</th>
                <th className="p-4 text-center">Friday Closes</th>
                <th className="p-4 text-center">Saturday Closes</th>
                <th className="p-4 text-center">Saturdays Off</th>
                <th className="p-4 text-center">Fairness</th>
                <th className="p-4 text-left">Last Updated</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const status = fairnessStatus(row);

                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="p-4">
                      <div className="font-semibold">
                        {row.employee?.employee_name || "Unknown employee"}
                      </div>

                      <div className="text-xs text-slate-500">
                        {row.employee?.employee_id
                          ? `ID: ${row.employee.employee_id}`
                          : row.employee_id}
                      </div>

                      {row.employee?.position && (
                        <div className="text-xs text-slate-500">
                          {row.employee.position}
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex min-w-16 justify-center rounded-full px-3 py-1 font-semibold ${
                          Number(row.current_hours || 0) > 40
                            ? "bg-red-100 text-red-800"
                            : Number(row.current_hours || 0) >= 38
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {Number(row.current_hours || 0).toFixed(2)}
                      </span>
                    </td>

                    <td className="p-4 text-center">
                      {Number(row.total_hours || 0).toFixed(2)}
                    </td>

                    <td className="p-4 text-center">
                      {row.days_off || 0}
                    </td>

                    <td className="p-4 text-center">
                      {row.monday_closes || 0}
                    </td>

                    <td className="p-4 text-center">
                      {row.friday_closes || 0}
                    </td>

                    <td className="p-4 text-center">
                      {row.saturday_closes || 0}
                    </td>

                    <td className="p-4 text-center">
                      {row.saturdays_off || 0}
                    </td>

                    <td className="p-4 text-center">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>

                    <td className="p-4 text-sm text-slate-600">
                      {formatDateTime(row.last_updated)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        Metrics currently come from the schedule_metrics table. The next step
        is updating these values automatically whenever a schedule is saved.
      </div>
    </div>
  );
}
