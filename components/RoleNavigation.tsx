"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function RoleNavigation() {
  const { user, isAdmin, loading } = useAuth();

  if (loading || !user) {
    return null;
  }

  return (
    <nav aria-label="Main navigation">
      {isAdmin ? (
        <Link href="/workshops">Admin Workshops</Link>
      ) : (
        <Link href="/profile">My Profile</Link>
      )}
    </nav>
  );
}
