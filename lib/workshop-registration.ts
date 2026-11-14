import type { Workshop } from "@/types/workshop";

/** A date-only end date stays upcoming through the end of that local day. */
export function isPastWorkshop(
  workshop: Pick<Workshop, "start_date" | "end_date">,
  now = new Date(),
): boolean {
  const lastDate = workshop.end_date || workshop.start_date;
  if (!lastDate) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    return lastDate < today;
  }

  const endAt = Date.parse(lastDate);
  return Number.isFinite(endAt) && endAt < now.getTime();
}
