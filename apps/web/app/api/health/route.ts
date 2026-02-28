import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { status: "degraded", reason: "Supabase env vars missing", waitlist_count: null, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  }

  try {
    const supabase = createClient(url, key);

    // Check DB connectivity + get waitlist count in one query
    const { count, error } = await supabase
      .from("paperbrief_waitlist")
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { status: "degraded", reason: error.message, waitlist_count: null, timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }

    return NextResponse.json({
      status: "ok",
      waitlist_count: count ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status: "error", reason: msg, waitlist_count: null, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  }
}
