"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  matchWorker,
  parseWorkdayRows,
  readReportFile,
  type ParsedReport,
  type WorkdayWorker,
} from "../lib/workdayImport";

type Existing = {
  id: string;
  employee_name: string;
  employee_id: string | null;
  email: string | null;
  position: string | null;
  status: string | null;
};

/** "add", "skip", or the id of the existing employee to update. */
type Action = string;

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  firstName: "First name",
  lastName: "Last name",
  employeeId: "Employee ID",
  position: "Job title",
  email: "Email",
  phone: "Phone",
  status: "Status",
  hireDate: "Hire date",
};

export default function WorkdayImport({
  employees,
  defaultPosition,
  positionNames,
  onClose,
  onDone,
}: {
  employees: Existing[];
  defaultPosition: string;
  /** Positions in the scheduler; a Workday title that matches one is used for new people. */
  positionNames: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileName, setFileName] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [keepNames, setKeepNames] = useState(true);
  const [useTitles, setUseTitles] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setReading(true);
    try {
      const parsed = parseWorkdayRows(await readReportFile(file));
      if (parsed.workers.length === 0) throw new Error("The report has a heading row but no people under it.");
      const taken = new Set<string>();
      const initial = parsed.workers.map((worker) => {
        const match = matchWorker(worker, employees, taken);
        if (match) {
          taken.add(match);
          return match;
        }
        return worker.status === "Active" ? "add" : "skip";
      });
      setReport(parsed);
      setActions(initial);
      setFileName(file.name);
    } catch (readError) {
      setReport(null);
      setError(readError instanceof Error ? readError.message : "Couldn't read that file.");
    }
    setReading(false);
  }

  const notInFile = useMemo(() => {
    if (!report) return [];
    const used = new Set(actions.filter((action) => action !== "add" && action !== "skip"));
    return employees.filter((employee) => !used.has(employee.id) && (employee.status || "Active") === "Active");
  }, [actions, employees, report]);

  const counts = useMemo(() => ({
    add: actions.filter((action) => action === "add").length,
    update: actions.filter((action) => action !== "add" && action !== "skip").length,
    skip: actions.filter((action) => action === "skip").length,
  }), [actions]);

  const duplicateTargets = useMemo(() => {
    const seen = new Map<string, number>();
    actions.forEach((action) => {
      if (action !== "add" && action !== "skip") seen.set(action, (seen.get(action) ?? 0) + 1);
    });
    return new Set([...seen].filter(([, count]) => count > 1).map(([id]) => id));
  }, [actions]);

  async function apply() {
    if (!report) return;
    if (duplicateTargets.size > 0) {
      setError("Two Workday rows are set to update the same person. Pick a different person or Add/Skip for one of them.");
      return;
    }
    setSaving(true);
    setError("");
    let added = 0;
    let updated = 0;
    const failures: string[] = [];

    for (const [index, worker] of report.workers.entries()) {
      const action = actions[index];
      if (action === "skip") continue;
      if (action === "add") {
        const { error: insertError } = await supabase.from("employees").insert({
          employee_name: worker.name,
          employee_id: worker.employeeId,
          position:
            useTitles && worker.position
              ? worker.position
              : positionNames.find((name) => name.toLowerCase() === (worker.position || "").trim().toLowerCase()) ?? (defaultPosition || null),
          status: worker.status,
          hire_date: worker.hireDate,
          email: worker.email,
          phone: worker.phone,
          notify_email: true,
          notify_sms: true,
        });
        if (insertError) failures.push(`${worker.name}: ${insertError.message}`);
        else added += 1;
        continue;
      }
      const changes: Record<string, string | null> = { status: worker.status };
      if (worker.employeeId) changes.employee_id = worker.employeeId;
      if (worker.email) changes.email = worker.email;
      if (worker.phone) changes.phone = worker.phone;
      if (worker.hireDate) changes.hire_date = worker.hireDate;
      if (!keepNames) changes.employee_name = worker.name;
      if (useTitles && worker.position) changes.position = worker.position;
      const { data, error: updateError } = await supabase.from("employees").update(changes).eq("id", action).select("id");
      if (updateError) failures.push(`${worker.name}: ${updateError.message}`);
      else if (!data || data.length === 0) failures.push(`${worker.name}: not saved (no permission to change this employee)`);
      else updated += 1;
    }

    setSaving(false);
    if (failures.length > 0) {
      setError(`Some rows weren't saved:\n${failures.join("\n")}`);
      if (added + updated === 0) return;
    }
    onDone(`Imported from Workday: ${added} added, ${updated} updated${failures.length ? `, ${failures.length} failed` : ""}.`);
  }

  const workerLabel = (worker: WorkdayWorker) =>
    [worker.employeeId ? `#${worker.employeeId}` : null, worker.position, worker.email, worker.phone].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
      <div className="safe-pad-top-only w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Import team from Workday</h2>
            <p className="mt-1 text-sm text-slate-600">
              In Workday, open your team&apos;s worker report (for example <em>My Team</em> or <em>Workers in My Organization</em>),
              export it to Excel or CSV, and choose that file here. Nothing is saved until you click Import.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-1 text-2xl text-slate-500 hover:bg-slate-100" aria-label="Close">×</button>
        </div>

        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-5 text-center hover:bg-slate-50">
          <span className="font-semibold text-blue-700">{reading ? "Reading…" : fileName ? `Choose a different file (${fileName})` : "Choose Workday report (.xlsx or .csv)"}</span>
          <span className="text-xs text-slate-500">Needs a name column (Worker, Name, or First/Last Name). Employee ID, Business Title, Email, Phone, Hire Date and Status are used if present.</span>
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} className="hidden" />
        </label>

        {error && <p className="mt-4 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {report && (
          <>
            <p className="mt-4 text-xs text-slate-500">
              Columns found: {Object.entries(report.columns).map(([field, heading]) => `${FIELD_LABELS[field] ?? field} ← "${heading}"`).join(" · ")}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={keepNames} onChange={(e) => setKeepNames(e.target.checked)} />
                Keep the names already in the scheduler (e.g. nicknames)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useTitles} onChange={(e) => setUseTitles(e.target.checked)} />
                Use Workday job titles as positions
              </label>
            </div>

            <div className="mt-4 divide-y rounded-xl border">
              {report.workers.map((worker, index) => {
                const action = actions[index];
                const duplicate = duplicateTargets.has(action);
                return (
                  <div key={worker.row} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {worker.name}
                        {worker.status === "Inactive" && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Inactive in Workday</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">{workerLabel(worker) || "No other details"}</div>
                    </div>
                    <select
                      value={action}
                      onChange={(e) => setActions((current) => current.map((value, i) => (i === index ? e.target.value : value)))}
                      className={`w-full rounded-lg border px-2 py-2 text-sm sm:w-64 ${duplicate ? "border-red-500 ring-2 ring-red-200" : "border-slate-300"} ${action === "add" ? "bg-green-50" : action === "skip" ? "bg-slate-50 text-slate-500" : "bg-blue-50"}`}
                    >
                      <option value="add">Add as new employee</option>
                      <option value="skip">Skip</option>
                      <optgroup label="Update existing employee">
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>Update: {employee.employee_name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                );
              })}
            </div>

            {notInFile.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                In the scheduler but not matched to anyone in this file: {notInFile.map((employee) => employee.employee_name).join(", ")}.
                They&apos;re left as they are. Pick them in the list above if they&apos;re the same person under a different name.
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">{counts.add} to add · {counts.update} to update · {counts.skip} skipped</p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 font-medium">Cancel</button>
                <button type="button" onClick={apply} disabled={saving || counts.add + counts.update === 0} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
                  {saving ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
