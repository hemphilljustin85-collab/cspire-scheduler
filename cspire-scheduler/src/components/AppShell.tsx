"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import Sidebar from "./Sidebar";
import { supabase } from "../lib/supabase";

const PUBLIC_ROUTES = ["/login", "/team-schedule"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicRoute = isPublicRoute(pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(!publicRoute);

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

      if (!mounted) return;

      setSession(currentSession);
      setCheckingSession(false);

      if (!currentSession) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);

      if (!nextSession && !publicRoute) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, publicRoute, router]);

  if (publicRoute) return <>{children}</>;

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-bold">Workforce Scheduler</h1>
          <p className="mt-2 text-slate-600">Checking manager access...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
