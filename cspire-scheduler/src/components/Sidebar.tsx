"use client";

import Link from "next/link";

const links = [
  { name: "Home", href: "/" },
  { name: "Dashboard", href: "/dashboard" },
  { name: "Employees", href: "/employees" },
  { name: "Schedule", href: "/schedule" },
  { name: "Rules", href: "/rules" },
  { name: "PTO", href: "/pto" },
  { name: "Metrics", href: "/metrics" },
  { name: "Reports", href: "/reports" },
  { name: "Settings", href: "/settings" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 p-6 text-white">
      <h1 className="text-2xl font-bold">
        Workforce Scheduler
      </h1>

      <nav className="mt-6">
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-md px-3 py-2 hover:bg-slate-700"
              >
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}