import type { Workshop, WorkshopSeries } from "@/types/workshop";
import supabase from "../client";
import { fetchWorkshopRegistrationCount } from "./workshops";

export type SeriesWithCount = WorkshopSeries & { workshop_count: number };
export type SeriesInput = { name: string; description: string | null };

// Turns a database error into a message the admin can act on.
function seriesErrorMessage(error: { code: string }, fallback: string): string {
  if (error.code === "42501")
    return "Only admins can create or edit series. Please check that you’re logged in with an admin account.";
  if (error.code === "23514") return "Please enter a series name.";
  return fallback;
}

// Checks the form and trims it into the shape saved in the database.
export function validateSeriesForm(formData: FormData): SeriesInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Please enter a series name.");
  return {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
  };
}

export async function fetchSeriesList(): Promise<WorkshopSeries[]> {
  const { data, error } = await supabase
    .from("workshop_series")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error("Could not load series. Please try again.");
  return data;
}

export async function fetchSeriesWithCounts(): Promise<SeriesWithCount[]> {
  // "workshops(count)" asks Supabase to count each series' workshops.
  const { data, error } = await supabase
    .from("workshop_series")
    .select("*, workshops(count)")
    .order("name", { ascending: true })
    .returns<(WorkshopSeries & { workshops: { count: number }[] })[]>();
  if (error) throw new Error("Could not load series. Please try again.");
  return data.map(({ workshops, ...series }) => ({
    ...series,
    workshop_count: workshops[0]?.count ?? 0,
  }));
}

export async function fetchSeries(id: string): Promise<WorkshopSeries | null> {
  const { data, error } = await supabase
    .from("workshop_series")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  // A malformed id shows the same not-found screen as a missing series.
  if (error?.code === "22P02") return null;
  if (error) throw new Error("Could not load series. Please try again.");
  return data;
}

export async function fetchSeriesWorkshops(id: string): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .eq("series_id", id)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error)
    throw new Error("Could not load the series workshops. Please try again.");
  return data;
}

// Adds up active registrations across the given workshops.
export async function fetchSeriesRegistrationTotal(
  workshops: Workshop[],
): Promise<number> {
  const counts = await Promise.all(
    workshops.map(workshop => fetchWorkshopRegistrationCount(workshop.id)),
  );
  return counts.reduce((total, count) => total + count, 0);
}

export async function createSeries(series: SeriesInput): Promise<void> {
  const { error } = await supabase.from("workshop_series").insert(series);
  if (error)
    throw new Error(
      seriesErrorMessage(error, "Could not create series. Please try again."),
    );
}

export async function updateSeries(
  id: string,
  series: SeriesInput,
): Promise<void> {
  const { data, error } = await supabase
    .from("workshop_series")
    .update(series)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error)
    throw new Error(
      seriesErrorMessage(error, "Could not update series. Please try again."),
    );
  // RLS hides rows from non-admins instead of returning an error.
  if (!data)
    throw new Error(
      "Series not found or you don’t have permission to update it.",
    );
}
