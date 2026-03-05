import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServiceSupabase } from "../../lib/supabase";
import { verifySessionCookie } from "../../lib/auth";
import { getSubscription } from "../../lib/stripe";
import type { Track } from "./types";
import TrackManager from "./components/TrackManager";
import DigestPreview from "./components/DigestPreview";
import UpgradeCTA from "./components/UpgradeCTA";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const session = (await cookies()).get("pb_session")?.value;
  if (!session) {
    redirect("/auth/login");
  }

  const { valid, userId } = verifySessionCookie(session);
  if (!valid || !userId) {
    redirect("/auth/login");
  }

  const supabase = getServiceSupabase();
  const [tracksResult, subscription] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, name, keywords, arxiv_cats, min_score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getSubscription(userId),
  ]);

  const tracks = (tracksResult.data ?? []) as Track[];

  // Resolve upgrade status from query params (set by Stripe redirect)
  const params = await searchParams;
  const upgradeStatus = params.upgrade; // 'success' | 'cancelled' | undefined

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-gray-500">Dashboard</p>
          <h1 className="text-3xl font-bold">My Research Tracks</h1>
          <p className="text-gray-400">Tune what PaperBrief watches for you.</p>
        </header>

        {/* Stripe redirect banners */}
        {upgradeStatus === "success" && (
          <div className="rounded-xl border border-green-700/60 bg-green-950/30 px-5 py-3 text-sm text-green-300">
            🎉 Welcome to Pro! Your tracks and daily digest are now active.
          </div>
        )}
        {upgradeStatus === "cancelled" && (
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/40 px-5 py-3 text-sm text-gray-400">
            Upgrade cancelled — you&apos;re still on the free plan.
          </div>
        )}

        {/* Plan status / upgrade CTA */}
        <UpgradeCTA
          plan={subscription.plan}
          trackCount={tracks.length}
          trackLimit={subscription.trackLimit}
        />

        <TrackManager initialTracks={tracks} />

        {/* Divider */}
        <hr className="border-gray-800" />

        <DigestPreview />
      </div>
    </div>
  );
}
