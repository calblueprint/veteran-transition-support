// Run only with three dedicated test accounts in a test Supabase project.
// node --env-file=.env.local --env-file=.env.qa.local --experimental-strip-types scripts/verify-id-review.mjs
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createVerificationReview } from "../lib/id-verification-review.ts";
import { createParticipantData } from "../lib/participant-data.ts";

function required(name) {
  assert.ok(
    process.env[name],
    `Set ${name} in .env.qa.local (never commit test credentials).`,
  );
  return process.env[name];
}
const url = required("NEXT_PUBLIC_SUPABASE_URL");
const key = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
function client() {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
async function login(prefix) {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({
    email: required(`${prefix}_EMAIL`),
    password: required(`${prefix}_PASSWORD`),
  });
  assert.ifError(error);
  return { db, user: data.user, participant: createParticipantData(db) };
}
const accounts = [];
try {
  const admin = await login("QA_ADMIN");
  accounts.push(admin);
  const approve = await login("QA_APPROVE");
  accounts.push(approve);
  const reject = await login("QA_REJECT");
  accounts.push(reject);
  assert.equal(
    new Set(accounts.map(account => account.user.id)).size,
    3,
    "Use three different accounts.",
  );
  const reviewer = createVerificationReview(admin.db);
  await reviewer.pending(); // Fail before uploading if the migration or admin membership is missing.
  for (const account of [approve, reject]) {
    const { data: membership, error } = await account.db
      .from("admin_users")
      .select("id")
      .eq("id", account.user.id);
    assert.ifError(error);
    assert.equal(
      membership.length,
      0,
      "Participant test accounts must not be admins.",
    );
    let profile = await account.participant.fetchProfile(account.user.id);
    if (!profile)
      profile = await account.participant.createProfile(account.user.id, {
        first_name: "QA",
        last_name: account === approve ? "Approval" : "Rejection",
        email: account.user.email,
        phone_number: "4155550123",
        affiliation: "veteran",
      });
    assert.equal(
      profile.verification_status,
      false,
      "Use a fresh, unverified participant.",
    );
    assert.equal(
      await account.participant.fetchLatestIdVerification(account.user.id),
      null,
      "Use a participant with no existing submissions.",
    );
  }
  // Synthetic 1×1 PNG: never upload a real ID for this smoke test.
  const photo = () =>
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      "qa-synthetic-id.png",
      { type: "image/png" },
    );
  await approve.participant.submitIdVerification(approve.user.id, photo());
  await reject.participant.submitIdVerification(reject.user.id, photo());
  const queue = await reviewer.pending();
  const approval = queue.find(row => row.participant_id === approve.user.id);
  const rejection = queue.find(row => row.participant_id === reject.user.id);
  assert.ok(
    approval && rejection,
    "Both submissions appear in the pending queue.",
  );
  console.log("PASS: two participant uploads appear in the admin queue.");
  const signedUrl = await reviewer.photo(approval);
  assert.equal((await fetch(signedUrl)).status, 200);
  const ownPhoto = await approve.db.storage
    .from("participant-documents")
    .download(approval.document_image_url);
  assert.ifError(ownPhoto.error);
  const otherPhoto = await reject.db.storage
    .from("participant-documents")
    .download(approval.document_image_url);
  assert.ok(otherPhoto.error, "Another participant must not read this photo.");
  const otherSigned = await reject.db.storage
    .from("participant-documents")
    .createSignedUrl(approval.document_image_url, 60);
  assert.ok(otherSigned.error, "Another participant must not sign this photo.");
  const deniedReview = await reject.db.rpc("review_id_verification", {
    submission_id: approval.id,
    decision: "approve",
  });
  assert.equal(deniedReview.error?.code, "42501");
  const selfVerify = await reject.db
    .from("participants")
    .update({ verification_status: true })
    .eq("id", reject.user.id);
  assert.ok(selfVerify.error);
  console.log(
    "PASS: admin can view the photo; another participant cannot read/sign it, review, or self-verify.",
  );
  const invalidReason = await admin.db.rpc("review_id_verification", {
    submission_id: rejection.id,
    decision: "reject",
    reason: " ",
  });
  assert.equal(invalidReason.error?.code, "22023");
  await reviewer.review(approval.id, "approve");
  await reviewer.review(rejection.id, "reject", "QA: upload a clearer photo.");
  assert.equal(
    (await approve.participant.fetchProfile(approve.user.id))
      .verification_status,
    true,
  );
  assert.deepEqual(
    await reject.participant.fetchLatestIdVerification(reject.user.id),
    {
      verification_status: "failed",
      rejection_reason: "QA: upload a clearer photo.",
    },
  );
  assert.equal(
    (await reject.participant.fetchProfile(reject.user.id)).verification_status,
    false,
  );
  for (const account of [approve, reject]) {
    const { data, error } = await account.db
      .from("id_verifications")
      .select("reviewed_by, reviewed_at")
      .eq("participant_id", account.user.id)
      .single();
    assert.ifError(error);
    assert.equal(data.reviewed_by, admin.user.id);
    assert.ok(data.reviewed_at);
  }
  const handled = await reviewer.pending();
  assert.ok(
    !handled.some(row => row.id === approval.id || row.id === rejection.id),
  );
  console.log(
    "PASS: approve verifies the participant; reject exposes the reason; audit fields are recorded; handled items leave the queue.",
  );
  await reject.participant.submitIdVerification(reject.user.id, photo());
  assert.equal(
    (await reject.participant.fetchLatestIdVerification(reject.user.id))
      .verification_status,
    "pending",
  );
  assert.ok(
    (await reviewer.pending()).some(
      row => row.participant_id === reject.user.id,
    ),
  );
  console.log(
    "PASS: rejected participant resubmits and returns to the pending queue.",
  );
  console.log(
    "Test records retained for UI inspection. Open /verifications as QA_ADMIN and /profile as each participant.",
  );
} finally {
  for (const account of accounts) await account.db.auth.signOut();
}
