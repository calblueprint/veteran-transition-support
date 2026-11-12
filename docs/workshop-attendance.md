# Workshop attendance

Admins open **Workshops → workshop name** at `/workshops/[id]` to see the roster,
record attended/no-show, clear an incorrect mark, and export the displayed roster
as CSV. Cancelled registrations are history and cannot be marked.

## Counts

- **Registered:** all non-cancelled registration records, including unmarked,
  attended, no-show, and legacy NULL status.
- **Attended / No-show:** records with the corresponding attendance status.
- **Cancelled:** cancelled registration records, including prior cancellations
  when someone subsequently registers again.
- **Capacity filled:** registered ÷ capacity, rounded to the nearest percent.
  Unlimited capacity displays **Unlimited**; zero capacity displays **0%**.
  Attendance does not release a place. An over-capacity legacy workshop displays
  its actual percentage instead of hiding it at 100%.

## Database and security

**Applied to hosted VTS on November 11, 2026 (Pacific time)** with version
`20261112000000` recorded in migration history. Do not rerun it there. In other
environments, apply `supabase/migrations/20261112000000_admin_workshop_attendance.sql`
after the existing migrations and before deploying this frontend. It uses the existing
`admin_users` membership table and `attendance_status` enum; the hosted VTS enum
already contains all four required values.

The read RPC returns only workshop details, registration identifiers/dates,
participant names, and attendance. It aggregates the whole roster in PostgreSQL,
so the API's default 1,000-row limit cannot silently truncate statistics or CSV.
Participant profile policies remain unchanged. Existing admin reads of
registrations, including participant-record views, are preserved.

Both RPCs check `auth.uid()` against `admin_users` on every call. The update RPC
locks the requested registration, verifies its workshop and previous status, and
rejects stale changes or cancellations. Revoked admins immediately lose RPC
access even if their page is still open.

Restrictive registration policies contain the existing development allow-all
policy. Participants can read and create their own registrations and cancel an
unmarked registration. They cannot insert attendance marks, change an existing
mark (including cancelling or clearing it), change registration identity, revive
cancelled history, or delete records. Re-registration creates a fresh row and
continues to use the existing uniqueness/capacity checks. Browser roles cannot
create, alter, or remove admin membership. Trusted database/backend roles retain
access, including the separate Zoom importer in PR #25.

Failed saves require a refresh before another write or export. A saved update
whose follow-up read fails is reported explicitly. CSV quotes every cell,
includes a UTF-8 BOM, and neutralizes leading spreadsheet formulas.

## Route integration

Next.js route groups do not create distinct URLs. The existing participant page
at `(participant)/workshops/[id]` conflicted with the required admin detail URL.
It is moved unchanged to `(participant)/events/[id]`, and My Workshops links are
updated. `/workshops/[id]` is now admin-only; old participant bookmarks should
use `/events/[id]`. Coordinate this same link change with open My Events PR #44
and the parallel workshop-list/events work.

The nested workshop layout no longer requires optional military/education
profile fields. Its parent `AdminLayout` remains the server-side admin gate.

## Verification

Run `pnpm test`, `pnpm tsc`, `pnpm lint`, `pnpm prettier`, and
`pnpm exec next build --webpack`.

The PostgreSQL integration test applies the existing capacity/uniqueness and
profile migrations plus the new migration, registers four fictional participants
under separate authenticated identities, cancels one, records attendance as an
admin without a participant profile, and verifies persisted counts. It exercises
anonymous/participant denial, insert/upsert attacks, protected identity/history,
self-promotion, membership revocation, stale writes, workshop scoping, legacy
NULL status, re-registration, and a roster larger than 1,000 rows.

For browser acceptance, use fictional users and a labeled QA workshop:

1. Register four participants for capacity four, cancel one, and confirm
   Registered **3**, Cancelled **1**, Capacity filled **75%**.
2. Mark one attended and another no-show. Reload: Attended **1**, No-show **1**,
   Registered **3**. Correct a mark and use Clear mark.
3. Export CSV and compare every record and status with the roster. Check desktop
   and a 390px mobile viewport.
4. Sign in as a participant: `/workshops/[id]` redirects away; `/events/[id]`
   still permits registration. Direct admin RPCs and forged attendance writes
   must fail, and another participant's registrations must remain invisible.
5. Check empty/missing workshops and refresh/error recovery. Revoke the temporary
   test admin after completing QA.

### Live verification completed

The production build was tested against hosted VTS with four fictional
participant accounts and a temporary admin without a participant profile.
Alex registered through `/events/[id]`; the other participants registered using
their own authenticated public API clients. Drew cancelled before attendance
was marked. The roster persisted **3 registered, 1 attended, 1 no-show,
1 cancelled, 75% filled** after reload.

Verified the list-to-detail link, Clear mark, stale-update rejection and refresh
recovery, empty/unlimited and invalid-ID states, the exported CSV's four unique
records/statuses, and participant redirect away from the admin URL. Direct live
API checks rejected participant/anonymous admin RPC calls, forged status updates
and inserts, cross-user reads/updates, and self-promotion. The roster was unchanged
after these rejected requests. Anonymous HTTP requests redirect to `/login`.

The responsive page was checked in a **390 CSS px iframe viewport**, with both
page and roster fitting without horizontal overflow. Screenshots in
`docs/screenshots/workshop-attendance-*.jpg` show actual hosted QA data.

Cleanup removed the temporary admin membership and disabled all five QA Auth
accounts. The two `[QA #49]` workshops and four fictional registration records
remain for reproducibility. Existing real workshop/profile/registration rows
were not edited. The new access rules remain installed as described above.
