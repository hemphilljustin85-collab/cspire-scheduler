// Builds the iPhone app's copy of the scheduler into out/ (a static export).
//
// The app runs entirely on the phone and talks to Supabase directly, like the
// website does in the browser. Two things only work on a server, so they're
// left out of the app build (and put back afterwards):
//   - app/api/*            (the AI assistant's server code; the app calls the website's)
//   - app/employees/[id]   (an unused placeholder page with a dynamic address)
//
// Usage: npm run build:ios   (then: npx cap sync ios)

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const parked = path.join(root, ".ios-build-parked");
const excluded = ["app/api", "app/employees/[id]"];

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (!process.env[name]) {
    console.error(`Missing ${name}. Set it (the same value as on Vercel) before building the app.`);
    process.exit(1);
  }
}
if (!process.env.NEXT_PUBLIC_SITE_URL) {
  console.warn(
    "NEXT_PUBLIC_SITE_URL isn't set: links you share from the app (team schedule, invites, password resets) " +
      "and the AI assistant need your website's address, e.g. https://your-app.vercel.app",
  );
}

const moves = [];
try {
  rmSync(parked, { recursive: true, force: true });
  mkdirSync(parked, { recursive: true });
  excluded.forEach((relative, index) => {
    const from = path.join(root, relative);
    if (!existsSync(from)) return;
    const to = path.join(parked, String(index));
    renameSync(from, to);
    moves.push([to, from]);
  });
  rmSync(path.join(root, "out"), { recursive: true, force: true });
  execSync("npx next build", { stdio: "inherit", env: { ...process.env, NEXT_OUTPUT: "export" } });
  console.log("\nApp build ready in out/. Next: npx cap sync ios");
} finally {
  for (const [from, to] of moves.reverse()) renameSync(from, to);
  rmSync(parked, { recursive: true, force: true });
}
