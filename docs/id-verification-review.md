# ID verification review

Apply `supabase/migrations/20261119000000_admin_id_verification_review.sql`
using the Supabase SQL editor or the project's migration workflow **before**
deploying the app changes. It assumes the existing `admin_users.id` and
`id_verifications.id` are UUIDs and the earlier onboarding/upload migrations
have been applied. No service key is needed in the app.

The migration adds reviewer, review time, and rejection reason; provides an
admin-only queue RPC and review RPC; and separates storage read permissions
from write permissions. It also prevents client-side admin enrollment and
constrains any existing permissive ID policies. Admin membership must continue
to be managed by a trusted database role.

Open `/verifications` from Admin Workshops. Select Review to fetch a signed
photo URL valid for 60 seconds. Refresh photo requests a new URL. Approve and
Reject use `review_id_verification`; reject requires 1–2000 nonblank characters.
Skip moves the row to the end of the current browser session's queue without
writing to the database. Refreshing the queue restores oldest-first ordering.
`manual_review` submissions are included alongside `pending` submissions.

Approval stores `verified` and sets the participant's verification flag. Rejection
stores the existing status value `failed`, presented as “Rejected” in the profile.
The profile shows the reason and allows another upload. Refresh the profile after
an admin reviews it to see the latest status. Duplicate pending uploads are blocked;
rejected history is retained. Existing duplicate pending rows are not deleted.

## Automated evidence

Run `pnpm test`. `tests/id-verification-migration.test.mjs` applies the SQL to
isolated PostgreSQL (PGlite), using participant/admin/anonymous roles and deliberately
broad legacy policies. It verifies submission, approval, rejection, audit fields,
required reasons, repeated-review denial, resubmission, direct-write denial,
admin-enrollment denial, and photo read/write restrictions.
`tests/id-verification-review.test.mjs` checks the real Supabase SDK requests for
60-second signing, RPC-only review actions, and skip cycling. These are not a
substitute for a live Supabase Storage/Auth test.

## Live Supabase proof

Use a test project with the migration applied and three dedicated confirmed Auth
accounts. Add only the admin account's UUID to `admin_users` using your normal
trusted admin provisioning process. The two participants must have no prior ID
submissions and must be unverified. The script creates their profiles if needed.

Create an ignored `.env.qa.local` with these six variables (the project URL and
anon key remain in `.env.local`):

```dotenv
QA_ADMIN_EMAIL=...
QA_ADMIN_PASSWORD=...
QA_APPROVE_EMAIL=...
QA_APPROVE_PASSWORD=...
QA_REJECT_EMAIL=...
QA_REJECT_PASSWORD=...
```

```sh
node --env-file=.env.local --env-file=.env.qa.local --experimental-strip-types scripts/verify-id-review.mjs
```

The script uses a synthetic PNG, submits through participant sessions, checks an
actual signed-photo HTTP response, denies another participant's download/signing
and review attempts, approves one submission, rejects the other, checks audit
fields and profile status, then resubmits the rejected participant. Test records
are intentionally retained for UI inspection; use fresh participant accounts for
each run. It never prints passwords or signed URLs.

For UI QA, sign in as the admin and open `/verifications`; verify name, affiliation,
date, photo refresh after expiry, and Skip cycling. Sign in as each participant
and open `/profile`. To inspect the rejected UI after the script's final resubmission,
reject that new row in the UI with a reason, then reload the participant profile
and use Resubmit ID photo. A participant opening `/verifications` must redirect
to `/profile`.

Live proof is still required after applying the migration: this workspace has
public app credentials but no test-account logins or database migration credentials.
