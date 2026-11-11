import { redirect } from "next/navigation";

// The PTO page is now Days Off Requests; keep old links and bookmarks working.
export default function PTORedirect() {
  redirect("/days-off");
}
