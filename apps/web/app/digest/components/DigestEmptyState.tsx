"use client";

import Link from "next/link";

interface DigestEmptyStateProps {
  /** True when the user has no active tracks configured */
  hasNoTracks: boolean;
  /** When the next digest pipeline is expected to run */
  nextDigestTime: Date;
}

const QUICKSTART_CARDS = [
  {
    emoji: "📰",
    title: "Paper of the Day",
    desc: "One standout paper from ML/AI research, curated daily.",
    href: "/today",
    cta: "See today's paper",
  },
  {
    emoji: "🗂️",
    title: "Browse Topics",
    desc: "Explore curated research areas — LLMs, robotics, vision, and more.",
    href: "/topics",
    cta: "Browse topics",
  },
  {
    emoji: "📋",
    title: "Your Reading List",
    desc: "Save papers to read later and track your progress.",
    href: "/reading-list",
    cta: "Open reading list",
  },
] as const;

function formatNextDigestTime(next: Date): string {
  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));

  const timeStr = next.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
    timeZoneName: "short",
  });

  const dayStr = (() => {
    const todayDate = now.toISOString().slice(0, 10);
    const nextDate = next.toISOString().slice(0, 10);
    if (todayDate === nextDate) return "today";
    return "tomorrow";
  })();

  if (diffH <= 2) {
    return `in about ${diffH === 0 ? "an hour" : `${diffH} hour${diffH !== 1 ? "s" : ""}`}`;
  }
  return `${dayStr} at ${timeStr}`;
}

export function DigestEmptyState({
  hasNoTracks,
  nextDigestTime,
}: DigestEmptyStateProps) {
  const nextStr = formatNextDigestTime(nextDigestTime);

  if (hasNoTracks) {
    // User hasn't set up any tracks yet — guide them to onboarding
    return (
      <div className="space-y-8">
        {/* Hero */}
        <div className="rounded-2xl border border-blue-800/40 bg-blue-950/20 px-6 py-8 text-center space-y-3">
          <div className="text-4xl">🛤️</div>
          <h2 className="text-lg font-semibold text-gray-100">
            Set up your first research track
          </h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
            Tracks tell PaperBrief which papers matter to you. Add keywords,
            arXiv categories, and a minimum relevance score — then your digest
            fills up automatically.
          </p>
          <div className="flex gap-3 justify-center flex-wrap pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              Pick my research interests →
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors"
            >
              Set up manually
            </Link>
          </div>
        </div>

        {/* Quickstart cards */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">
            Explore while you wait
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICKSTART_CARDS.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="group rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 hover:bg-gray-800 transition-all space-y-2"
              >
                <div className="text-2xl">{card.emoji}</div>
                <div className="text-sm font-semibold text-gray-200 group-hover:text-white">
                  {card.title}
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">
                  {card.desc}
                </div>
                <div className="text-xs text-blue-400 font-medium pt-1">
                  {card.cta} →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // User has tracks but no digest today — pipeline hasn't run yet or it's early
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/50 px-6 py-8 text-center space-y-3">
        <div className="text-4xl">⏳</div>
        <h2 className="text-lg font-semibold text-gray-100">
          Your digest is on its way
        </h2>
        <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
          The pipeline scores and ranks today&apos;s papers against your tracks
          every morning. Next delivery expected{" "}
          <span className="text-gray-200 font-medium">{nextStr}</span>.
        </p>
        <p className="text-xs text-gray-600">
          Papers arrive at 08:30 CET · Digest covers the last 24 h of arXiv
        </p>
      </div>

      {/* Quickstart cards */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-3">
          Something to read right now
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICKSTART_CARDS.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 hover:bg-gray-800 transition-all space-y-2"
            >
              <div className="text-2xl">{card.emoji}</div>
              <div className="text-sm font-semibold text-gray-200 group-hover:text-white">
                {card.title}
              </div>
              <div className="text-xs text-gray-500 leading-relaxed">
                {card.desc}
              </div>
              <div className="text-xs text-blue-400 font-medium pt-1">
                {card.cta} →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
