// Bring the team in from a Workday worker report (Excel or CSV).
// Workday reports vary by company, so columns are found by their headings
// (e.g. "Worker", "Employee ID", "Business Title", "Work Email"), and title rows
// above the heading row are skipped.

export type WorkdayField = "name" | "firstName" | "lastName" | "employeeId" | "position" | "email" | "phone" | "status" | "hireDate";

export type WorkdayWorker = {
  /** Row number in the file (1-based), for messages. */
  row: number;
  name: string;
  employeeId: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  /** "Active" or "Inactive". */
  status: "Active" | "Inactive";
  hireDate: string | null;
};

export type ParsedReport = {
  workers: WorkdayWorker[];
  /** Which heading was used for each field, e.g. { name: "Worker", employeeId: "Employee ID" }. */
  columns: Partial<Record<WorkdayField, string>>;
  skipped: number;
};

const HEADINGS: Record<WorkdayField, string[]> = {
  name: ["worker", "name", "employee", "employee name", "worker name", "full name", "legal name", "preferred name", "associate", "team member"],
  firstName: ["first name", "preferred first name", "legal first name", "given name"],
  lastName: ["last name", "preferred last name", "legal last name", "family name", "surname"],
  employeeId: ["employee id", "worker id", "employee number", "employee #", "emp id", "id", "associate id", "worker number"],
  position: ["business title", "job title", "position", "position title", "job profile", "job", "title", "job profile name"],
  email: ["work email", "email", "email - work", "primary work email", "email address", "e-mail"],
  phone: ["mobile", "mobile phone", "phone - mobile", "work phone", "phone", "primary work phone", "phone - work", "cell", "cell phone", "phone number"],
  status: ["status", "worker status", "employment status", "active status", "active"],
  hireDate: ["hire date", "original hire date", "start date", "continuous service date"],
};

const normalize = (value: string) => value.toLowerCase().replace(/[_\s]+/g, " ").replace(/[:*]/g, "").trim();

/** Which field a heading is, or null. Exact names first, then "contains" (e.g. "Worker's Business Title"). */
function fieldFor(heading: string): WorkdayField | null {
  const text = normalize(heading);
  if (!text) return null;
  for (const [field, names] of Object.entries(HEADINGS) as Array<[WorkdayField, string[]]>) {
    if (names.includes(text)) return field;
  }
  const contains: Array<[WorkdayField, RegExp]> = [
    ["employeeId", /\b(employee|worker|associate) (id|number|#)\b/],
    ["firstName", /\bfirst name\b/],
    ["lastName", /\blast name\b/],
    ["email", /e-?mail/],
    ["phone", /\b(phone|mobile|cell)\b/],
    ["hireDate", /\bhire date\b/],
    ["position", /\b(business title|job title|job profile|position)\b/],
    ["status", /\bstatus\b/],
    ["name", /\b(worker|employee|name)\b/],
  ];
  return contains.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Minimal CSV reader: quoted fields, commas, new lines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const object = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string };
    if (Array.isArray(object.richText)) return object.richText.map((part) => part.text).join("");
    if (object.text !== undefined) return cellText(object.text);
    if (object.result !== undefined) return cellText(object.result);
    return "";
  }
  return String(value);
}

/** Read the first sheet of an .xlsx (or a .csv) into rows of text. */
export async function readReportFile(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(await file.text());
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files can't be read. In Workday, export the report to Excel (.xlsx) or CSV.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets.find((item) => item.actualRowCount > 1) ?? workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) values.push(cellText(row.getCell(column).value).trim());
    rows.push(values);
  });
  return rows;
}

function toIsoDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/** "Hemphill, Justin" → "Justin Hemphill"; "Justin Hemphill (123456)" → name + id. */
function splitWorker(value: string): { name: string; id: string | null } {
  let name = value.trim();
  let id: string | null = null;
  const withId = name.match(/^(.*?)\s*\((\w[\w-]*)\)\s*$/);
  if (withId && /\d/.test(withId[2])) { name = withId[1].trim(); id = withId[2]; }
  const lastFirst = name.match(/^([^,]+),\s*(.+)$/);
  if (lastFirst) name = `${lastFirst[2].trim()} ${lastFirst[1].trim()}`;
  return { name: name.replace(/\s+/g, " "), id };
}

export function parseWorkdayRows(rows: string[][]): ParsedReport {
  // The heading row is the first one (in the top 15) that has a name column.
  let headerIndex = -1;
  let fields: Array<WorkdayField | null> = [];
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const candidate = rows[index].map(fieldFor);
    const hasName = candidate.includes("name") || (candidate.includes("firstName") && candidate.includes("lastName"));
    if (hasName && candidate.filter(Boolean).length >= 2) { headerIndex = index; fields = candidate; break; }
  }
  if (headerIndex < 0) {
    throw new Error("Couldn't find the heading row. The report needs a column like \"Worker\" or \"Name\" (or First Name and Last Name), plus things like Employee ID or Business Title.");
  }

  // Use the first column found for each field.
  const columnOf: Partial<Record<WorkdayField, number>> = {};
  const columns: Partial<Record<WorkdayField, string>> = {};
  fields.forEach((field, column) => {
    if (field && columnOf[field] === undefined) {
      columnOf[field] = column;
      columns[field] = rows[headerIndex][column];
    }
  });
  const workers: WorkdayWorker[] = [];
  let skipped = 0;
  const at = (row: string[], field: WorkdayField) => (columnOf[field] === undefined ? "" : (row[columnOf[field]!] ?? "").trim());

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (row.every((value) => !String(value).trim())) return;
    const split = splitWorker(at(row, "name"));
    const id = split.id;
    let name = split.name;
    if (!name) name = [at(row, "firstName"), at(row, "lastName")].filter(Boolean).join(" ");
    if (!name || /^(total|count|grand total)\b/i.test(name)) { skipped += 1; return; }
    const statusText = at(row, "status").toLowerCase();
    const inactive = /terminat|inactive|separat|no$|^false$|^n$/.test(statusText);
    const phoneDigits = at(row, "phone").replace(/[^\d+]/g, "");
    workers.push({
      row: headerIndex + offset + 2,
      name,
      employeeId: at(row, "employeeId") || id,
      position: at(row, "position") || null,
      email: at(row, "email") || null,
      phone: phoneDigits.length >= 7 ? at(row, "phone") : null,
      status: inactive ? "Inactive" : "Active",
      hireDate: toIsoDate(at(row, "hireDate")),
    });
  });

  return { workers, columns, skipped };
}

export type ExistingEmployee = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  email: string | null;
};

/**
 * Best existing match for a Workday worker: same employee ID, then same email,
 * then same full name, then a unique first-name / nickname match ("Sed" for
 * "Sedrick Jones"). Returns the employee's id or null.
 */
export function matchWorker(worker: WorkdayWorker, existing: ExistingEmployee[], taken: Set<string>): string | null {
  const free = existing.filter((employee) => !taken.has(employee.id));
  const lower = (value: string | null | undefined) => (value || "").trim().toLowerCase();
  if (worker.employeeId) {
    const byId = free.find((employee) => lower(employee.employee_id) === lower(worker.employeeId));
    if (byId) return byId.id;
  }
  if (worker.email) {
    const byEmail = free.find((employee) => lower(employee.email) === lower(worker.email));
    if (byEmail) return byEmail.id;
  }
  const full = lower(worker.name);
  const byName = free.filter((employee) => lower(employee.employee_name) === full);
  if (byName.length === 1) return byName[0].id;

  const first = full.split(" ")[0];
  const last = full.split(" ").at(-1) ?? "";
  const loose = free.filter((employee) => {
    const name = lower(employee.employee_name);
    const parts = name.split(" ");
    if (parts.length > 1) return parts[0] === first && parts.at(-1)![0] === last[0];
    // A one-word name (nickname): matches the first name or is the start of it.
    return name.length >= 3 && (first === name || first.startsWith(name));
  });
  return loose.length === 1 ? loose[0].id : null;
}
