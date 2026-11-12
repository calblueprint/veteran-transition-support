export type ZoomParticipant = {
  user_email?: string;
  join_time: string;
  leave_time: string;
};

export type AttendanceTotal = {
  email: string;
  attendance_duration_minutes: number;
};

/** Count time present, merging overlaps from duplicate rows or multiple devices. */
export function calculateAttendance(participants: ZoomParticipant[]) {
  const intervals = new Map<string, [number, number][]>();
  let missingEmailCount = 0;

  for (const [index, participant] of participants.entries()) {
    const email = participant.user_email?.trim().toLowerCase();
    if (!email) {
      missingEmailCount++;
      continue;
    }

    const start = Date.parse(participant.join_time);
    const end = Date.parse(participant.leave_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new Error(
        `Invalid join/leave timestamps in report row ${index + 1}; nothing was saved.`,
      );
    }
    const sessions = intervals.get(email) ?? [];
    sessions.push([start, end]);
    intervals.set(email, sessions);
  }

  const totals: AttendanceTotal[] = [];
  for (const [email, sessions] of intervals) {
    sessions.sort((a, b) => a[0] - b[0]);
    let [start, end] = sessions[0];
    let milliseconds = 0;
    for (const [nextStart, nextEnd] of sessions.slice(1)) {
      if (nextStart <= end) {
        end = Math.max(end, nextEnd);
      } else {
        milliseconds += end - start;
        [start, end] = [nextStart, nextEnd];
      }
    }
    milliseconds += end - start;
    totals.push({
      email,
      attendance_duration_minutes: Math.round(milliseconds / 600) / 100,
    });
  }
  return { totals, missingEmailCount };
}
