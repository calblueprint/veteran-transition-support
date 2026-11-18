"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jobAdminAccess } from "@/lib/job-admin-access";
import { supabase } from "@/lib/supabase";

export default function JobsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let generation = 0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const request = ++generation;
      const userId = session?.user.id;
      setAdmin(current => (current === userId ? current : null));
      setFailed(false);
      // Make the membership request after the auth callback releases its lock.
      setTimeout(async () => {
        if (request !== generation) return;
        const access = await jobAdminAccess(userId, () =>
          supabase.rpc("can_manage_jobs"),
        );
        if (request !== generation) return;
        if (access.admin) setAdmin(access.admin);
        else {
          setAdmin(null);
          if (access.redirect) router.replace(access.redirect);
          else setFailed(true);
        }
      }, 0);
    });
    return () => {
      generation++;
      subscription.unsubscribe();
    };
  }, [router]);

  if (failed)
    return (
      <p role="alert">Could not check admin access. Reload to try again.</p>
    );
  if (!admin) return <p role="status">Checking admin access…</p>;
  return <Fragment key={admin}>{children}</Fragment>;
}
