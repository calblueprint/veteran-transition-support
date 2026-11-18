"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const emptyJob = {
  title: "",
  company: "",
  location: "",
  description: "",
  apply_link: "",
};
type JobFields = typeof emptyJob;

export function JobForm({ id }: { id?: string }) {
  const router = useRouter();
  const [initial, setInitial] = useState<JobFields | null>(
    id ? null : emptyJob,
  );
  const [message, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    supabase
      .from("jobs")
      .select("title,company,location,description,apply_link")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data)
          setError(error ? "Could not load this job." : "Job not found.");
        else setInitial(data);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = { ...emptyJob };
    for (const key of Object.keys(fields) as (keyof JobFields)[]) {
      fields[key] = String(form.get(key) ?? "").trim();
    }
    if (Object.values(fields).some(value => !value)) {
      setError("Complete every field before saving.");
      return;
    }
    if (
      !/^https?:\/\//i.test(fields.apply_link) ||
      !URL.canParse(fields.apply_link)
    ) {
      setError("Enter an application link beginning with https:// or http://.");
      return;
    }
    setBusy(true);
    setError("");
    const jobs = supabase.from("jobs");
    const query = id ? jobs.update(fields).eq("id", id) : jobs.insert(fields);
    const { error } = await query.select("id").single();
    if (error) {
      setError("Could not save this job. Check your access and try again.");
      setBusy(false);
    } else router.push("/jobs");
  }

  return (
    <main>
      <Link href="/jobs">Back to jobs</Link>
      <h1>{id ? "Edit job" : "Post a job"}</h1>
      {message && <p role="alert">{message}</p>}
      {!initial && !message && <p role="status">Loading job…</p>}
      {initial && (
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            {(
              [
                "title",
                "company",
                "location",
                "description",
                "apply_link",
              ] as const
            ).map(key => (
              <p key={key}>
                <label>
                  {
                    {
                      title: "Title",
                      company: "Company",
                      location: "Location",
                      description: "Description",
                      apply_link: "Apply link",
                    }[key]
                  }
                  <br />
                  {key === "description" ? (
                    <textarea
                      name={key}
                      defaultValue={initial[key]}
                      required
                      rows={6}
                    />
                  ) : (
                    <input
                      name={key}
                      type={key === "apply_link" ? "url" : "text"}
                      defaultValue={initial[key]}
                      required
                    />
                  )}
                </label>
              </p>
            ))}
            <button type="submit">
              {busy ? "Saving…" : id ? "Save changes" : "Post job"}
            </button>
          </fieldset>
        </form>
      )}
    </main>
  );
}
