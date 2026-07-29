"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { getCurrentStore } from "../lib/store";

const links = [
  { name: "Dashboard", href: "/dashboard", icon: "▦" },
  { name: "Employees", href: "/employees", icon: "●" },
  { name: "Schedule", href: "/schedule", icon: "▤" },
  { name: "PTO", href: "/pto", icon: "◷" },
  { name: "Custom Shifts", href: "/shifts", icon: "+" },
  { name: "Rules", href: "/rules", icon: "✓" },
  { name: "Metrics", href: "/metrics", icon: "↗" },
  { name: "Reports", href: "/reports", icon: "▥" },
  { name: "Settings", href: "/settings", icon: "⚙" },
  { name: "Store Team", href: "/team", icon: "◎" },
];

type SidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
};

export default function Sidebar({
  mobile = false,
  onNavigate,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [storeName, setStoreName] = useState("Workforce");
  const [publicSlug, setPublicSlug] = useState("");
  const [role, setRole] = useState("manager");

  useEffect(() => {
    void getCurrentStore().then((store) => {
      setStoreName(store.store_name);
      setPublicSlug(store.public_slug);
    });
    void supabase.auth.getUser().then(async ({ data }: { data: { user: { id: string } | null } }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (profile?.role) setRole(profile.role);
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    onNavigate?.();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      className={
        mobile
          ? "flex h-full w-full flex-col overflow-y-auto bg-slate-900 p-5 text-white"
          : "fixed inset-y-0 left-0 z-30 flex w-64 flex-col overflow-y-auto bg-slate-900 p-6 text-white"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-black shadow-lg shadow-blue-950/30">
            M
          </div>
          <h1 className="text-xl font-bold leading-tight">
            {storeName}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Scheduler · Manager Portal
          </p>
        </div>

        {mobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-2xl hover:bg-slate-800"
          >
            ×
          </button>
        )}
      </div>

      <nav className="mt-6 flex-1">
        <ul className="space-y-2">
          {links.filter((link) =>
            role !== "viewer" || ["Dashboard", "Schedule", "Metrics", "Reports"].includes(link.name),
          ).map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" &&
                pathname.startsWith(`${link.href}/`));

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition ${
                    active
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-100 hover:bg-slate-800"
                  }`}
                >
                  <span aria-hidden="true" className="w-5 text-center text-lg text-blue-300">
                    {link.icon}
                  </span>
                  {link.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 space-y-3 border-t border-slate-700 pt-5">
        <Link
          href={publicSlug ? `/team-schedule?store=${encodeURIComponent(publicSlug)}` : "/team-schedule"}
          target="_blank"
          onClick={onNavigate}
          className="block rounded-lg border border-slate-700 px-4 py-3 text-center text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          Open Team Schedule
        </Link>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full rounded-lg bg-red-600 px-4 py-3 text-center font-semibold text-white hover:bg-red-700"
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}
