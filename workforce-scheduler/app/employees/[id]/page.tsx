"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Employee Details</h1>
          <p className="mt-2 text-slate-600">Employee ID: {params.id}</p>
        </div>
        <Link href="/employees" className="rounded-lg bg-slate-200 px-4 py-2 font-semibold">
          Back to Employees
        </Link>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <p className="text-slate-700">
          This page is ready for the employee profile, availability, scheduling preferences, PTO, and fairness metrics.
        </p>
      </div>
    </div>
  );
}
