import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeMeetingUuid, fetchZoomReport } from "../lib/zoom-report.ts";

const credentials = {
  accountId: "account",
  clientId: "client",
  clientSecret: "secret",
};
const participant = {
  user_email: "test@example.com",
  join_time: "2026-10-14T10:00:00Z",
  leave_time: "2026-10-14T10:02:00Z",
};
const json = body => Response.json(body);
const page = (rows, next = "", total = rows.length) => ({
  participants: rows,
  next_page_token: next,
  total_records: total,
});
const responses =
  (...items) =>
  async () => {
    assert.ok(items.length, "Unexpected extra request");
    return items.shift();
  };

test("authenticates with server credentials and fetches every page", async () => {
  const calls = [];
  const request = responses(
    json({ access_token: "test-token" }),
    json(page([participant], "next page", 2)),
    json(page([{ ...participant, user_email: "other@example.com" }], "", 2)),
  );
  const rows = await fetchZoomReport(
    credentials,
    "/uuid//value==",
    async (url, init) => {
      calls.push({ url: String(url), init });
      return request();
    },
  );
  assert.equal(rows.length, 2);
  assert.equal(calls[0].url, "https://zoom.us/oauth/token");
  assert.equal(calls[0].init.body.get("grant_type"), "account_credentials");
  assert.equal(calls[0].init.body.get("account_id"), "account");
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from("client:secret").toString("base64")}`,
  );
  assert.match(calls[1].url, /%252Fuuid%252F%252Fvalue%253D%253D/);
  assert.equal(calls[1].init.headers.Authorization, "Bearer test-token");
  assert.equal(
    new URL(calls[2].url).searchParams.get("next_page_token"),
    "next page",
  );
});

test("normal UUIDs are encoded once and numeric IDs are rejected", () => {
  assert.equal(encodeMeetingUuid("ab+c/def=="), "ab%2Bc%2Fdef%3D%3D");
  assert.throws(() => encodeMeetingUuid("12345678901"), /instance UUID/);
  assert.throws(() => encodeMeetingUuid(""));
});

test("failed authentication and rate limits produce safe actionable errors", async () => {
  await assert.rejects(
    fetchZoomReport(
      credentials,
      "uuid",
      responses(new Response("secret upstream content", { status: 401 })),
    ),
    error => /401/.test(error.message) && !error.message.includes("secret"),
  );
  await assert.rejects(
    fetchZoomReport(
      credentials,
      "uuid",
      responses(
        json({ access_token: "token" }),
        new Response("", { status: 429, headers: { "retry-after": "60" } }),
      ),
    ),
    /Rate limited.*60/,
  );
});

test("later page failures never return a partial report", async () => {
  await assert.rejects(
    fetchZoomReport(
      credentials,
      "uuid",
      responses(
        json({ access_token: "token" }),
        json(page([participant], "next", 2)),
        new Response("", { status: 500 }),
      ),
    ),
    /500/,
  );
});

test("rejects empty, truncated, changing, malformed, and looping reports", async () => {
  const badReports = [
    [page([])],
    [page([participant], "", 2)],
    [page([participant], "next", 2), page([participant], "", 3)],
    [{ participants: "invalid", total_records: 1 }],
    [page([{ ...participant, leave_time: null }])],
    [page([participant], "same", 3), page([participant], "same", 3)],
  ];
  for (const report of badReports) {
    await assert.rejects(
      fetchZoomReport(
        credentials,
        "uuid",
        responses(json({ access_token: "token" }), ...report.map(json)),
      ),
    );
  }
});

test("allows a missing participant email for explicit unmatched reporting", async () => {
  const rows = await fetchZoomReport(
    credentials,
    "uuid",
    responses(
      json({ access_token: "token" }),
      json(page([{ ...participant, user_email: null }])),
    ),
  );
  assert.equal(rows[0].user_email, undefined);
});
