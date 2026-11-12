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

/** Printable area of a letter page with 0.25in margins, in CSS pixels (96 per inch). */
const PAGE_PX = { landscape: { width: 1008, height: 768 }, portrait: { width: 768, height: 1008 } };

function fitSheetToPage(orientation: "landscape" | "portrait") {
  const sheet = document.querySelector<HTMLElement>(".print-sheet");
  if (!sheet) return;
  const page = PAGE_PX[orientation];
  // Lay it out off-screen at the page width to measure its height.
  sheet.style.cssText = `display:block;position:absolute;left:-30000px;top:0;visibility:hidden;width:${page.width}px`;
  const height = sheet.scrollHeight;
  sheet.style.cssText = `width:${page.width}px`;
  if (height > page.height) sheet.style.setProperty("zoom", String(Math.max(0.25, (page.height - 6) / height)));
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
    // Once the sheet has rendered, measure it at the page's printable size and
    // scale it down if needed so it always fits on one page, then print.
    const timer = window.setTimeout(() => {
      fitSheetToPage(job.orientation);
      window.print();
    }, 150);
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
              <th key={day} className="border border-slate-700 bg-slate-900 py-1.5 text-white">{day}</th>
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
                  <td key={dayIndex} className="border border-slate-300 p-1 align-top">
                    <div className="text-right font-bold">{date.getDate()}</div>
                    {/* Same coloured shift label as the Schedule page. */}
                    <div
                      className={`mt-1 rounded-lg border border-slate-300 px-1 py-1.5 text-center font-semibold ${cell && cell.label !== "Off" ? cell.className : "bg-slate-100 text-slate-700"}`}
                      style={{ fontSize: "11pt" }}
                    >
                      {cell ? (cell.label === "Off" ? "OFF" : cell.label) : "—"}
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

/**
 * The schedule laid out like the Schedule page (a block per week with day
 * headers, coloured shifts, hours and daily coverage), condensed so a whole
 * month fits on one landscape page.
 */
export function ScheduleSheet({ data, fitToPage = true }: { data: import("../lib/scheduleSheet").ScheduleSheetData; fitToPage?: boolean }) {
  // Landscape letter is about 576pt tall inside the margins. Each week takes
  // its people plus ~3 rows (label, header, coverage); size rows to fit.
  const units = data.weeks.reduce((sum, week) => sum + week.rows.length + 3.4, 0) + 3;
  const rowHeight = fitToPage ? Math.max(9, Math.min(30, 545 / units)) : 30;
  const fontSize = Math.max(5, Math.min(10, rowHeight * 0.42));
  const pad = Math.max(0.5, rowHeight * 0.08);

  return (
    <div className="text-slate-900" style={{ fontSize: `${fontSize}pt`, lineHeight: 1.1 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: `${pad * 2}pt` }}>
        <h1 className="font-bold" style={{ fontSize: `${fontSize + 5}pt` }}>{data.title}</h1>
        {data.subtitle && <span className="text-slate-500">{data.subtitle}</span>}
      </div>

      {data.weeks.map((week) => (
        <div key={week.label} style={{ marginBottom: `${pad * 3}pt`, breakInside: "avoid" }}>
          {data.weeks.length > 1 && (
            <div className="flex items-center gap-2 font-bold" style={{ marginBottom: `${pad}pt` }}>
              {week.label}
              {week.status && (
                <span
                  className={`rounded-full font-semibold ${week.status === "Published" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                  style={{ padding: `0 ${pad * 4}pt`, fontSize: `${fontSize - 1}pt` }}
                >
                  {week.status}
                </span>
              )}
            </div>
          )}
          <table className="w-full table-fixed border-collapse overflow-hidden rounded" style={{ border: "0.5pt solid #cbd5e1" }}>
            <colgroup>
              <col style={{ width: "17%" }} />
              {week.days.map((day) => <col key={day.date} />)}
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-left font-semibold" style={{ padding: `${pad}pt ${pad * 3}pt` }}>Employee</th>
                {week.days.map((day) => (
                  <th key={day.date} className={`text-center font-semibold ${day.inMonth ? "" : "bg-slate-700"}`} style={{ padding: `${pad}pt` }}>
                    <div>{day.name}</div>
                    <div className="font-normal text-slate-300" style={{ fontSize: `${fontSize - 1}pt` }}>
                      {day.dateLabel}
                      {!day.inMonth && " · other month"}
                    </div>
                    {day.note && (
                      <div
                        className={day.holiday ? "mx-auto inline-block rounded-full bg-amber-200 font-semibold text-amber-900" : "font-normal text-slate-300"}
                        style={{ fontSize: `${fontSize - 1}pt`, padding: day.holiday ? `0 ${pad * 3}pt` : undefined }}
                      >
                        {day.note}
                      </div>
                    )}
                  </th>
                ))}
                <th className="text-center font-semibold" style={{ padding: `${pad}pt` }}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {week.rows.map((row) => (
                <tr key={row.id} style={{ height: `${rowHeight}pt`, borderBottom: "0.5pt solid #e2e8f0" }}>
                  <td style={{ padding: `0 ${pad * 3}pt` }}>
                    <div className="truncate font-semibold">{row.name}</div>
                    <div className="truncate text-slate-500" style={{ fontSize: `${fontSize - 1.5}pt` }}>{row.position || "No position"}</div>
                  </td>
                  {row.cells.map((cell, index) => (
                    <td key={week.days[index]?.date ?? index} className={week.days[index]?.inMonth ? "" : "bg-slate-50"} style={{ padding: `${pad}pt` }}>
                      <div
                        className={`truncate rounded text-center font-medium ${cell.className} ${week.days[index]?.inMonth ? "" : "opacity-70"}`}
                        style={{ padding: `${pad * 1.5}pt ${pad}pt`, border: "0.5pt solid #cbd5e1" }}
                      >
                        {cell.label}
                      </div>
                    </td>
                  ))}
                  <td className="text-center" style={{ padding: `${pad}pt` }}>
                    <span className={`inline-block rounded-full font-bold ${row.hoursClassName}`} style={{ padding: `${pad}pt ${pad * 4}pt` }}>
                      {row.hours.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-semibold">
                <td style={{ padding: `${pad}pt ${pad * 3}pt` }}>Daily coverage</td>
                {week.footer.map((text, index) => (
                  <td key={week.days[index]?.date ?? index} className="text-center" style={{ padding: `${pad}pt` }}>{text}</td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {data.legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-bold">Shift legend:</span>
          {data.legend.map((item) => (
            <span key={item.label} className={`rounded-full font-medium ${item.className}`} style={{ padding: `0 ${pad * 4}pt` }}>
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
