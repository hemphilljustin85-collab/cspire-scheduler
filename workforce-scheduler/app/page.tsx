"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { START_PATH_KEY } from "../src/lib/native";

// Home sends people to the dashboard. In the iPhone app, reloading any page
// loads this one first, so it goes back to the page that was open instead.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let target = "/dashboard";
    try {
      const saved = JSON.parse(sessionStorage.getItem(START_PATH_KEY) || "null") as { path: string; at: number } | null;
      sessionStorage.removeItem(START_PATH_KEY);
      // Only a path saved by this same page load (a few seconds ago) counts.
      if (saved && Date.now() - saved.at < 5000 && saved.path !== "/" && !saved.path.startsWith("/index")) target = saved.path;
    } catch {
      // storage unavailable: just go to the dashboard
    }
    router.replace(target);
  }, [router]);

  return null;
}
