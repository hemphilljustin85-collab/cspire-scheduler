# Workforce Scheduler

Weekly staff scheduling for small businesses — retail stores, restaurants, salons, clinics, or any team that works shifts.

## What it does

- **Team** — add employees, positions, and contact info; invite other managers or view-only teammates.
- **Shifts** — define the shifts your business actually works. Starter shifts are included so you can try it on day one, and can be hidden once yours are set up.
- **Rules** — openers and closers per day, target weekly hours, days off, availability, required shifts, and shifts limited to certain days.
- **Auto Generate** — builds a starting schedule from your rules and approved time off. Opening and closing shifts are detected from their start and end times, so it works with any hours.
- **Time off** — approved PTO is locked into the schedule automatically.
- **Publish & share** — publish a week and send your team a read-only link they can open on any phone.
- **Reports & fairness metrics** — hours, closes, and weekend coverage per person, with CSV export.
- **AI assistant** — ask in plain language ("give Alex Saturday off", "add a new employee"); changes that matter wait for manager approval.

## Getting started (managers)

1. Create an account and name your workspace.
2. Add your employees.
3. Add your shifts on the **Shifts** page (or use the starter shifts to try it out).
4. Set your scheduling rules.
5. Open **Schedule**, tap **Auto Generate**, adjust anything, then **Publish**.

## Running it locally (developers)

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open http://localhost:3000.

See [DEPLOYMENT.md](DEPLOYMENT.md) for deploying to Vercel, and review
`SUPABASE_SECURITY_BEFORE_LAUNCH.sql` before inviting real users.

## Tech

Next.js · React · TypeScript · Tailwind CSS · Supabase (auth, Postgres, row-level security) · Vercel
