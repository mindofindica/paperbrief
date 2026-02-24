import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";

async function writeFallback(email: string) {
  // Fallback when Supabase is unavailable: store in JSON on disk.
  const path = "/tmp/paperbrief-waitlist.json";
  let entries: Array<{ email: string; source: string; created_at: string }> = [];
  try {
    const raw = await fs.readFile(path, "utf8");
    entries = JSON.parse(raw);
  } catch {
    entries = [];
  }
  entries.push({ email, source: "landing", created_at: new Date().toISOString() });
  await fs.writeFile(path, JSON.stringify(entries, null, 2));
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    try {
      const supabase = createClient(url, key);
      const { error } = await supabase
        .from("paperbrief_waitlist")
        .insert({ email: normalizedEmail, source: "landing" });

      if (!error) {
        return NextResponse.json({ message: "You're on the list! We'll be in touch." });
      }

      if (error.code === "23505") {
        return NextResponse.json({ message: "You're already on the list!" });
      }
    } catch {
      // fall through to fallback
    }
  }

  await writeFallback(normalizedEmail);
  return NextResponse.json({ message: "You're on the list! We'll be in touch." });
}
