"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The PTO page is now Days Off Requests; keep old links and bookmarks working.
export default function PTORedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/days-off"), [router]);
  return null;
}
