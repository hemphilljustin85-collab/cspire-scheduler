"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";

type Employee = {
  id: string;
  employee_name: string;
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

const WORK_DAYS = [
  { name: "Monday", offset: 0 },
  { name: "Tuesday", offset: 1 },
  { name: "Wednesday", offset: 2 },
  { name: "Thursday", offset: 3 },
  { name: "Friday", offset: 4 },
  { name: "Saturday", offset: 5 },
];

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

export default function TeamSchedulePage() {
  const [weekStart, setWeekStart] = useState(getMonday());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedWeek = params.get("week");

    if (requestedWeek) {
      setWeekStart(requestedWeek);
    }
  }, []);

  useEffect(() => {
    void loadPublishedSchedule();
  }, [weekStart]);

  async function loadPublishedSchedule() {
    setLoading(true);
    setErrorMessage("");

    const [employeeResult, scheduleResult] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_name, position, status")
        .or("status.eq.Active,status.is.null")
        .order("employee_name"),
      supabase
        .from("schedules")
        .select("id, week_start, status")
        .eq("week_start", weekStart)
        .eq("status", "Published")
        .maybeSingle(),
    ]);

    if (employeeResult.error || scheduleResult.error) {
      setErrorMessage(
        employeeResult.error?.message ||
          scheduleResult.error?.message ||
          "Unable to load the published schedule.",
      );
      setLoading(false);
      return;
    }

    setEmployees((employeeResult.data as Employee[]) || []);

    if (!scheduleResult.data) {
      setSchedule(null);
      setEntries([]);
      setLoading(false);
      return;
    }

    const publishedSchedule = scheduleResult.data as Schedule;
    setSchedule(publishedSchedule);

    const { data, error } = await supabase
      .from("schedule_entries")
      .select("employee_id, shift_date, shift_code, hours")
      .eq("schedule_id", publishedSchedule.id);

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setEntries((data as ScheduleEntry[]) || []);
    setLoading(false);
  }

  function moveWeek(days: number) {
    const nextWeek = addDays(weekStart, days);
    setWeekStart(nextWeek);
    window.history.replaceState(
      null,
      "",
      `/team-schedule?week=${nextWeek}`,
    );
  }

  function getEntry(employeeId: string, offset: number) {
    const date = addDays(weekStart, offset);

    return entries.find(
      (entry) =>
        entry.employee_id === employeeId &&
        entry.shift_date === date,
    );
  }

  const employeeHours = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const employee of employees) {
      totals[employee.id] = entries
        .filter((entry) => entry.employee_id === employee.id)
        .reduce(
          (sum, entry) => sum + Number(entry.hours || 0),
          0,
        );
    }

    return totals;
  }, [employees, entries]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-xl bg-white p-5 shadow">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                Magee Store
              </p>
              <h1 className="mt-1 text-3xl font-bold">
                Team Schedule
              </h1>
              <p className="mt-1 text-slate-600">
                Published schedule for the week of{" "}
                {prettyDate(weekStart)}.
              </p>
            </div>

            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => moveWeek(-7)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
              >
                Previous Week
              </button>

              <button
                type="button"
                onClick={() => moveWeek(7)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
              >
                Next Week
              </button>

              <button
                type="button"
                onClick={async () => {
                  const shareData = {
                    title: "Magee Store Team Schedule",
                    text: `Published schedule for the week of ${prettyDate(weekStart)}.`,
                    url: window.location.href,
                  };

                  if (navigator.share) {
                    await navigator.share(shareData);
                  } else {
                    await navigator.clipboard.writeText(window.location.href);
                    window.alert("Schedule link copied to your clipboard.");
                  }
                }}
                className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-medium text-blue-700 hover:bg-blue-50"
              >
                Share
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl bg-white p-6 shadow">
            Loading published schedule...
          </div>
        ) : !schedule ? (
          <div className="rounded-xl bg-white p-8 text-center shadow">
            <h2 className="text-2xl font-bold">
              No published schedule
            </h2>
            <p className="mt-2 text-slate-600">
              A manager has not published a schedule for this week yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow">
            <table className="min-w-[1100px] w-full border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-20 min-w-52 bg-slate-900 p-3 text-left">
                    Employee
                  </th>

                  {WORK_DAYS.map((day) => (
                    <th
                      key={day.name}
                      className="min-w-36 p-3 text-center"
                    >
                      <div>{day.name}</div>
                      <div className="text-xs font-normal text-slate-300">
                        {prettyDate(addDays(weekStart, day.offset))}
                      </div>
                    </th>
                  ))}

                  <th className="min-w-24 p-3 text-center">
                    Hours
                  </th>
                </tr>
              </thead>

              <tbody>
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-slate-200"
                  >
                    <td className="sticky left-0 z-10 bg-white p-3">
                      <div className="font-semibold">
                        {employee.employee_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {employee.position || "Team Member"}
                      </div>
                    </td>

                    {WORK_DAYS.map((day) => {
                      const entry = getEntry(
                        employee.id,
                        day.offset,
                      );
                      const code = entry?.shift_code || "OFF";

                      return (
                        <td
                          key={day.name}
                          className="p-2 text-center"
                        >
                          <span
                            className={`inline-flex rounded-md px-3 py-2 text-sm font-semibold ${shiftClass(
                              code,
                            )}`}
                          >
                            {shiftLabel(code)}
                          </span>
                        </td>
                      );
                    })}

                    <td className="p-3 text-center font-bold">
                      {(employeeHours[employee.id] || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .shadow {
            box-shadow: none !important;
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
