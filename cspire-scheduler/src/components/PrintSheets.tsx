"use client";

// Print layouts shared by the Schedule page (managers) and the Team Schedule
// page (employees):
//   - MonthGridSheet: everyone's month on ONE landscape page.
//   - PersonMonthSheet: one person's month as a calendar.
// usePrintSheet() shows a sheet only while printing, so the rest of the app
// (sidebar, buttons) never prints.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PrintCell = {
  /** Full label, e.g. "8:30–5:30" or "Off". */
  label: string;
  /** Up to two short lines for tight spaces, e.g. ["8:30", "5:30"]. */
  short: string[];
  /** Tailwind classes for the shift colour, e.g. "bg-green-100 text-green-800". */
  className: string;
  hours: number;
  working: boolean;
};

export type PrintDay = { date: string; weekday: number };

export type PrintRow = { id: string; name: string; position?: string | null; cells: PrintCell[]; total: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Short "8:30" from "08:30" / "17:30" (12-hour, no am/pm). */
export function shortTime(time: string | null | undefined) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")}` : `${hour12}`;
}

/** Render a sheet only while printing; returns [sheet element, print function]. */
export function usePrintSheet(): [ReactNode, (sheet: ReactNode, orientation?: "landscape" | "portrait") => void] {
  const [job, setJob] = useState<{ sheet: ReactNode; orientation: "landscape" | "portrait" } | null>(null);

  useEffect(() => {
    if (!job) return;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${job.orientation}; margin: 0.25in; }`;
    document.head.appendChild(style);
    document.body.classList.add("printing-sheet");

    const done = () => {
      document.body.classList.remove("printing-sheet");
      style.remove();
      setJob(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    // Give the sheet a moment to render before opening the print dialog.
    const timer = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("printing-sheet");
      style.remove();
    };
  }, [job]);

  return [
    // Rendered straight into <body> so everything else can be hidden while printing.
    job ? createPortal(<div className="print-sheet">{job.sheet}</div>, document.body) : null,
    (sheet, orientation = "landscape") => setJob({ sheet, orientation }),
  ];
}

/** Everyone's schedule for a month (or week) sized to fit one landscape page. */
export function MonthGridSheet({
  title,
  subtitle,
  days,
  rows,
  legend,
}: {
  title: string;
  subtitle?: string;
  days: PrintDay[];
  rows: PrintRow[];
  legend?: Array<{ label: string; className: string }>;
}) {
  // Landscape letter is about 10.5in × 8in inside the margins. Size rows and
  // text from the number of people and days so everything fits on one page.
  const rowHeight = Math.min(36, 520 / (rows.length + 4)); // points
  const fontSize = Math.max(5, Math.min(9, rowHeight * 0.36, 230 / days.length));
  const nameWidth = 92;
  const hoursWidth = 34;

  return (
    <div style={{ fontSize: `${fontSize}pt`, width: "100%" }} className="text-black">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 style={{ fontSize: `${fontSize + 5}pt` }} className="font-bold">{title}</h1>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <table className="w-full table-fixed border-collapse" style={{ lineHeight: 1.05 }}>
        <colgroup>
          <col style={{ width: `${nameWidth}pt` }} />
          {days.map((day) => <col key={day.date} />)}
          <col style={{ width: `${hoursWidth}pt` }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-slate-400 bg-slate-200 px-1 text-left">Name</th>
            {days.map((day) => (
              <th
                key={day.date}
                className={`border border-slate-400 px-0 text-center font-semibold ${day.weekday === 5 ? "bg-slate-300" : "bg-slate-200"}`}
              >
                <div>{WEEKDAYS[day.weekday]}</div>
                <div>{parseDate(day.date).getDate()}</div>
              </th>
            ))}
            <th className="border border-slate-400 bg-slate-200 px-0 text-center">Hrs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ height: `${rowHeight}pt` }}>
              <td className="truncate border border-slate-400 px-1 font-semibold">{row.name}</td>
              {row.cells.map((cell, index) => (
                <td key={days[index]?.date ?? index} className={`border border-slate-400 px-0 text-center ${cell.working || cell.label !== "Off" ? cell.className : ""}`}>
                  {cell.short.map((line, lineIndex) => (
                    <div key={lineIndex} className="whitespace-nowrap">{line}</div>
                  ))}
                </td>
              ))}
              <td className="border border-slate-400 px-0 text-center font-semibold">{row.total.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {legend && legend.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {legend.map((item) => (
            <span key={item.label} className={`rounded px-1 ${item.className}`}>{item.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One person's month as a Monday–Saturday calendar. */
export function PersonMonthSheet({
  storeName,
  name,
  month,
  cellsByDate,
  note,
}: {
  storeName?: string;
  name: string;
  /** "YYYY-MM-01" */
  month: string;
  cellsByDate: Map<string, PrintCell>;
  note?: string;
}) {
  const first = parseDate(month);
  const monthName = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);

  // Weeks (Mon–Sat) covering the month.
  const weeks: Array<Array<Date | null>> = [];
  let week: Array<Date | null> = [];
  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    const weekday = (date.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    if (weekday === 6) continue;
    if (weekday === 0 && week.length) {
      weeks.push(week);
      week = [];
    }
    if (week.length === 0) for (let pad = 0; pad < weekday; pad += 1) week.push(null);
    week.push(new Date(date));
  }
  if (week.length) {
    while (week.length < 6) week.push(null);
    weeks.push(week);
  }

  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const monthCells = Array.from(cellsByDate.entries()).filter(([date]) => date.slice(0, 7) === month.slice(0, 7));
  const totalHours = monthCells.reduce((sum, [, cell]) => sum + cell.hours, 0);
  const daysWorked = monthCells.filter(([, cell]) => cell.working).length;

  return (
    <div className="text-black" style={{ fontSize: "11pt" }}>
      <div className="mb-3 flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          {storeName && <div style={{ fontSize: "10pt" }} className="uppercase tracking-wide">{storeName}</div>}
          <h1 style={{ fontSize: "20pt" }} className="font-bold">{name}</h1>
          <div style={{ fontSize: "14pt" }}>{monthName} schedule</div>
        </div>
        <div className="text-right" style={{ fontSize: "11pt" }}>
          <div><b>{daysWorked}</b> days scheduled</div>
          <div><b>{totalHours.toFixed(2)}</b> hours</div>
        </div>
      </div>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => (
              <th key={day} className="border border-slate-500 bg-slate-200 py-1">{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((days, weekIndex) => (
            <tr key={weekIndex} style={{ height: "1.05in" }}>
              {days.map((date, dayIndex) => {
                if (!date) return <td key={dayIndex} className="border border-slate-500 bg-slate-50" />;
                const cell = cellsByDate.get(iso(date));
                return (
                  <td key={dayIndex} className={`border border-slate-500 p-1 align-top ${cell?.working ? cell.className : ""}`}>
                    <div className="text-right font-bold">{date.getDate()}</div>
                    <div className="mt-1 text-center font-semibold" style={{ fontSize: "12pt" }}>
                      {cell ? cell.label : "—"}
                    </div>
                    {cell?.working && <div className="text-center" style={{ fontSize: "9pt" }}>{cell.hours.toFixed(2)} hrs</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-2" style={{ fontSize: "9pt" }}>{note}</p>}
      <p className="mt-2" style={{ fontSize: "8pt" }}>Printed {new Date().toLocaleDateString()}</p>
    </div>
  );
}
