"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import AIAssistant from "./AIAssistant";
import { supabase } from "../lib/supabase";
import { getCurrentStore } from "../lib/store";

const PUBLIC_ROUTES = [
  "/login",
  "/auth/confirm",
  "/forgot-password",
  "/reset-password",
  "/team-schedule",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`),
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const publicRoute = isPublicRoute(pathname);

  const [session, setSession] = useState<unknown>(null);
  const [checkingSession, setCheckingSession] =
    useState(!publicRoute);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeName, setStoreName] = useState("Workforce");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      if (publicRoute) {
        setCheckingSession(false);
        return;
      }

      setCheckingSession(true);

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(currentSession);
      setCheckingSession(false);

      if (!currentSession) {
        router.replace(
          `/login?next=${encodeURIComponent(pathname)}`,
        );
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, nextSession: unknown) => {
        if (!mounted) {
          return;
        }

        setSession(nextSession);

        if (!nextSession && !publicRoute) {
          router.replace("/login");
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, publicRoute, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!publicRoute && session) {
      void getCurrentStore().then((store) => setStoreName(store.store_name));
    }
  }, [publicRoute, session]);

  if (publicRoute) {
    return <>{children}</>;
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-bold">
            Workforce Scheduler
          </h1>

          <p className="mt-2 text-slate-600">
            Checking manager access...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            {storeName} · Manager Portal
          </p>
          <h1 className="text-lg font-bold text-slate-900">
            Workforce Scheduler
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-2xl text-slate-800 shadow-sm active:bg-slate-100"
        >
          ☰
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />

          <div className="relative h-full w-[86%] max-w-sm shadow-2xl">
            <Sidebar
              mobile
              onNavigate={() => setMobileMenuOpen(false)}
              onClose={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      <main className="min-w-0 p-3 sm:p-5 lg:ml-64 lg:p-8">
        {children}
      </main>

      <AIAssistant />
    </div>
  );
}
