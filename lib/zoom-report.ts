import type { ZoomParticipant } from "./zoom-attendance";

type ZoomCredentials = {
  accountId: string;
  clientId: string;
  clientSecret: string;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Zoom returned an invalid response; nothing was saved.");
  }
  return value as Record<string, unknown>;
}

async function readResponse(response: Response) {
  if (!response.ok) {
    const advice =
      response.status === 429
        ? `Rate limited; retry later (Retry-After: ${response.headers.get("retry-after") ?? "not provided"}).`
        : response.status === 401 || response.status === 403
          ? "Check the app activation, report scopes, account permissions, and paid Zoom license."
          : "Check that the meeting has ended and its report is ready.";
    // Do not echo upstream bodies: they can contain credentials or personal data.
    throw new Error(`Zoom request failed (${response.status}). ${advice}`);
  }
  return object(await response.json());
}

/** Raw meeting instance UUID, not a reusable numeric meeting ID. */
export function encodeMeetingUuid(uuid: string) {
  if (!uuid.trim() || /^\d+$/.test(uuid) || uuid !== uuid.trim()) {
    throw new Error(
      "Use the raw Zoom meeting instance UUID, not the meeting number.",
    );
  }
  const encoded = encodeURIComponent(uuid);
  return uuid.startsWith("/") || uuid.includes("//")
    ? encodeURIComponent(encoded)
    : encoded;
}

export async function fetchZoomReport(
  credentials: ZoomCredentials,
  meetingUuid: string,
  request: typeof fetch = fetch,
): Promise<ZoomParticipant[]> {
  const meetingPath = encodeMeetingUuid(meetingUuid);
  if (Object.values(credentials).some(value => !value.trim())) {
    throw new Error(
      "Zoom account ID, client ID, and client secret are required.",
    );
  }
  const token = await readResponse(
    await request("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "account_credentials",
        account_id: credentials.accountId,
      }),
      signal: AbortSignal.timeout(30_000),
    }),
  );
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("Zoom did not return an access token.");
  }

  const participants: ZoomParticipant[] = [];
  const seenTokens = new Set<string>();
  let nextPage = "";
  let expectedTotal: number | undefined;
  do {
    const url = new URL(
      `https://api.zoom.us/v2/report/meetings/${meetingPath}/participants`,
    );
    url.searchParams.set("page_size", "300");
    if (nextPage) url.searchParams.set("next_page_token", nextPage);
    const page = await readResponse(
      await request(url, {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (
      !Array.isArray(page.participants) ||
      !Number.isSafeInteger(page.total_records) ||
      (page.total_records as number) < 0 ||
      (page.next_page_token !== undefined &&
        typeof page.next_page_token !== "string")
    ) {
      throw new Error(
        "Zoom returned an invalid report page; nothing was saved.",
      );
    }
    expectedTotal ??= page.total_records as number;
    if (page.total_records !== expectedTotal) {
      throw new Error(
        "Zoom report changed during pagination; retry when processing finishes.",
      );
    }
    for (const row of page.participants) {
      const participant = object(row);
      if (
        (participant.user_email != null &&
          typeof participant.user_email !== "string") ||
        typeof participant.join_time !== "string" ||
        typeof participant.leave_time !== "string"
      ) {
        throw new Error(
          "Zoom returned an invalid participant row; nothing was saved.",
        );
      }
      participants.push({
        user_email: (participant.user_email as string | null) ?? undefined,
        join_time: participant.join_time,
        leave_time: participant.leave_time,
      });
    }
    nextPage = (page.next_page_token as string) ?? "";
    if (
      nextPage &&
      (seenTokens.has(nextPage) || participants.length >= expectedTotal)
    ) {
      throw new Error(
        "Zoom returned inconsistent pagination; nothing was saved.",
      );
    }
    seenTokens.add(nextPage);
  } while (nextPage);

  if (participants.length !== expectedTotal || !participants.length) {
    throw new Error(
      "Zoom report is empty or incomplete; retry after the report is ready.",
    );
  }
  return participants;
}
