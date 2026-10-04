import type { CreateWorkshopInput, Workshop } from "@/types/workshop";
import supabase from "../client";

export async function fetchWorkshops(): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .order("start_date", {
      ascending: true,
      nullsFirst: false,
    });

  if (error) {
    throw new Error(`Could not load workshops: ${error.message}`);
  }

  return data;
}

export async function createWorkshop(
  workshop: CreateWorkshopInput,
): Promise<void> {
  const { error } = await supabase.from("workshops").insert(workshop);

  if (error) {
    throw new Error(`Could not create workshop: ${error.message}`);
  }
}
