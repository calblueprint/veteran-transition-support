export type Workshop = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  eventbrite_event_id: string | null;
  capacity: number | null;
  location: string | null;
};

export type CreateWorkshopInput = Omit<Workshop, "id" | "eventbrite_event_id">;
