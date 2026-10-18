"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchParticipants } from "@/actions/supabase/queries/participants";
import { ParticipantListItem } from "@/types/participant";

export default function ParticipantsPage() {
  const [participants, setParticipants] = useState<ParticipantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadParticipants() {
      setLoading(true);
      setError(null);

      try {
        const rows = await fetchParticipants(search);

        if (!ignore) {
          setParticipants(rows);
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Could not load participants.",
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadParticipants();

    return () => {
      ignore = true;
    };
  }, [search]);

  return (
    <main>
      <h1>Participants</h1>

      <form
        onSubmit={event => {
          event.preventDefault();
          setSearch(searchInput.trim());
        }}
      >
        <label htmlFor="participant-search">Search by name or email</label>
        <input
          id="participant-search"
          type="search"
          value={searchInput}
          onChange={event => setSearchInput(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {loading ? (
        <p role="status">Loading participants...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : participants.length === 0 ? (
        <p>No participants found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Record</th>
            </tr>
          </thead>
          <tbody>
            {participants.map(participant => (
              <tr key={participant.id}>
                <td>
                  {participant.first_name} {participant.last_name}
                </td>
                <td>{participant.email}</td>
                <td>
                  <Link href={`/participants/${participant.id}`}>
                    View record
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
