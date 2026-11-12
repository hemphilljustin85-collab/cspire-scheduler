// Excel (.xlsx) export laid out like the Schedule page: a block per week with
// the dark day-header row, each person's name and position, coloured shifts,
// an hours badge and daily coverage. Plus a Summary sheet of monthly totals.
// exceljs is loaded only when someone exports, so it doesn't slow the page.

import { shiftColors, type ScheduleSheetData } from "./scheduleSheet";

export async function downloadScheduleExcel({ data, fileName }: { data: ScheduleSheetData; fileName: string }) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Workforce Scheduler";
  workbook.created = new Date();

  const line = (argb: string) => ({ style: "thin" as const, color: { argb } });
  const border = { top: line("FFCBD5E1"), left: line("FFCBD5E1"), bottom: line("FFCBD5E1"), right: line("FFCBD5E1") };
  const solid = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: `FF${hex}` } });
  const dayCount = Math.max(...data.weeks.map((week) => week.days.length), 6);
  const hoursColumn = dayCount + 2;

  // --- Schedule sheet ---
  const sheet = workbook.addWorksheet("Schedule", {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
    },
  });
  sheet.getColumn(1).width = 24;
  for (let column = 2; column <= dayCount + 1; column += 1) sheet.getColumn(column).width = 17;
  sheet.getColumn(hoursColumn).width = 10;

  let rowNumber = 1;
  const title = sheet.getCell(rowNumber, 1);
  title.value = data.title;
  title.font = { bold: true, size: 16 };
  if (data.subtitle) {
    sheet.getCell(rowNumber, hoursColumn).value = data.subtitle;
    sheet.getCell(rowNumber, hoursColumn).alignment = { horizontal: "right" };
    sheet.getCell(rowNumber, hoursColumn).font = { color: { argb: "FF64748B" } };
  }
  rowNumber += 2;

  for (const week of data.weeks) {
    if (data.weeks.length > 1) {
      const label = sheet.getCell(rowNumber, 1);
      label.value = week.status ? `${week.label}  ·  ${week.status}` : week.label;
      label.font = { bold: true, size: 12 };
      rowNumber += 1;
    }

    // Header row: dark, like the app.
    const header = sheet.getRow(rowNumber);
    header.height = week.days.some((day) => day.holiday) ? 58 : week.days.some((day) => day.note) ? 44 : 32;
    header.getCell(1).value = "Employee";
    week.days.forEach((day, index) => {
      // Days from the next/previous month get a lighter header and italic shifts.
      header.getCell(index + 2).value = [day.name, day.dateLabel, day.note].filter(Boolean).join("\n");
      if (!day.inMonth) header.getCell(index + 2).fill = solid("334155");
    });
    header.getCell(hoursColumn).value = "Hours";
    for (let column = 1; column <= hoursColumn; column += 1) {
      const cell = header.getCell(column);
      if (!cell.fill || (cell.fill as { fgColor?: { argb?: string } }).fgColor?.argb !== "FF334155") cell.fill = solid("0F172A");
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: column === 1 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = border;
    }
    week.days.forEach((day, index) => {
      if (day.holiday) header.getCell(index + 2).font = { bold: true, color: { argb: "FFFDE68A" } };
    });
    rowNumber += 1;

    // A row per person.
    for (const person of week.rows) {
      const row = sheet.getRow(rowNumber);
      // Taller when a label needs two lines (e.g. "Thanksgiving (off, paid)").
      row.height = person.cells.some((cell) => cell.label.length > 15) ? 34 : 30;
      row.getCell(1).value = {
        richText: [
          { text: person.name, font: { bold: true, size: 11 } },
          { text: `\n${person.position || "No position"}`, font: { size: 8, color: { argb: "FF64748B" } } },
        ],
      };
      row.getCell(1).alignment = { vertical: "middle", wrapText: true };
      person.cells.forEach((shift, index) => {
        const cell = row.getCell(index + 2);
        cell.value = shift.label;
        const colors = shiftColors(shift.className);
        if (colors) {
          cell.fill = solid(colors.fill);
          cell.font = { bold: true, color: { argb: `FF${colors.text}` }, italic: !week.days[index]?.inMonth };
        }
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      });
      const hours = row.getCell(hoursColumn);
      hours.value = Math.round(person.hours * 100) / 100;
      hours.numFmt = "0.00";
      const hoursColors = shiftColors(person.hoursClassName);
      if (hoursColors) {
        hours.fill = solid(hoursColors.fill);
        hours.font = { bold: true, color: { argb: `FF${hoursColors.text}` } };
      }
      hours.alignment = { horizontal: "center", vertical: "middle" };
      for (let column = 1; column <= hoursColumn; column += 1) row.getCell(column).border = border;
      rowNumber += 1;
    }

    // Daily coverage row.
    const footer = sheet.getRow(rowNumber);
    footer.getCell(1).value = "Daily coverage";
    week.footer.forEach((text, index) => {
      footer.getCell(index + 2).value = text;
    });
    for (let column = 1; column <= hoursColumn; column += 1) {
      const cell = footer.getCell(column);
      cell.fill = solid("F1F5F9");
      cell.font = { bold: true };
      cell.alignment = { horizontal: column === 1 ? "left" : "center" };
      cell.border = border;
    }
    rowNumber += 2;
  }

  // Shift legend.
  if (data.legend.length > 0) {
    sheet.getCell(rowNumber, 1).value = "Shift legend";
    sheet.getCell(rowNumber, 1).font = { bold: true };
    data.legend.forEach((item, index) => {
      const cell = sheet.getCell(rowNumber, index + 2);
      cell.value = item.label;
      const colors = shiftColors(item.className);
      if (colors) {
        cell.fill = solid(colors.fill);
        cell.font = { bold: true, color: { argb: `FF${colors.text}` } };
      }
      cell.alignment = { horizontal: "center", wrapText: true };
    });
  }

  // --- Summary sheet: totals per person for the days in the month (or week) ---
  const summary = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const headers = ["Name", "Position", "Hours", "Days scheduled", "Opens", "Closes", "Saturday closes", "Saturdays off", "PTO days"];
  headers.forEach((text, index) => {
    const cell = summary.getRow(1).getCell(index + 1);
    cell.value = text;
    cell.fill = solid("0F172A");
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });
  const people = data.weeks[0]?.rows ?? [];
  people.forEach((person, index) => {
    const cells = data.weeks.flatMap((week) => {
      const row = week.rows.find((item) => item.id === person.id);
      return row ? row.cells.map((cell, dayIndex) => ({ cell, day: week.days[dayIndex] })).filter(({ day }) => day?.inMonth) : [];
    });
    const saturdays = cells.filter(({ day }) => day.name === "Saturday");
    const values = [
      person.name,
      person.position || "",
      Math.round(cells.reduce((sum, { cell }) => sum + cell.hours, 0) * 100) / 100,
      cells.filter(({ cell }) => cell.working).length,
      cells.filter(({ cell }) => cell.opener).length,
      cells.filter(({ cell }) => cell.closer).length,
      saturdays.filter(({ cell }) => cell.closer).length,
      saturdays.filter(({ cell }) => !cell.working).length,
      cells.filter(({ cell }) => cell.label === "PTO").length,
    ];
    values.forEach((value, column) => {
      const cell = summary.getRow(index + 2).getCell(column + 1);
      cell.value = value;
      cell.border = border;
      if (column > 1) cell.alignment = { horizontal: "center" };
    });
  });
  summary.columns.forEach((column, index) => (column.width = index === 0 ? 22 : index === 1 ? 20 : 13));

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
