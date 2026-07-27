"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

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
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-slate-900 p-6 text-white lg:flex">
      <div>
        <h1 className="text-2xl font-bold">Workforce Scheduler</h1>
        <p className="mt-1 text-sm text-slate-400">Manager Portal</p>
      </div>

      <nav className="mt-6 flex-1">
        <ul className="space-y-2">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(`${link.href}/`));

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`block rounded-md px-3 py-2 transition ${
                    active ? "bg-blue-600 text-white" : "hover:bg-slate-700"
                  }`}
                >
                  {link.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-slate-700 pt-4">
        <Link
          href="/team-schedule"
          target="_blank"
          className="block rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          Open Team Schedule
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full rounded-md bg-red-600 px-3 py-2 text-left font-medium text-white hover:bg-red-700"
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}
