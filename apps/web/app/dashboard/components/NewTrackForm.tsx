"use client";

import { useState } from "react";
import type { Track } from "../types";

const ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.IR", "stat.ML"];

type NewTrackFormProps = {
  onCreated?: (track: Track) => void;
};

type FormState = {
  name: string;
  keywords: string;
  arxivCats: string[];
  minScore: number;
};

export default function NewTrackForm({ onCreated }: NewTrackFormProps) {
  const [form, setForm] = useState<FormState>({
    name: "",
    keywords: "",
    arxivCats: ["cs.AI"],
    minScore: 6,
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  function toggleCategory(cat: string) {
    setForm((prev) => {
      const exists = prev.arxivCats.includes(cat);
      return {
        ...prev,
        arxivCats: exists ? prev.arxivCats.filter((c) => c !== cat) : [...prev.arxivCats, cat],
      };
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const keywords = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          keywords,
          arxiv_cats: form.arxivCats,
          min_score: form.minScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Failed to create track");
        return;
      }
      setStatus("success");
      setMessage("Track created");
      setForm({ name: "", keywords: "", arxivCats: ["cs.AI"], minScore: 6 });
      if (data?.track) {
        onCreated?.(data.track as Track);
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Try again?");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Track name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">Keywords</label>
        <textarea
          required
          value={form.keywords}
          onChange={(e) => setForm((prev) => ({ ...prev, keywords: e.target.value }))}
          rows={3}
          placeholder="e.g. speculative decoding, KV cache"
          className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
        />
        <p className="text-xs text-gray-500">Comma-separated, used for paper prefiltering.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">arXiv Categories</label>
        <div className="flex flex-wrap gap-3">
          {ARXIV_CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.arxivCats.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="accent-blue-500"
              />
              {cat}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-400">Min relevance score: {form.minScore}</label>
        <input
          type="range"
          min={1}
          max={10}
          value={form.minScore}
          onChange={(e) => setForm((prev) => ({ ...prev, minScore: Number(e.target.value) }))}
          className="w-full"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 disabled:opacity-60"
      >
        {status === "loading" ? "Creating..." : "Create track"}
      </button>

      {message ? (
        <p className={`text-sm ${status === "error" ? "text-red-400" : "text-green-400"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
