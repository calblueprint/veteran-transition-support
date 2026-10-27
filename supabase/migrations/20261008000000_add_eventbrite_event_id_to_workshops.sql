-- Stores the id of the matching Eventbrite event for each workshop.
-- "if not exists" makes this safe to run even if the column was already added by hand.
alter table workshops
  add column if not exists eventbrite_event_id text;
