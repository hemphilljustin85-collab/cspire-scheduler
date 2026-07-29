"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getCurrentStore } from "../lib/store";

type Counts = { employees: number; shifts: number; rules: number; schedules: number };

export default function SetupGuide() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void (async () => {
      const store = await getCurrentStore();
      const key = `setup-guide-dismissed:${store.id}`;
      if (window.localStorage.getItem(key) === "1") setDismissed(true);
      const [employees, shifts, rules, schedules] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }),
        supabase.from("shift_templates").select("id", { count: "exact", head: true }),
        supabase.from("ai_rules").select("id", { count: "exact", head: true }),
        supabase.from("schedules").select("id", { count: "exact", head: true }),
      ]);
      setCounts({
        employees: employees.count || 0,
        shifts: shifts.count || 0,
        rules: rules.count || 0,
        schedules: schedules.count || 0,
      });
    })();
  }, []);

  const steps = useMemo(() => counts ? [
    { label: "Add your employees", href: "/employees", done: counts.employees > 0 },
    { label: "Review or add custom shifts", href: "/shifts", done: counts.shifts > 0, optional: true },
    { label: "Set your scheduling rules", href: "/rules", done: counts.rules > 0 },
    { label: "Review PTO and time off", href: "/pto", done: false, optional: true },
    { label: "Create your first schedule", href: "/schedule", done: counts.schedules > 0 },
  ] : [], [counts]);
  const required = steps.filter((step) => !step.optional);
  const completed = required.filter((step) => step.done).length;
  if (!counts || dismissed || completed === required.length) return null;

  async function dismiss() {
    const store = await getCurrentStore();
    window.localStorage.setItem(`setup-guide-dismissed:${store.id}`, "1");
    setDismissed(true);
  }

  return (
    <section className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Getting started</p>
          <h2 className="mt-1 text-2xl font-bold">Set up your store</h2>
          <p className="mt-1 text-sm text-slate-600">{completed} of {required.length} required steps complete</p>
        </div>
        <button type="button" onClick={() => void dismiss()} className="text-sm font-semibold text-slate-500 hover:text-slate-900">
          Hide guide
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${(completed / required.length) * 100}%` }} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step) => (
          <Link key={step.href} href={step.href}
            className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow ${step.done ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"}`}>
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${step.done ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {step.done ? "✓" : steps.indexOf(step) + 1}
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900">{step.label}</p>
            {step.optional && <p className="mt-1 text-xs text-slate-500">Optional until needed</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
