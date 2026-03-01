import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServiceSupabase } from "../../lib/supabase";
import { verifySessionCookie } from "../../lib/auth";
import type { Track } from "./types";
import TrackManager from "./components/TrackManager";
import DigestPreview from "./components/DigestPreview";

export default async function DashboardPage() {
  const session = cookies().get("pb_session")?.value;
  if (!session) {
    redirect("/auth/login");
  }

  const { valid, userId } = verifySessionCookie(session);
  if (!valid || !userId) {
    redirect("/auth/login");
  }

  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("tracks")
    .select("id, name, keywords, arxiv_cats, min_score")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const tracks = (data ?? []) as Track[];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-gray-500">Dashboard</p>
          <h1 className="text-3xl font-bold">My Research Tracks</h1>
          <p className="text-gray-400">Tune what PaperBrief watches for you.</p>
        </header>

        <TrackManager initialTracks={tracks} />

        {/* Divider */}
        <hr className="border-gray-800" />

        <DigestPreview />
      </div>
    </div>
  );
}
