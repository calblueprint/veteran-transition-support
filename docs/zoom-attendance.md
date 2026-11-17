# Zoom attendance import

Issue [#22](https://github.com/calblueprint/veteran-transition-support/issues/22)
adds a staff-run command to retrieve a completed Zoom meeting report and save
minutes attended on existing workshop registrations. It runs outside the browser;
there is no public import endpoint or new admin screen.

## Scope: one meeting instance per workshop

The stored minutes describe **one completed Zoom meeting**, even when a workshop
has different start and end dates. They are not a multi-day workshop total.
Importing a second instance is rejected in both preview and apply mode. Supporting
multiple days requires per-instance attendance records and an aggregate across
them; repeatedly resetting and importing each day would lose the earlier days.
Use this command only for workshops whose attendance is represented by one meeting
instance. Multi-session aggregation is outside this PR's single-meeting scope.

## Setup

1. Use Node 22.9+ and run `pnpm install --frozen-lockfile`.
2. Apply `supabase/migrations/20261015010000_zoom_attendance.sql` to the intended
   development database through the team's migration process. It extends the
   existing `registrations`, `participants`, and `workshops` schema, including
   `participants.secondary_email` from the earlier onboarding migration
   (`20261007090000_participant_onboarding_documents.sql`). This repository
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
Invalid timestamps deliberately stop the import: skipping one of an attendee's
visits would save an incomplete total and could reduce previously verified minutes.
The timestamp error identifies the report row. Check the source report and retry
after Zoom finishes processing it; do not remove bad rows just to force an import.
If Zoom returns 429, wait for the indicated retry interval before running again.
An empty/incomplete report fails instead of treating everyone as absent.

## Matching and duration rules

- Match trimmed, case-insensitive `user_email` to `participants.email` or
  `participants.secondary_email`, then to a non-cancelled registration for the
  selected workshop. A `NULL` attendance status is eligible; only `cancelled` is
  excluded. Do not match names or create registrations. Zoom email matching is
  evidence of attendance, not a separate identity-verification process.
- Flag emails with more than one matching registration and leave them unchanged,
  including a primary address shared with someone else's secondary address.
  If both of one participant's addresses appear in the report, flag both in
  `ambiguous_emails` and leave that registration unchanged. Email-level totals
  cannot establish whether the two addresses' sessions overlap, so neither adding
  them nor letting the last address overwrite the first is safe.
- Missing emails are counted and skipped. Secondary email matching helps only when
  Zoom actually supplies an address; it cannot identify an anonymous guest. Use
  Zoom registration as described below so future reports include the address.
  For a changed/mismatched address, confirm ownership and save the reported address
  as the participant's secondary email through the profile workflow, then preview
  and re-run the import. If the old address is no longer saved in either field,
  it stays unmatched; this importer has no email history or manual name-based match.
  A participant registered for a different workshop does not match.
- Calculate time from each `join_time` and `leave_time`. Sum separate visits, merge
  overlapping/duplicate visits (including two devices), and round the final number
  of minutes to two decimal places. For example, 90 seconds plus 60 seconds is
  **2.50 minutes**. Two devices connected for the same five minutes count as five.
- Save the duration, source meeting UUID, and sync timestamp in one database
  transaction. Re-importing the same meeting replaces totals; it never increments
  them. A different meeting UUID for an already-imported workshop is rejected.
  See the scope limitation above and the recovery procedure below for a mistaken
  meeting UUID.
- `NULL` means not verified. Unmatched/absent registrations keep their existing
  values, and `attendance_status` is not changed: the issue does not define a
  minimum duration for earning attendance credit. A valid zero-length session may
  store `0.00`. If Zoom is still processing the report, wait and re-import.
- The database function is callable only by the service role. A trigger protects
  attendance fields even where existing development policies allow broad writes.
  Ordinary registration operations are preserved; authenticated clients cannot
  move already-verified attendance to a different participant or workshop.

## Recover from a mistaken meeting UUID

Use the service role or the team's privileged database console. Browser roles
cannot call the reset function. First preview the reset using the **currently
stored, incorrect UUID**, not the replacement meeting's UUID:

```sql
select public.reset_zoom_attendance(
  'WORKSHOP_UUID'::uuid, 'CURRENTLY_STORED_WRONG_INSTANCE_UUID', false
);
```

Verify the workshop name, registration IDs, and current values returned in
`registrations`. Save that result privately if a record of the correction is
needed. After checking the preview, run the same call with `true`:

```sql
select public.reset_zoom_attendance(
  'WORKSHOP_UUID'::uuid, 'CURRENTLY_STORED_WRONG_INSTANCE_UUID', true
);
```

The reset clears the duration, source UUID, and sync timestamp together for that
workshop's matching import, including registrations subsequently cancelled. It
leaves registration status and other workshops unchanged. A different stored UUID
causes an error with no writes. Reset and import use the same workshop lock to
serialize concurrent operations. Repeating a completed reset is a no-op while
the workshop has no imported attendance; an old reset cannot erase a new import
from a different UUID.

Preview the **correct** meeting with `pnpm attendance:sync`, then add `--apply`.
Registrations absent from the corrected meeting remain unverified after the reset,
instead of retaining minutes from the wrong report. If the replacement import
fails, the cleared values remain `NULL`; fix the error and retry. Do not use reset
to accumulate multiple workshop days.

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
emails, workshop scoping, NULL/cancelled statuses, changed and secondary emails,
alias collisions, repeat imports, malformed-session preservation, atomic rollback,
wrong-UUID reset/re-import, and permissions/constraints using the actual migration
in PostgreSQL.

## References

- [Zoom Meetings API, including participant reports](https://developers.zoom.us/docs/api/meetings/)
- [Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [Email display rules](https://developers.zoom.us/changelog/platform/zoom-api-email-address-display-rules/)
- [Workshop registrations PR #18](https://github.com/calblueprint/veteran-transition-support/pull/18)
