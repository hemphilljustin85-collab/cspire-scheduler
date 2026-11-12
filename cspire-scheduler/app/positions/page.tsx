"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { loadPositions, savePositions, type Position } from "../../src/lib/positions";

type EmployeePosition = { id: string; position: string | null; status: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsManager, setNewIsManager] = useState(false);
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);
  const [removing, setRemoving] = useState<{ index: number; moveTo: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [positionResult, employeeResult] = await Promise.all([
      loadPositions(),
      supabase.from("employees").select("id, position, status"),
    ]);
    if (positionResult.error) setErrorMessage(positionResult.error);
    if (employeeResult.error) setErrorMessage(employeeResult.error.message);
    setPositions(positionResult.positions);
    setRuleId(positionResult.ruleId);
    setEmployees((employeeResult.data as EmployeePosition[]) || []);
    setLoading(false);
  }

  const countFor = (name: string) => employees.filter((employee) => same(employee.position || "", name)).length;

  // Positions people have that aren't in the list (e.g. typed before this page existed).
  const unlisted = useMemo(() => {
    const names = new Map<string, number>();
    for (const employee of employees) {
      const name = (employee.position || "").trim();
      if (!name || positions.some((position) => same(position.name, name))) continue;
      names.set(name, (names.get(name) ?? 0) + 1);
    }
    return Array.from(names.entries());
  }, [employees, positions]);

  function notice(text: string) {
    setErrorMessage("");
    setMessage(text);
  }

  async function persist(next: Position[], successText: string) {
    setBusy(true);
    const result = await savePositions(next, ruleId);
    setBusy(false);
    if (result.error) {
      setMessage("");
      setErrorMessage(result.error);
      return false;
    }
    setRuleId(result.ruleId ?? ruleId);
    setPositions(next);
    notice(successText);
    return true;
  }

  /** Move everyone with one position to another. Returns false (with an error shown) if it didn't work. */
  async function moveEmployees(from: string, to: string) {
    const affected = employees.filter((employee) => same(employee.position || "", from));
    if (affected.length === 0) return true;
    const { data, error } = await supabase
      .from("employees")
      .update({ position: to })
      .in("id", affected.map((employee) => employee.id))
      .select("id");
    if (error || !data || data.length < affected.length) {
      setMessage("");
      setErrorMessage(error?.message || "Some people couldn't be updated. Your account may not have permission to edit employees.");
      await load();
      return false;
    }
    setEmployees((current) => current.map((employee) => (same(employee.position || "", from) ? { ...employee, position: to } : employee)));
    return true;
  }

  async function addPosition(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (positions.some((position) => same(position.name, name))) {
      setErrorMessage(`"${name}" is already in the list.`);
      return;
    }
    if (await persist([...positions, { name, isManager: newIsManager }], `${name} added.`)) {
      setNewName("");
      setNewIsManager(false);
    }
  }

  async function rename(index: number, value: string) {
    const name = value.trim();
    const old = positions[index];
    if (!name || name === old.name) {
      setRenaming(null);
      return;
    }
    if (positions.some((position, other) => other !== index && same(position.name, name))) {
      setErrorMessage(`"${name}" is already in the list.`);
      return;
    }
    const people = countFor(old.name);
    setBusy(true);
    const moved = await moveEmployees(old.name, name);
    setBusy(false);
    if (!moved) return;
    const next = positions.map((position, other) => (other === index ? { ...position, name } : position));
    if (await persist(next, `Renamed ${old.name} to ${name}${people ? ` and updated ${people} ${people === 1 ? "person" : "people"}` : ""}.`)) {
      setRenaming(null);
    }
  }

  async function toggleManager(index: number) {
    const next = positions.map((position, other) => (other === index ? { ...position, isManager: !position.isManager } : position));
    await persist(
      next,
      next[index].isManager
        ? `${next[index].name} now counts as a manager.`
        : `${next[index].name} no longer counts as a manager.`,
    );
  }

  async function moveInList(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= positions.length) return;
    const next = [...positions];
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next, "Order saved.");
  }

  async function remove(index: number, moveTo: string) {
    const old = positions[index];
    const people = countFor(old.name);
    if (people > 0) {
      if (!moveTo) {
        setErrorMessage(`Choose where to move the ${people} ${people === 1 ? "person" : "people"} who are ${old.name}.`);
        return;
      }
      setBusy(true);
      const moved = await moveEmployees(old.name, moveTo);
      setBusy(false);
      if (!moved) return;
    }
    const next = positions.filter((_, other) => other !== index);
    if (await persist(next, people ? `${old.name} removed; ${people} moved to ${moveTo}.` : `${old.name} removed.`)) {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Positions</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            The job titles you can give people on the Employees page. Renaming a position updates
            everyone who has it. Positions marked as managers count toward the Saturday manager rule.
          </p>
        </div>
        <Link href="/employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50">
          Back to Employees
        </Link>
      </div>

      {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">{message}</div>}
      {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{errorMessage}</div>}

      <form onSubmit={addPosition} className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">New position</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Example: Sales Consultant"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={newIsManager} onChange={(event) => setNewIsManager(event.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-medium">Counts as a manager</span>
        </label>
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          Add position
        </button>
      </form>

      <div className="rounded-xl bg-white shadow">
        <h2 className="border-b p-5 text-xl font-bold">Your positions</h2>
        {loading ? (
          <p className="p-5">Loading positions...</p>
        ) : positions.length === 0 ? (
          <p className="p-5 text-slate-600">No positions yet. Add one above.</p>
        ) : (
          <ul className="divide-y">
            {positions.map((position, index) => {
              const people = countFor(position.name);
              const isRenaming = renaming?.index === index;
              const isRemoving = removing?.index === index;
              return (
                <li key={position.name} className="space-y-3 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <button type="button" disabled={busy || index === 0} onClick={() => void moveInList(index, -1)} className="px-1 text-slate-500 disabled:opacity-30" aria-label={`Move ${position.name} up`}>▲</button>
                        <button type="button" disabled={busy || index === positions.length - 1} onClick={() => void moveInList(index, 1)} className="px-1 text-slate-500 disabled:opacity-30" aria-label={`Move ${position.name} down`}>▼</button>
                      </div>
                      {isRenaming ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void rename(index, renaming.value);
                          }}
                          className="flex gap-2"
                        >
                          <input
                            autoFocus
                            value={renaming.value}
                            onChange={(event) => setRenaming({ index, value: event.target.value })}
                            className="rounded-lg border border-slate-300 px-3 py-1.5"
                          />
                          <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                          <button type="button" onClick={() => setRenaming(null)} className="rounded-lg border px-3 py-1.5 text-sm">Cancel</button>
                        </form>
                      ) : (
                        <div>
                          <p className="font-semibold">
                            {position.name}
                            {position.isManager && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Manager</span>}
                          </p>
                          <p className="text-sm text-slate-500">{people} {people === 1 ? "person" : "people"}</p>
                        </div>
                      )}
                    </div>
                    {!isRenaming && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={position.isManager} disabled={busy} onChange={() => void toggleManager(index)} className="h-4 w-4" />
                          Manager
                        </label>
                        <button type="button" disabled={busy} onClick={() => { setRemoving(null); setRenaming({ index, value: position.name }); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Rename</button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (people > 0 ? setRemoving({ index, moveTo: "" }) : void remove(index, ""))}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {isRemoving && (
                    <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 sm:flex-row sm:items-center">
                      <span className="text-sm text-red-900">
                        {people} {people === 1 ? "person has" : "people have"} this position. Move them to:
                      </span>
                      <select
                        value={removing.moveTo}
                        onChange={(event) => setRemoving({ index, moveTo: event.target.value })}
                        className="rounded-lg border border-slate-300 px-2 py-1.5"
                      >
                        <option value="">Choose…</option>
                        {positions.filter((_, other) => other !== index).map((other) => (
                          <option key={other.name} value={other.name}>{other.name}</option>
                        ))}
                      </select>
                      <button type="button" disabled={busy || !removing.moveTo} onClick={() => void remove(index, removing.moveTo)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Move and remove</button>
                      <button type="button" onClick={() => setRemoving(null)} className="rounded-lg border bg-white px-3 py-1.5 text-sm">Cancel</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {unlisted.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-900">Also in use</h2>
          <p className="mt-1 text-sm text-amber-900">These positions are on people but not in your list.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unlisted.map(([name, count]) => (
              <button
                key={name}
                type="button"
                disabled={busy}
                onClick={() => void persist([...positions, { name, isManager: name.toLowerCase().includes("manager") }], `${name} added to your list.`)}
                className="rounded-full border border-amber-400 bg-white px-3 py-1 text-sm font-medium hover:bg-amber-100"
              >
                + {name} ({count})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
