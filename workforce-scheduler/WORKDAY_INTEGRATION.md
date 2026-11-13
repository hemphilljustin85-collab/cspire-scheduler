# Workday

## Now: files (no IT setup needed)

- **Employees → Import from Workday.** Upload a worker report exported from Workday (.xlsx or .csv). Columns are found by heading (Worker / Name / First + Last Name, Employee ID, Business Title, Work Email, Mobile Phone, Hire Date, Worker Status). Title rows above the headings are skipped. Each Workday row can update an existing employee (matched by Employee ID, email, full name, or a unique nickname), add a new person, or be skipped. Nothing is saved until you click Import. Names already in the scheduler are kept unless you untick the box.
- **Schedule → Export for Workday.** Creates an .xlsx with two sheets:
  - *Workday Upload*: one row per shift with Employee ID, date, start and end times, hours, and type (Work / PTO / Holiday). This can be used as the source for an EIB upload if IT sets one up.
  - *Entry Sheet*: each person's shifts in date order with a checkbox, for typing them into Workday by hand.

## Later: direct connection (needs C Spire IT)

A live sync needs these from Workday administrators:

1. **An Integration System User (ISU)** and an **API Client for Integrations** (OAuth 2.0, refresh token). Provide the tenant name, REST endpoint, token endpoint, client ID, client secret and refresh token.
2. **Security group permissions** for that ISU:
   - read workers in the store's supervisory organization (name, employee ID, business title, work email and phone, status, hire date);
   - put work schedules and/or scheduled shifts for those workers (Workday Scheduling or Time Tracking work schedule calendars, depending on what C Spire uses).
3. **Approval** to send employee data to this app (hosted on Vercel, data in Supabase).

With those, the app would get a Workday settings page. Credentials would stay server-side in Vercel environment variables. It would get two buttons: "Sync team from Workday" and "Send schedule to Workday".
