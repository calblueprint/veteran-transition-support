"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function SignOutButton() {
  const { signOut } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setError("");
    setLoading(true);

    try {
      await signOut();
    } catch {
      setError("Unable to log out. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignOut} disabled={loading}>
        {loading ? "Logging out..." : "Log Out"}
      </button>

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
    </div>
  );
}
