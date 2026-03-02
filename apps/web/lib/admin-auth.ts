/**
 * admin-auth.ts — simple ADMIN_SECRET header guard
 *
 * All /api/admin/* routes must call requireAdmin(req) before doing anything.
 * Returns null if authorised, or a NextResponse with 401/503 if not.
 */
import { NextResponse } from "next/server";

export function requireAdmin(req: Request): NextResponse | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error("[admin-auth] ADMIN_SECRET env var not set");
    return NextResponse.json(
      { error: "Admin endpoint not configured" },
      { status: 503 }
    );
  }

  const provided = req.headers.get("x-admin-secret");
  if (!provided || provided !== secret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null; // authorised
}
