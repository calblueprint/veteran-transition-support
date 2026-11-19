import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createVerificationReview,
  skipVerification,
} from "../lib/id-verification-review.ts";

function fixture(response = {}) {
  const requests = [];
  const client = createClient("https://project.example.com", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(init.body) : null,
        });
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return { api: createVerificationReview(client), requests };
}
const submission = {
  id: "submission",
  participant_id: "participant",
  document_image_url: "participant/id-verification/id.png",
};

test("ID photos use the private bucket and a 60-second signed URL", async () => {
  const { api, requests } = fixture({
    signedURL: "/object/sign/test?token=example",
  });
  assert.match(await api.photo(submission), /object\/sign\/test/);
  assert.match(
    requests[0].url,
    /storage\/v1\/object\/sign\/participant-documents\/participant\/id-verification\/id.png$/,
  );
  assert.deepEqual(requests[0].body, { expiresIn: 60 });
  await assert.rejects(
    api.photo({
      ...submission,
      document_image_url: "other/id-verification/id.png",
    }),
  );
  assert.equal(requests.length, 1);
});

test("reviews only call the database function and trim required rejection reasons", async () => {
  const { api, requests } = fixture();
  await api.review("submission", "approve");
  await api.review("submission", "reject", "  Unreadable photo  ");
  assert.ok(
    requests.every(request =>
      request.url.endsWith("/rest/v1/rpc/review_id_verification"),
    ),
  );
  assert.deepEqual(
    requests.map(request => request.body),
    [
      { submission_id: "submission", decision: "approve", reason: null },
      {
        submission_id: "submission",
        decision: "reject",
        reason: "Unreadable photo",
      },
    ],
  );
  await assert.rejects(api.review("submission", "reject", "  "));
  await assert.rejects(api.review("submission", "reject", "a".repeat(2001)));
  assert.equal(requests.length, 2);
});

test("skip cycles all submissions without removing or mutating them", () => {
  const queue = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const next = skipVerification(queue, "a");
  assert.deepEqual(
    next.map(item => item.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(skipVerification(skipVerification(next, "b"), "c"), queue);
  assert.deepEqual(
    queue.map(item => item.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(skipVerification([queue[0]], "a"), [queue[0]]);
});
