"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const [result, setResult] = useState<string>("loading...");

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from("workshops")
        .insert({
          name: "Test Workshop 3",
          description: "testing supabase connection",
          start_date: "2026-10-01",
          end_date: "2026-10-01",
          capacity: 20,
          location: "Zoom",
        })
        .select();

      if (error) {
        setResult(`Error: ${error.message}`);
      } else {
        setResult(`Success! Inserted: ${JSON.stringify(data)}`);
      }
    }
    testConnection();
  }, []);

  return <div>{result}</div>;
}
