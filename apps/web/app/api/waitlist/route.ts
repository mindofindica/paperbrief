import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../lib/rate-limiter";
import { validateEmail } from "../../../lib/email-validator";
import {
  sendWelcomeEmail,
  sendAlreadyWaitlistedEmail,
} from "../../../lib/email/send-welcome";

export async function POST(req: Request) {
  // Extract IP from Vercel headers
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { limited } = checkRateLimit(ip);
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = validateEmail((body as Record<string, unknown>)?.email);
  if (!email) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[waitlist] Supabase env vars not set — cannot save email");
    return NextResponse.json(
      { error: "Service temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  try {
    const supabase = createClient(url, key);
    const { error } = await supabase
      .from("paperbrief_waitlist")
      .insert({ email, source: "landing" });

    if (!error) {
      // New signup — send welcome email (fire-and-forget; don't block the response)
      sendWelcomeEmail(email).catch((err) =>
        console.error("[waitlist] Failed to send welcome email:", err)
      );
      return NextResponse.json({ message: "You're on the list! We'll be in touch. 🎉" });
    }

    // Duplicate email (unique constraint violation)
    if (error.code === "23505") {
      // Send a friendly "you're already in" email (fire-and-forget)
      sendAlreadyWaitlistedEmail(email).catch((err) =>
        console.error("[waitlist] Failed to send duplicate email:", err)
      );
      return NextResponse.json({ message: "You're already on the list — sit tight!" });
    }

    // Other DB error — log and surface honestly
    console.error("[waitlist] Supabase insert error:", error.code, error.message);
    return NextResponse.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 503 }
    );
  } catch (err) {
    console.error("[waitlist] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 503 }
    );
  }
}
