import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceCsv,
  attendanceStats,
  loadWorkshopAttendance,
  saveWorkshopAttendance,
} from "../lib/workshop-attendance.ts";

const row = {
  id: "r1",
  participant_id: "p1",
  first_name: "Alex",
  last_name: "Example",
  attendance_status: null,
  registration_date: "2026-11-12",
};
const data = {
  workshop: { id: "w1", name: "QA Workshop", capacity: 4 },
  registrants: [
    row,
    { ...row, id: "r2", attendance_status: "attended" },
    { ...row, id: "r3", attendance_status: "no_show" },
    { ...row, id: "r4", attendance_status: "cancelled" },
  ],
};
test("statistics include NULL status and exclude cancellations from occupied capacity", () => {
  assert.deepEqual(attendanceStats(data), {
    registered: 3,
    attended: 1,
    noShow: 1,
    cancelled: 1,
    capacityFilled: 75,
  });
});
test("empty, zero, unlimited, and over-capacity data have well-defined statistics", () => {
  assert.deepEqual(attendanceStats({ ...data, registrants: [] }), {
    registered: 0,
    attended: 0,
    noShow: 0,
    cancelled: 0,
    capacityFilled: 0,
  });
  assert.equal(
    attendanceStats({ ...data, workshop: { ...data.workshop, capacity: 0 } })
      .capacityFilled,
    0,
  );
  assert.equal(
    attendanceStats({ ...data, workshop: { ...data.workshop, capacity: null } })
      .capacityFilled,
    null,
  );
  assert.equal(
    attendanceStats({ ...data, workshop: { ...data.workshop, capacity: 2 } })
      .capacityFilled,
    150,
  );
});
test("CSV quotes commas, quotes, newlines, Unicode and neutralizes formulas", () => {
  const csv = attendanceCsv({
    ...data,
    workshop: { ...data.workshop, name: 'Workshop, "QA"' },
    registrants: [
      { ...row, first_name: "=1+1", last_name: "Example" },
      { ...row, first_name: "\t@SUM(1)", last_name: "Example" },
      { ...row, first_name: 'Zoë\n"Example"', last_name: "" },
    ],
  });
  assert.ok(csv.startsWith('\uFEFF"Workshop"'));
  assert.ok(csv.includes('"Workshop, ""QA"""'));
  assert.ok(csv.includes('"\'=1+1 Example"'));
  assert.ok(csv.includes('"\'@SUM(1) Example"'));
  assert.ok(csv.includes('"Zoë\n""Example"""'));
  assert.ok(csv.endsWith("\r\n"));
});
test("roster requests are workshop scoped and use the authorized RPC", async () => {
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, "admin_workshop_attendance");
      assert.deepEqual(args, { target_workshop_id: "w1" });
      return { data, error: null };
    },
  };
  assert.deepEqual(await loadWorkshopAttendance(client, "w1"), data);
  assert.equal(
    await loadWorkshopAttendance(
      { rpc: async () => ({ data: null, error: { code: "22P02" } }) },
      "bad",
    ),
    null,
  );
});
test("save sends the original status, including NULL, for conflict detection", async () => {
  await saveWorkshopAttendance(
    {
      rpc: async (name, args) => {
        assert.equal(name, "admin_mark_workshop_attendance");
        assert.deepEqual(args, {
          target_workshop_id: "w1",
          target_registration_id: "r1",
          new_status: "attended",
          expected_status: null,
        });
        return { error: null };
      },
    },
    "w1",
    row,
    "attended",
  );
});
test("load and save fail closed with actionable access, stale, and network errors", async () => {
  for (const [code, pattern] of [
    ["42501", /Admin access/],
    ["P1004", /registration changed/],
    ["P0002", /registration changed/],
    ["500", /Could not save/],
  ]) {
    await assert.rejects(
      saveWorkshopAttendance(
        { rpc: async () => ({ error: { code } }) },
        "w1",
        row,
        "attended",
      ),
      pattern,
    );
  }
  await assert.rejects(
    loadWorkshopAttendance(
      { rpc: async () => ({ error: { code: "42501" } }) },
      "w1",
    ),
    /Admin access/,
  );
  await assert.rejects(
    loadWorkshopAttendance(
      { rpc: async () => ({ error: { code: "500" } }) },
      "w1",
    ),
    /Could not load/,
  );
});
