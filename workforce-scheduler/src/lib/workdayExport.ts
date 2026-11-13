// Schedule export for Workday: one row per shift with the Workday employee ID,
// plus an entry sheet grouped by person for typing shifts into Workday by hand.
// exceljs loads only when someone exports.

import { saveFile } from "./native";

export type WorkdayShiftRow = {
  workdayId: string | null;
  name: string;
  /** yyyy-mm-dd */
  date: string;
  dayName: string;
  /** "Work", "PTO", "Holiday", or "Off". */
  type: "Work" | "PTO" | "Holiday" | "Off";
  /** "HH:MM" 24-hour, or null for PTO/holiday/off. */
  start: string | null;
  end: string | null;
  hours: number;
  shiftLabel: string;
};

function to12Hour(value: string | null): string {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function usDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

export async function downloadWorkdayExport({
  rows,
  title,
  fileName,
}: {
  rows: WorkdayShiftRow[];
  title: string;
  fileName: string;
}) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Workforce Scheduler";
  workbook.created = new Date();
  const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F172A" } };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };

  // --- Sheet 1: one row per shift (for an upload / EIB, or sorting and filtering) ---
  const upload = workbook.addWorksheet("Workday Upload", { views: [{ state: "frozen", ySplit: 1 }] });
  upload.columns = [
    { header: "Employee ID", key: "id", width: 14 },
    { header: "Worker", key: "name", width: 24 },
    { header: "Date", key: "date", width: 12 },
    { header: "Day", key: "day", width: 11 },
    { header: "Start Time", key: "start", width: 11 },
    { header: "End Time", key: "end", width: 11 },
    { header: "Hours", key: "hours", width: 8 },
    { header: "Type", key: "type", width: 10 },
    { header: "Shift", key: "shift", width: 22 },
  ];
  upload.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
  });
  rows
    .filter((row) => row.type !== "Off")
    .forEach((row) => {
      upload.addRow({
        id: row.workdayId ?? "",
        name: row.name,
        date: usDate(row.date),
        day: row.dayName,
        start: to12Hour(row.start),
        end: to12Hour(row.end),
        hours: row.hours,
        type: row.type,
        shift: row.shiftLabel,
      });
    });
  upload.getColumn("hours").numFmt = "0.00";
  upload.autoFilter = { from: "A1", to: "I1" };

  // --- Sheet 2: by person, in the order you'd type it into Workday ---
  const entry = workbook.addWorksheet("Entry Sheet", {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  entry.columns = [
    { key: "date", width: 12 },
    { key: "day", width: 11 },
    { key: "in", width: 11 },
    { key: "out", width: 11 },
    { key: "hours", width: 8 },
    { key: "note", width: 24 },
    { key: "done", width: 9 },
  ];
  const titleCell = entry.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };
  entry.getCell(2, 1).value = "Check off each shift as you enter it in Workday.";
  entry.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };

  const people = new Map<string, WorkdayShiftRow[]>();
  rows.forEach((row) => {
    const key = `${row.name}|${row.workdayId ?? ""}`;
    people.set(key, [...(people.get(key) ?? []), row]);
  });

  let line = 4;
  for (const shifts of people.values()) {
    const person = shifts[0];
    const nameRow = entry.getRow(line);
    nameRow.getCell(1).value = `${person.name}${person.workdayId ? `  ·  Employee ID ${person.workdayId}` : "  ·  no Employee ID"}`;
    nameRow.getCell(1).font = { bold: true, size: 12 };
    line += 1;
    const head = entry.getRow(line);
    ["Date", "Day", "In", "Out", "Hours", "Note", "Entered"].forEach((label, index) => {
      const cell = head.getCell(index + 1);
      cell.value = label;
      cell.fill = headerFill;
      cell.font = headerFont;
    });
    line += 1;
    let total = 0;
    for (const shift of shifts) {
      const row = entry.getRow(line);
      row.getCell(1).value = usDate(shift.date);
      row.getCell(2).value = shift.dayName;
      row.getCell(3).value = shift.type === "Work" ? to12Hour(shift.start) : "";
      row.getCell(4).value = shift.type === "Work" ? to12Hour(shift.end) : "";
      row.getCell(5).value = shift.type === "Off" ? "" : shift.hours;
      row.getCell(5).numFmt = "0.00";
      row.getCell(6).value = shift.type === "Work" ? "" : shift.type === "Off" ? "Off" : shift.shiftLabel;
      row.getCell(7).value = shift.type === "Off" ? "" : "☐";
      if (shift.type === "Off") row.font = { color: { argb: "FF94A3B8" } };
      total += shift.type === "Off" ? 0 : shift.hours;
      line += 1;
    }
    const totalRow = entry.getRow(line);
    totalRow.getCell(4).value = "Total";
    totalRow.getCell(4).font = { bold: true };
    totalRow.getCell(5).value = total;
    totalRow.getCell(5).numFmt = "0.00";
    totalRow.getCell(5).font = { bold: true };
    line += 2;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  await saveFile(fileName, new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
