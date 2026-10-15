# Zoom attendance import

Issue [#22](https://github.com/calblueprint/veteran-transition-support/issues/22)
adds a staff-run command to retrieve a completed Zoom meeting report and save
minutes attended on existing workshop registrations. It runs outside the browser;
there is no public import endpoint or new admin screen.

## Setup

1. Use Node 22.9+ and run `pnpm install --frozen-lockfile`.
2. Apply `supabase/migrations/20261015010000_zoom_attendance.sql` to the intended
   development database through the team's migration process. It extends the
   existing `registrations`, `participants`, and `workshops` schema. This repository
   does not contain the original table-creation migrations; a blank Supabase reset
   alone cannot provision that schema.
3. In Zoom Marketplace, create and activate a **Server-to-Server OAuth** app with
   `report:read:list_meeting_participants:admin`. The account must permit creating
   this app and granting report access. A school-managed license may require its
   administrator's help. Do not purchase a plan or change organization permissions
   just to run this test without coordinating with the team.
4. Put the following in the git-ignored `.env.local` file:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_KEY
   ZOOM_ACCOUNT_ID=FROM_THE_ZOOM_APP_CREDENTIALS_TAB
   ZOOM_CLIENT_ID=FROM_THE_ZOOM_APP_CREDENTIALS_TAB
   ZOOM_CLIENT_SECRET=FROM_THE_ZOOM_APP_CREDENTIALS_TAB
   ```

   Keep these credentials local. The service-role key and Zoom secret must never
   use a `NEXT_PUBLIC_` prefix or appear in screenshots, logs, or PRs. The Zoom app's
   account ID differs from the account number shown on a user's profile.

## Import a completed meeting

Use the **meeting instance UUID**, not the numeric meeting number. The UUID pins
the import to one occurrence of a recurring meeting. It is available from
`GET /past_meetings/{meetingId}/instances` (additional scope
`meeting:read:list_past_instances:admin`) or a meeting detail report (additional
scope `report:read:meeting:admin`). Select the occurrence by its start time, then
pass the raw UUID; the importer handles URL encoding.

Preview first:

```sh
pnpm attendance:sync --workshop-id 'WORKSHOP_UUID' --meeting-uuid 'RAW_ZOOM_INSTANCE_UUID'
```

Check the workshop name, registration IDs, emails, and calculated minutes, then save:

```sh
pnpm attendance:sync --workshop-id 'WORKSHOP_UUID' --meeting-uuid 'RAW_ZOOM_INSTANCE_UUID' --apply
```

Output includes `matched`, `unregistered_emails`, `ambiguous_emails`, and
`missing_email_rows`. Both commands retrieve the complete report. Errors while
authenticating, fetching any page, or validating timestamps prevent all writes.
If Zoom returns 429, wait for the indicated retry interval before running again.
An empty/incomplete report fails instead of treating everyone as absent.

## Matching and duration rules

- Match trimmed, case-insensitive `user_email` to `participants.email`, then to a
  non-cancelled registration for the selected workshop. Do not match names or
  create registrations. Zoom email matching is evidence of attendance, not a
  separate identity-verification process.
- Flag emails with more than one matching registration and leave them unchanged.
  Missing emails are counted and skipped. A participant registered for a different
  workshop does not match.
- Calculate time from each `join_time` and `leave_time`. Sum separate visits, merge
  overlapping/duplicate visits (including two devices), and round the final number
  of minutes to two decimal places. For example, 90 seconds plus 60 seconds is
  **2.50 minutes**. Two devices connected for the same five minutes count as five.
- Save the duration, source meeting UUID, and sync timestamp in one database
  transaction. Re-importing the same meeting replaces totals; it never increments
  them. A different meeting UUID for an already-imported workshop is rejected.
  This first version supports one meeting instance per workshop, not a series of
  sessions across different days.
- `NULL` means not verified. Unmatched/absent registrations keep their existing
  values, and `attendance_status` is not changed: the issue does not define a
  minimum duration for earning attendance credit. A valid zero-length session may
  store `0.00`. If Zoom is still processing the report, wait and re-import.
- The database function is callable only by the service role. A trigger protects
  attendance fields even where existing development policies allow broad writes.
  Ordinary registration operations are preserved; authenticated clients cannot
  move already-verified attendance to a different participant or workshop.

## Required live test

Automated tests do **not** replace this requirement. Use fictional workshop data
and test participants in the agreed development database.

1. Create a test workshop and a registration whose participant email matches an
   email Zoom will report. Include another workshop registration as a control.
2. Schedule a meeting on the account associated with the OAuth app. Enable Zoom
   registration for external test attendees and have them use their individual
   registration links. Signing in alone does not guarantee an external email is
   returned. Avoid relying on an anonymous guest's display name.
3. Start the meeting with a host and a second participant/device. Keep audio/video
   off if not needed. Have the registered attendee stay about two minutes, leave,
   then rejoin for another minute. Optionally include an unregistered attendee.
4. End the meeting for everyone and allow Zoom's report to finish processing.
5. Obtain the instance UUID, preview the import, and check the email match. Run
   with `--apply`, then read back the stored row:

   ```sql
   select r.id, r.workshop_id, p.email, r.attendance_duration_minutes,
          r.attendance_zoom_meeting_uuid, r.attendance_synced_at
   from public.registrations r
   join public.participants p on p.id = r.participant_id
   where r.workshop_id = 'WORKSHOP_UUID';
   ```

6. Compare the exact Zoom join/leave timestamps with the stored minutes, accounting
   for overlaps and rounding. Re-run the import and confirm the duration does not
   double. Confirm the other workshop's registration is unchanged.
7. Record the meeting date, sanitized join/leave rows, expected calculation, import
   result, and database readback in the PR. Redact emails and sensitive meeting
   details before posting to this public repository. Never include OAuth tokens,
   credentials, meeting passcodes, or join links.

### Evidence status

Live Zoom meeting/report/database proof is **pending**. The automated integration
test uses a synthetic Zoom response and an isolated PostgreSQL database (PGlite).
It demonstrates `90 seconds + 60 seconds = 2.50 minutes` stored on the matching
registration while a different workshop remains unchanged. It does not establish
that Zoom credentials, account permissions, or hosted migration rollout work.

## Automated checks

```sh
pnpm test
pnpm tsc
pnpm lint
pnpm prettier
```

Tests cover pagination, safe API errors, UUID encoding, rejoins/overlaps, missing
emails, workshop scoping, ambiguity, cancellation, repeat imports, atomic rollback,
and permissions/constraints using the actual migration in PostgreSQL.

## References

- [Zoom Meetings API, including participant reports](https://developers.zoom.us/docs/api/meetings/)
- [Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [Email display rules](https://developers.zoom.us/changelog/platform/zoom-api-email-address-display-rules/)
- [Workshop registrations PR #18](https://github.com/calblueprint/veteran-transition-support/pull/18)
