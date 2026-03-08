"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TRACK_TEMPLATES } from "../../lib/track-templates";
import TemplateCard from "./components/TemplateCard";

type ApiResponse = {
  created: { id: string; name: string }[];
  skipped: string[];
  limitReached: boolean;
  error?: string;
  upgrade?: boolean;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTemplate(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleSkip() {
    router.push("/dashboard");
  }

  async function handleStart() {
    if (selected.size === 0) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tracks/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: Array.from(selected) }),
      });

      const data = (await res.json()) as ApiResponse;

      if (!res.ok) {
        if (res.status === 403 && data.upgrade) {
          // Plan limit on a brand new account (shouldn't happen but handle gracefully)
          router.push("/dashboard");
          return;
        }
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // Success — go to dashboard. If limitReached, dashboard will show the CTA.
      router.push("/dashboard");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight text-white">
          📄 PaperBrief
        </span>
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Skip for now →
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
        {/* Hero */}
        <div className="mb-8 space-y-2">
          <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold">
            Welcome to PaperBrief
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
            What are you researching?
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Pick your research interests and we&apos;ll set up your first tracks.
            You&apos;ll start getting relevant papers in your next daily digest.
          </p>
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {TRACK_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.key}
              template={template}
              selected={selected.has(template.key)}
              onToggle={toggleTemplate}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleStart}
            disabled={loading}
            className={[
              "flex-1 sm:flex-none sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all",
              selectedCount === 0
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30",
              loading ? "opacity-70 cursor-wait" : "",
            ].join(" ")}
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Setting up tracks…
              </>
            ) : selectedCount === 0 ? (
              "Select at least one topic"
            ) : (
              <>
                Start with {selectedCount} track{selectedCount !== 1 ? "s" : ""} →
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            I&apos;ll set up manually
          </button>
        </div>

        {/* Fine print */}
        <p className="mt-4 text-xs text-gray-600">
          You can always edit, rename, or delete tracks from your dashboard.
        </p>
      </div>
    </div>
  );
}
