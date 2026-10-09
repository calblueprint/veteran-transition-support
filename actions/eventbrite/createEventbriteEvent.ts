"use server";

// Server action: runs only on the server, so the Eventbrite token never reaches the browser.
import type { CreateWorkshopInput } from "@/types/workshop";

const EVENTBRITE_API = "https://www.eventbriteapi.com/v3";

// Workshops only store dates (no times), so every event gets this placeholder
// time window until the form collects real start/end times.
const TIMEZONE = "America/Los_Angeles";
const START_TIME_UTC = "16:00:00"; // 9am Pacific (during daylight time)
const END_TIME_UTC = "23:00:00"; // 4pm Pacific (during daylight time)

// Small helper that calls Eventbrite with our token and returns the parsed JSON.
// Throws an error with Eventbrite's own message if the request fails.
async function eventbriteRequest(path: string, body?: unknown) {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) {
    throw new Error("EVENTBRITE_API_TOKEN is not set in .env.local");
  }

  const response = await fetch(`${EVENTBRITE_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `${response.status} ${data.error_description ?? data.error ?? "unknown error"}`,
    );
  }
  return data;
}

// Creates a draft Eventbrite event that matches the workshop and returns its id.
export async function createEventbriteEvent(
  workshop: CreateWorkshopInput,
): Promise<string> {
  // Eventbrite requires a start date, so workshops without one can't be synced.
  if (!workshop.start_date) {
    throw new Error("workshop has no start date");
  }
  // If there is no end date, the event ends on the same day it starts.
  const endDate = workshop.end_date ?? workshop.start_date;

  // Events belong to an organization, so look up the token owner's organization.
  const orgs = await eventbriteRequest("/users/me/organizations/");
  if (orgs.organizations.length === 0) {
    throw new Error("this Eventbrite account has no organization");
  }
  const organizationId = orgs.organizations[0].id;

  // Eventbrite descriptions are HTML; location is added here because a real
  // Eventbrite venue would need a separate API call.
  const description = [workshop.description, workshop.location]
    .filter(Boolean)
    .join(" | ");

  const event = await eventbriteRequest(
    `/organizations/${organizationId}/events/`,
    {
      event: {
        name: { html: workshop.name },
        description: { html: description },
        start: {
          timezone: TIMEZONE,
          utc: `${workshop.start_date}T${START_TIME_UTC}Z`,
        },
        end: { timezone: TIMEZONE, utc: `${endDate}T${END_TIME_UTC}Z` },
        currency: "USD",
        // Eventbrite rejects a capacity of 0, so only send positive values.
        capacity:
          workshop.capacity && workshop.capacity > 0
            ? workshop.capacity
            : undefined,
      },
    },
  );

  return event.id;
}
