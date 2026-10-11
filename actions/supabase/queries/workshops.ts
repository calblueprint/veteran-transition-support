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

export async function fetchWorkshop(id: string): Promise<Workshop> {
  const { data, error } = await supabase
    .from("workshops")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Could not load workshop: ${error.message}`);
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

export async function updateWorkshop(
  id: string,
  workshop: CreateWorkshopInput,
): Promise<void> {
  const { error } = await supabase
    .from("workshops")
    .update(workshop)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not update workshop: ${error.message}`);
  }
}

export async function deleteWorkshop(id: string): Promise<void> {
  const { error } = await supabase
    .from("workshops")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not delete workshop: ${error.message}`);
  }
}
