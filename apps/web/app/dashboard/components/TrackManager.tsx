"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Track } from "../types";
import TrackCard from "./TrackCard";
import NewTrackForm from "./NewTrackForm";

type TrackManagerProps = {
  initialTracks: Track[];
};

export default function TrackManager({ initialTracks }: TrackManagerProps) {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [showForm, setShowForm] = useState(false);

  function handleCreated(track: Track) {
    setTracks((prev) => [track, ...prev]);
    setShowForm(false);
  }

  function handleRemove(track: Track) {
    setTracks((prev) => prev.filter((item) => item.id !== track.id));
  }

  function handleRestore(track: Track) {
    setTracks((prev) => [track, ...prev]);
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setShowForm((prev) => !prev)}
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-blue-200"
      >
        {showForm ? "− Cancel" : "+ Add Track"}
      </button>

      {showForm ? <NewTrackForm onCreated={handleCreated} /> : null}

      <div className="grid gap-4">
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 p-6 space-y-4">
            <p className="text-gray-400 text-sm font-medium">No tracks yet.</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              Tracks tell PaperBrief what topics to watch for you — keywords, arXiv categories,
              and a relevance threshold. You get a digest every day with the best matching papers.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/onboarding")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                ✨ Quick Start — pick from templates
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 text-sm transition-colors"
              >
                + Build my own track
              </button>
            </div>
          </div>
        ) : (
          tracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              onRemove={handleRemove}
              onRestore={handleRestore}
            />
          ))
        )}
      </div>
    </div>
  );
}
