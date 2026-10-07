import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createParticipantData,
  DOCUMENT_BUCKET,
  documentFilename,
  MAX_DOCUMENT_BYTES,
  validateDocument,
} from "../lib/participant-data.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const personal = {
  first_name: "Test",
  last_name: "Participant",
  email: "test@example.com",
  phone_number: "4155550123",
  affiliation: "veteran",
};
const profile = {
  ...personal,
  secondary_email: null,
  military_branch: null,
  rank: null,
  mos: null,
  service_start_date: null,
  service_end_date: null,
  education_level: null,
  education_history: null,
  employment_history: null,
};

/** Exercise the real Supabase request builders while keeping network responses local. */
function fixture(
  respond = () => ({
    body: { ...profile, id: userId, verification_status: false },
  }),
) {
  const requests = [];
  const client = createClient("https://project.example.com", "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (url, init) => {
        const request = {
          url: String(url),
          method: init?.method ?? "GET",
          body:
            typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
        };
        requests.push(request);
        const { body = {}, status = 200 } = respond(request);
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  client.auth.getUser = async () => ({
    data: { user: { id: userId } },
    error: null,
  });
  return { api: createParticipantData(client), client, requests };
}

test("onboarding binds the auth ID and forces false verification, excluding injected fields", async () => {
  const { api, requests } = fixture();
  await api.createProfile(userId, {
    ...personal,
    id: otherId,
    verification_status: true,
    resume_url: "injected",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].body, {
    ...personal,
    id: userId,
    verification_status: false,
  });
});

test("profile reads and updates filter on the authenticated ID", async () => {
  const { api, requests } = fixture();
  await api.fetchProfile(userId);
  await api.saveProfile(userId, {
    ...profile,
    id: otherId,
    verification_status: true,
    resume_url: "injected",
  });
  for (const request of requests)
    assert.equal(new URL(request.url).searchParams.get("id"), `eq.${userId}`);
  assert.deepEqual(requests[1].body, profile);
  assert.equal(requests[1].method, "PATCH");
});

test("missing profiles stay distinct from read errors", async () => {
  const empty = fixture(() => ({ body: [] }));
  assert.equal(await empty.api.fetchProfile(userId), null);
  const failed = fixture(() => ({
    status: 500,
    body: { code: "failed", message: "Database unavailable" },
  }));
  await assert.rejects(failed.api.fetchProfile(userId), {
    message: "Database unavailable",
  });
});

test("a failed or no-row update is never retried as an insert", async () => {
  const { api, requests } = fixture(() => ({
    status: 406,
    body: { code: "PGRST116", message: "No row returned" },
  }));
  await assert.rejects(api.saveProfile(userId, profile));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");
});

test("a changed or expired session prevents profile and file requests", async () => {
  const { api, client, requests } = fixture();
  for (const user of [null, { id: otherId }]) {
    client.auth.getUser = async () => ({ data: { user }, error: null });
    for (const operation of [
      () => api.fetchProfile(userId),
      () => api.createProfile(userId, personal),
      () => api.saveProfile(userId, profile),
      () => api.listDocuments(userId, "resumes"),
      () =>
        api.uploadDocument(
          userId,
          "resumes",
          new File(["%PDF"], "resume.pdf", { type: "application/pdf" }),
        ),
    ])
      await assert.rejects(operation, /session changed/);
  }
  assert.equal(requests.length, 0);
});

test("upload validation checks file size, extensions, MIME conflicts, and empty files", () => {
  assert.equal(
    validateDocument(
      { name: "resume.PDF", type: "application/pdf", size: MAX_DOCUMENT_BYTES },
      "resumes",
    ),
    null,
  );
  assert.equal(
    validateDocument({ name: "resume.docx", type: "", size: 12 }, "resumes"),
    null,
  );
  for (const file of [
    { name: "resume.pdf", type: "application/pdf", size: 0 },
    {
      name: "resume.pdf",
      type: "application/pdf",
      size: MAX_DOCUMENT_BYTES + 1,
    },
    { name: "resume.html", type: "text/html", size: 12 },
    { name: "resume.pdf", type: "text/html", size: 12 },
    { name: "image.png", type: "image/png", size: 12 },
  ])
    assert.ok(validateDocument(file, "resumes"));
  assert.equal(
    validateDocument(
      { name: "document.png", type: "image/png", size: 12 },
      "documents",
    ),
    null,
  );
});

test("uploads use unique private paths and do not overwrite or issue metadata writes", async () => {
  const { api, requests } = fixture(() => ({ body: { Key: "saved" } }));
  const file = new File(["%PDF"], "Resume draft.pdf", {
    type: "application/pdf",
  });
  const first = await api.uploadDocument(userId, "resumes", file);
  const second = await api.uploadDocument(userId, "resumes", file);
  assert.notEqual(first.path, second.path);
  assert.equal(first.name, "Resume_draft.pdf");
  assert.match(
    first.path,
    new RegExp(`^${userId}/resumes/[0-9a-f-]{36}--Resume_draft.pdf$`),
  );
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every(
      request =>
        request.url.includes(`/storage/v1/object/${DOCUMENT_BUCKET}/`) &&
        request.method === "POST",
    ),
  );
  assert.equal(documentFilename("../../bad\nname.pdf"), ".._.._bad_name.pdf");
});

test("failed uploads propagate without claiming a saved document", async () => {
  const { api } = fixture(() => ({
    status: 403,
    body: { message: "Access denied" },
  }));
  await assert.rejects(
    api.uploadDocument(
      userId,
      "documents",
      new File(["%PDF"], "file.pdf", { type: "application/pdf" }),
    ),
  );
});

test("file listing paginates and reconstructs only owned folder paths", async () => {
  const { api, requests } = fixture(request => ({
    body:
      request.body.offset === 0
        ? Array.from({ length: 100 }, (_, i) => ({
            id: String(i),
            name: `${userId}--resume-${i}.pdf`,
            created_at: "2026-10-07T00:00:00Z",
          }))
        : [
            {
              id: "last",
              name: `${userId}--last.pdf`,
              created_at: "2026-10-06T00:00:00Z",
            },
          ],
  }));
  const documents = await api.listDocuments(userId, "resumes");
  assert.equal(documents.length, 101);
  assert.equal(documents[100].name, "last.pdf");
  assert.deepEqual(
    requests.map(request => request.body.offset),
    [0, 100],
  );
  assert.ok(
    requests.every(request => request.body.prefix === `${userId}/resumes`),
  );
});

test("download rejects another user's path before accessing storage", async () => {
  const { api, requests } = fixture();
  await assert.rejects(
    api.downloadDocument(userId, {
      path: `${otherId}/resumes/private.pdf`,
      name: "private.pdf",
      createdAt: "",
    }),
    /does not belong/,
  );
  assert.equal(requests.length, 0);
});
