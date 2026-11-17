import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAttendance } from "../lib/zoom-attendance.ts";

const session = (email, start, end) => ({
  user_email: email,
  join_time: `2026-10-14T10:${start}Z`,
  leave_time: `2026-10-14T10:${end}Z`,
});

test("totals rejoins by normalized email and rounds only after summing", () => {
  assert.deepEqual(
    calculateAttendance([
      session(" Person@example.com ", "00:00", "01:20"),
      session("person@EXAMPLE.com", "05:00", "06:20"),
      session("other@example.com", "10:00", "11:30"),
    ]),
    {
      totals: [
        { email: "person@example.com", attendance_duration_minutes: 2.67 },
        { email: "other@example.com", attendance_duration_minutes: 1.5 },
      ],
      missingEmailCount: 0,
    },
  );
});

test("duplicate, overlapping, nested, and adjacent sessions count time only once", () => {
  const result = calculateAttendance([
    session("a@example.com", "02:00", "05:00"),
    session("a@example.com", "00:00", "03:00"),
    session("a@example.com", "00:00", "03:00"),
    session("a@example.com", "01:00", "02:00"),
    session("a@example.com", "05:00", "06:00"),
  ]);
  assert.equal(result.totals[0].attendance_duration_minutes, 6);
});

test("missing emails are reported and never matched by name", () => {
  const result = calculateAttendance([
    { ...session(undefined, "00:00", "01:00"), name: "a@example.com" },
    session(" ", "00:00", "01:00"),
  ]);
  assert.deepEqual(result, { totals: [], missingEmailCount: 2 });
});

test("invalid timestamps or negative durations fail before persistence", () => {
  assert.throws(() =>
    calculateAttendance([session("a@example.com", "05:00", "01:00")]),
  );
  assert.throws(() =>
    calculateAttendance([session("a@example.com", "invalid", "01:00")]),
  );
});

test("zero duration is retained and seconds are converted to minutes", () => {
  const result = calculateAttendance([
    session("a@example.com", "00:00", "00:00"),
    session("b@example.com", "00:00", "00:30"),
  ]);
  assert.deepEqual(
    result.totals.map(row => row.attendance_duration_minutes),
    [0, 0.5],
  );
});
