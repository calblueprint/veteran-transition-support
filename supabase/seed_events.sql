-- Sample events to check /events: only the three future ones should appear.
-- Run in the Supabase SQL editor. Dates are relative to now, so it stays valid.
insert into workshops (name, description, start_date, end_date, location, capacity)
values
  ('Seed: Resume Workshop (future)', 'Future event', now() + interval '3 days', now() + interval '3 days 2 hours', 'Online', 20),
  ('Seed: Networking Night (future)', 'Future event', now() + interval '10 days', now() + interval '10 days 2 hours', 'Oakland, CA', null),
  ('Seed: Benefits Q&A (future)', 'Future event', now() + interval '30 days', now() + interval '30 days 1 hour', 'Online', 50),
  ('Seed: Interview Prep (past)', 'Past event', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', 'Online', 20),
  ('Seed: Career Fair (past)', 'Past event', now() - interval '30 days', now() - interval '30 days' + interval '4 hours', 'San Francisco, CA', 100);

-- Cleanup when done:
-- delete from workshops where name like 'Seed: %';
