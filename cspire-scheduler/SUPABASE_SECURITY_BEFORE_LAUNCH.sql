-- REVIEW BEFORE RUNNING. This replaces permissive development policies.
-- Create manager users in Supabase Authentication first.

-- Example: authenticated managers may manage data; the public may read published schedules.

-- EMPLOYEES
alter table employees enable row level security;
drop policy if exists "Allow employee read" on employees;
drop policy if exists "Allow employee insert" on employees;
drop policy if exists "Allow employee update" on employees;
drop policy if exists "Allow employee delete" on employees;
create policy "Authenticated managers read employees" on employees for select to authenticated using (true);
create policy "Authenticated managers insert employees" on employees for insert to authenticated with check (true);
create policy "Authenticated managers update employees" on employees for update to authenticated using (true) with check (true);
create policy "Authenticated managers delete employees" on employees for delete to authenticated using (true);
-- Public employee names are needed for the published team schedule.
create policy "Public reads active employee names" on employees for select to anon using (status = 'Active' or status is null);

-- SCHEDULES
alter table schedules enable row level security;
drop policy if exists "Allow schedules read" on schedules;
drop policy if exists "Allow schedules insert" on schedules;
drop policy if exists "Allow schedules update" on schedules;
drop policy if exists "Allow schedules delete" on schedules;
create policy "Managers read schedules" on schedules for select to authenticated using (true);
create policy "Managers insert schedules" on schedules for insert to authenticated with check (true);
create policy "Managers update schedules" on schedules for update to authenticated using (true) with check (true);
create policy "Managers delete schedules" on schedules for delete to authenticated using (true);
create policy "Public reads published schedules" on schedules for select to anon using (status = 'Published');

-- SCHEDULE ENTRIES
alter table schedule_entries enable row level security;
drop policy if exists "Allow entries read" on schedule_entries;
drop policy if exists "Allow entries insert" on schedule_entries;
drop policy if exists "Allow entries update" on schedule_entries;
drop policy if exists "Allow entries delete" on schedule_entries;
create policy "Managers read entries" on schedule_entries for select to authenticated using (true);
create policy "Managers insert entries" on schedule_entries for insert to authenticated with check (true);
create policy "Managers update entries" on schedule_entries for update to authenticated using (true) with check (true);
create policy "Managers delete entries" on schedule_entries for delete to authenticated using (true);
create policy "Public reads entries from published schedules" on schedule_entries for select to anon using (
  exists (
    select 1 from schedules
    where schedules.id = schedule_entries.schedule_id
      and schedules.status = 'Published'
  )
);

-- Restrict all other operational tables to authenticated managers.
-- Existing policy names can differ, so inspect and remove permissive anon policies before launch.
