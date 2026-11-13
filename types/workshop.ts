export type Workshop = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  eventbrite_event_id: string | null;
  capacity: number | null;
  location: string | null;
  series_id: string | null;
};

export type CreateWorkshopInput = Omit<Workshop, "id" | "eventbrite_event_id">;

export type WorkshopSeries = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};
