// Excel (.xlsx) export of the schedule on screen.
// exceljs is loaded only when someone exports, so it doesn't slow down the page.

export type ExcelCell = { label: string; className: string; hours: number; working: boolean; opener: boolean; closer: boolean };
export type ExcelDay = { date: string; weekday: number; weekIndex: number };
export type ExcelRow = { name: string; position?: string | null; cells: ExcelCell[] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Tailwind -100 background colours used for shifts, as Excel fills.
const FILLS: Record<string, string> = {
  slate: "F1F5F9", gray: "F3F4F6", zinc: "F4F4F5", red: "FEE2E2", orange: "FFEDD5", amber: "FEF3C7",
  yellow: "FEF9C3", lime: "ECFCCB", green: "DCFCE7", emerald: "D1FAE5", teal: "CCFBF1", cyan: "CFFAFE",
  sky: "E0F2FE", blue: "DBEAFE", indigo: "E0E7FF", violet: "EDE9FE", purple: "F3E8FF", fuchsia: "FAE8FF",
  pink: "FCE7F3", rose: "FFE4E6",
};

function fillFor(className: string) {
  const match = className.match(/bg-([a-z]+)-\d+/);
  return match ? FILLS[match[1]] : undefined;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shortDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export async function downloadScheduleExcel({
  title,
  fileName,
  days,
  weekStarts,
  rows,
}: {
  title: string;
  fileName: string;
  days: ExcelDay[];
  weekStarts: string[];
  rows: ExcelRow[];
}) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Workforce Scheduler";
  workbook.created = new Date();

  const thin = { style: "thin" as const, color: { argb: "FF94A3B8" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const header = (cell: import("exceljs").Cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  };
  const weeksShown = weekStarts.map((_, index) => index).filter((index) => days.some((day) => day.weekIndex === index));

  // --- Schedule sheet: one row per person, one column per day ---
  const sheet = workbook.addWorksheet("Schedule", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  const dayColumn = (index: number) => 3 + index;
  const weekColumn = (position: number) => 3 + days.length + position;
  const totalColumn = 3 + days.length + weeksShown.length;

  const headerRow = sheet.getRow(3);
  headerRow.getCell(1).value = "Name";
  headerRow.getCell(2).value = "Position";
  days.forEach((day, index) => {
    headerRow.getCell(dayColumn(index)).value = `${WEEKDAYS[day.weekday]}\n${shortDate(day.date)}`;
  });
  weeksShown.forEach((weekIndex, position) => {
    headerRow.getCell(weekColumn(position)).value = `Hours\nwk of ${shortDate(weekStarts[weekIndex])}`;
  });
  headerRow.getCell(totalColumn).value = "Total\nhours";
  headerRow.height = 30;
  for (let column = 1; column <= totalColumn; column += 1) header(headerRow.getCell(column));

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(4 + rowIndex);
    excelRow.getCell(1).value = row.name;
    excelRow.getCell(1).font = { bold: true };
    excelRow.getCell(2).value = row.position || "";
    row.cells.forEach((cell, index) => {
      const target = excelRow.getCell(dayColumn(index));
      target.value = cell.label === "Off" ? "Off" : cell.label;
      const fill = cell.label === "Off" ? undefined : fillFor(cell.className);
      if (fill) target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${fill}` } };
      if (cell.label === "Off") target.font = { color: { argb: "FF94A3B8" } };
      target.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    weeksShown.forEach((weekIndex, position) => {
      const hours = row.cells.reduce((sum, cell, index) => (days[index].weekIndex === weekIndex ? sum + cell.hours : sum), 0);
      excelRow.getCell(weekColumn(position)).value = Math.round(hours * 100) / 100;
    });
    excelRow.getCell(totalColumn).value = Math.round(row.cells.reduce((sum, cell) => sum + cell.hours, 0) * 100) / 100;
    excelRow.getCell(totalColumn).font = { bold: true };
    for (let column = 1; column <= totalColumn; column += 1) excelRow.getCell(column).border = border;
  });

  // Coverage rows under the schedule.
  const coverageStart = 4 + rows.length + 1;
  [
    { label: "Openers", test: (cell: ExcelCell) => cell.opener },
    { label: "Closers", test: (cell: ExcelCell) => cell.closer },
    { label: "Working", test: (cell: ExcelCell) => cell.working },
  ].forEach((measure, index) => {
    const excelRow = sheet.getRow(coverageStart + index);
    excelRow.getCell(1).value = measure.label;
    excelRow.getCell(1).font = { bold: true, italic: true };
    days.forEach((_, dayIndex) => {
      const cell = excelRow.getCell(dayColumn(dayIndex));
      cell.value = rows.filter((row) => measure.test(row.cells[dayIndex])).length;
      cell.alignment = { horizontal: "center" };
      cell.font = { italic: true };
    });
  });

  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 14;
  days.forEach((_, index) => (sheet.getColumn(dayColumn(index)).width = 11));
  weeksShown.forEach((_, position) => (sheet.getColumn(weekColumn(position)).width = 11));
  sheet.getColumn(totalColumn).width = 9;

  // --- Summary sheet: totals per person ---
  const summary = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  const summaryHeaders = ["Name", "Position", "Total hours", "Days scheduled", "Opens", "Closes", "Saturday closes", "Saturdays off", "PTO days"];
  summaryHeaders.forEach((text, index) => {
    const cell = summary.getRow(1).getCell(index + 1);
    cell.value = text;
    header(cell);
  });
  rows.forEach((row, rowIndex) => {
    const saturdays = row.cells.filter((_, index) => days[index].weekday === 5);
    const values = [
      row.name,
      row.position || "",
      Math.round(row.cells.reduce((sum, cell) => sum + cell.hours, 0) * 100) / 100,
      row.cells.filter((cell) => cell.working).length,
      row.cells.filter((cell) => cell.opener).length,
      row.cells.filter((cell) => cell.closer).length,
      saturdays.filter((cell) => cell.closer).length,
      saturdays.filter((cell) => !cell.working).length,
      row.cells.filter((cell) => cell.label === "PTO").length,
    ];
    values.forEach((value, index) => {
      const cell = summary.getRow(2 + rowIndex).getCell(index + 1);
      cell.value = value;
      cell.border = border;
    });
  });
  summary.columns.forEach((column, index) => (column.width = index === 0 ? 22 : 15));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
