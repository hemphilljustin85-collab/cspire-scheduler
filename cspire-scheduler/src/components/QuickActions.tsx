"use client";

import Link from "next/link";

export default function QuickActions() {
  const actions = [
    { title: "Generate Schedule", description: "Create a new weekly schedule", href: "/schedule", color: "bg-green-600" },
    { title: "Employees", description: "Manage workforce", href: "/employees", color: "bg-blue-600" },
    { title: "PTO", description: "Manage time off", href: "/pto", color: "bg-orange-600" },
    { title: "Rules", description: "Manage scheduling rules", href: "/rules", color: "bg-purple-600" },
  ];

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-bold">Quick Actions</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`${action.color} rounded-xl p-5 text-white transition hover:opacity-90`}
          >
            <div className="text-lg font-bold">{action.title}</div>
            <div className="mt-1 text-sm text-white/90">{action.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
