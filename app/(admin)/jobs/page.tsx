"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  apply_link: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [message, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const rows: Job[] = [];
      const pageSize = 100;
      for (;;) {
        const { data, error } = await supabase
          .from("jobs")
          .select("id,title,company,location,description,apply_link")
          .order("created_at", { ascending: false })
          .order("id")
          .range(rows.length, rows.length + pageSize - 1);
        if (!active) return;
        if (error) {
          setError("Could not load jobs. Reload to try again.");
          return;
        }
        rows.push(...data);
        if (data.length < pageSize) break;
      }
      setJobs(rows);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function remove(job: Job) {
    if (!window.confirm(`Delete “${job.title}” from the job board?`)) return;
    setDeleting(job.id);
    setError("");
    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", job.id)
      .select("id")
      .single();
    if (error) setError("Could not delete this job. Reload and try again.");
    else setJobs(current => current?.filter(row => row.id !== job.id) ?? null);
    setDeleting(null);
  }

  return (
    <main>
      <h1>Jobs</h1>
      <Link href="/jobs/new">Post a job</Link>
      {message && <p role="alert">{message}</p>}
      {!jobs && !message && <p role="status">Loading jobs…</p>}
      {jobs?.length === 0 && <p>No jobs posted yet.</p>}
      {jobs?.map(job => (
        <article key={job.id}>
          <h2>{job.title}</h2>
          <p>
            {job.company} · {job.location}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{job.description}</p>
          <a href={job.apply_link}>Apply for {job.title}</a>
          {" · "}
          <Link href={`/jobs/${job.id}/edit`}>Edit</Link>{" "}
          <button
            type="button"
            disabled={deleting !== null}
            onClick={() => remove(job)}
          >
            {deleting === job.id ? "Deleting…" : "Delete"}
          </button>
        </article>
      ))}
    </main>
  );
}
