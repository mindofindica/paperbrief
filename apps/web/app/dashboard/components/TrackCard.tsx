"use client";

import { useState } from "react";
import type { Track } from "../types";

type TrackCardProps = {
  track: Track;
  onRemove?: (track: Track) => void;
  onRestore?: (track: Track) => void;
};

export default function TrackCard({ track, onRemove, onRestore }: TrackCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    onRemove?.(track);

    try {
      const res = await fetch(`/api/tracks?id=${track.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        onRestore?.(track);
      }
    } catch {
      onRestore?.(track);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{track.name}</h3>
          <p className="text-sm text-gray-500">≥ {track.min_score} relevance</p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {track.keywords.map((keyword) => (
          <span
            key={keyword}
            className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300"
          >
            {keyword}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {track.arxiv_cats.map((cat) => (
          <span
            key={cat}
            className="text-xs px-2 py-1 rounded-full bg-blue-950 text-blue-300 border border-blue-800"
          >
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
