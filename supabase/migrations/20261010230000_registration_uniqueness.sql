begin;

alter table public.registrations
add constraint registrations_participant_workshop_key
unique (participant_id, workshop_id);

commit;