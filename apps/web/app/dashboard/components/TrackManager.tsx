"use client";

import { useState } from "react";
import type { Track } from "../types";
import TrackCard from "./TrackCard";
import NewTrackForm from "./NewTrackForm";

type TrackManagerProps = {
  initialTracks: Track[];
};

export default function TrackManager({ initialTracks }: TrackManagerProps) {
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
          <div className="text-gray-500 text-sm">No tracks yet. Add your first one.</div>
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
