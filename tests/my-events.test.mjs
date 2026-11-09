import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createMyEventsData,
  isPastEvent,
  localToday,
  splitEvents,
} from "../lib/my-events.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const event = (id, start_date, end_date = null) => ({
  id,
  workshop: { id: `workshop-${id}`, name: id, start_date, end_date },
});
function fixture(respond) {
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
          url: new URL(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(init.body) : null,
        };
        requests.push(request);
        const { body = [], status = 200 } = respond(request);
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
  return { client, requests, api: createMyEventsData(client) };
}

test("calendar split includes today, ongoing and undated events; sorts without mutating", () => {
  const rows = [
    event("unknown", null),
    event("later", "2030-06-20"),
    event("old", "2030-06-01"),
    event("today", "2030-06-10"),
    event("ongoing", "2030-06-08", "2030-06-11"),
    event("recent", "2030-06-09"),
  ];
  const { upcoming, past } = splitEvents(rows, "2030-06-10");
  assert.deepEqual(
    upcoming.map(row => row.id),
    ["ongoing", "today", "later", "unknown"],
  );
  assert.deepEqual(
    past.map(row => row.id),
    ["recent", "old"],
  );
  assert.equal(rows[0].id, "unknown");
  assert.equal(
    isPastEvent(event("end-today", null, "2030-06-10").workshop, "2030-06-10"),
    false,
  );
  assert.equal(localToday(new Date(2030, 0, 2, 23, 59)), "2030-01-02");
});

test("lists only current user's active registrations with joined event details", async () => {
  const { api, requests } = fixture(() => ({
    body: [event("one", "2099-01-01"), { id: "missing", workshop: null }],
  }));
  assert.equal((await api.list(userId)).length, 1);
  const params = requests[0].url.searchParams;
  assert.equal(params.get("participant_id"), `eq.${userId}`);
  assert.equal(params.get("select"), "id,workshop:workshops(*)");
  assert.equal(
    params.get("or"),
    "(attendance_status.is.null,attendance_status.neq.cancelled)",
  );
});

test("two registrations show; cancelling one persists status and removes it on reload", async () => {
  let rows = [event("one", "2099-01-01"), event("two", "2099-02-01")];
  const { api, requests } = fixture(request => {
    if (request.method === "PATCH") {
      assert.deepEqual(request.body, { attendance_status: "cancelled" });
      assert.equal(
        request.url.searchParams.get("participant_id"),
        `eq.${userId}`,
      );
      assert.equal(request.url.searchParams.get("id"), "eq.one");
      rows = rows.filter(row => row.id !== "one");
      return { body: [{ id: "one" }] };
    }
    return { body: rows };
  });
  assert.equal((await api.list(userId)).length, 2);
  await api.cancel(userId, "one");
  assert.deepEqual(
    (await api.list(userId)).map(row => row.id),
    ["two"],
  );
  assert.equal(requests.filter(row => row.method === "PATCH").length, 1);
});

for (const kind of ["signed out", "different account", "auth failure"]) {
  test(`${kind} cannot read or cancel registrations`, async () => {
    const { api, client, requests } = fixture(() => ({}));
    client.auth.getUser = async () => ({
      data: {
        user:
          kind === "signed out"
            ? null
            : { id: kind === "different account" ? "other" : userId },
      },
      error: kind === "auth failure" ? new Error("offline") : null,
    });
    await assert.rejects(api.list(userId), /session changed/);
    await assert.rejects(api.cancel(userId, "one"), /session changed/);
    assert.equal(requests.length, 0);
  });
}

for (const rows of [[], [event("one", "2000-01-01")]]) {
  test(`rejects cancellation of ${rows.length ? "past" : "missing or other user's"} registration`, async () => {
    const { api, requests } = fixture(() => ({ body: rows }));
    await assert.rejects(
      api.cancel(userId, "one"),
      /cannot be cancelled|no longer available/,
    );
    assert.equal(requests.length, 1);
  });
}

test("query errors are retryable and do not appear as an empty list", async () => {
  const { api } = fixture(() => ({ status: 403, body: { message: "denied" } }));
  await assert.rejects(api.list(userId), /Could not load/);
});

for (const status of [200, 403]) {
  test(`failed or zero-row cancellation (${status}) does not claim success`, async () => {
    const { api } = fixture(request =>
      request.method === "PATCH"
        ? { status, body: status === 200 ? [] : { message: "denied" } }
        : { body: [event("one", "2099-01-01")] },
    );
    await assert.rejects(api.cancel(userId, "one"), /Could not cancel/);
  });
}

test("account switch between read and write prevents cancellation", async () => {
  const { api, client, requests } = fixture(() => ({
    body: [event("one", "2099-01-01")],
  }));
  let calls = 0;
  client.auth.getUser = async () => ({
    data: { user: { id: ++calls === 1 ? userId : "other" } },
    error: null,
  });
  await assert.rejects(api.cancel(userId, "one"), /session changed/);
  assert.equal(requests.length, 1);
});
