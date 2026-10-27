import type { CreateWorkshopInput } from "@/types/workshop";

export const MAX_WORKSHOP_CAPACITY = 2147483647;

export function validateWorkshopForm(
  formData: FormData,
  registeredCount = 0,
): CreateWorkshopInput {
  const text = (field: string) => String(formData.get(field) ?? "").trim();
  const name = text("name");
  const startDate = text("start_date");
  const endDate = text("end_date");
  const capacityText = text("capacity");
  const capacity = capacityText === "" ? null : Number(capacityText);

  if (!name) throw new Error("Please enter a workshop name.");

  for (const date of [startDate, endDate]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date.startsWith("0000") ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    ) {
      throw new Error("Please enter valid workshop dates.");
    }
  }

  if (startDate && endDate && endDate < startDate) {
    throw new Error("End date cannot be before start date.");
  }

  if (
    capacity !== null &&
    (!Number.isInteger(capacity) ||
      capacity < 0 ||
      capacity > MAX_WORKSHOP_CAPACITY)
  ) {
    throw new Error(
      "Capacity must be a whole number between 0 and 2,147,483,647.",
    );
  }

  if (capacity !== null && capacity < registeredCount) {
    throw new Error(
      `Capacity cannot be lower than the ${registeredCount} active registrations.`,
    );
  }

  return {
    name,
    description: text("description") || null,
    start_date: startDate || null,
    end_date: endDate || null,
    capacity,
    location: text("location") || null,
  };
}
