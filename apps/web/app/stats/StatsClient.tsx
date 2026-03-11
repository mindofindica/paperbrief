'use client';

import type { StatsResult, ActivityDay, TrackStat } from '../../lib/stats';

interface Props {
  stats: StatsResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  emoji,
}: {
  label: string;
  value: string | number;
  sub?: string;
  emoji: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-3xl font-bold text-gray-100 tabular-nums">{value}</div>
      <div className="text-sm font-medium text-gray-300 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function TrackBar({ track }: { track: TrackStat }) {
  return (
    <div className="flex items-center gap-3 group">
      <div className="w-40 shrink-0 text-sm text-gray-400 truncate group-hover:text-gray-200 transition-colors" title={track.name}>
        {track.name}
      </div>
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${track.pct}%` }}
        />
      </div>
      <div className="w-10 shrink-0 text-right text-sm text-gray-500 tabular-nums">
        {track.count}
      </div>
    </div>
  );
}

function ActivityChart({ activity }: { activity: ActivityDay[] }) {
  const maxCount = Math.max(...activity.map((d) => d.count), 1);
  const today = new Date().toISOString().slice(0, 10);

  // Show every 7th date label to avoid crowding
  const labelEvery = 7;

  return (
    <div>
      {/* Bars */}
      <div className="flex items-end gap-[3px] h-24">
        {activity.map((day, i) => {
          const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
          const isToday = day.date === today;
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-700 text-gray-100 text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                {day.date}: {day.count} paper{day.count !== 1 ? 's' : ''}
              </div>
              <div
                className={`w-full rounded-sm transition-all duration-300 ${
                  day.count === 0
                    ? 'bg-gray-800'
                    : isToday
                    ? 'bg-emerald-500'
                    : 'bg-indigo-500 group-hover:bg-indigo-400'
                }`}
                style={{ height: day.count === 0 ? '4px' : `${heightPct}%`, minHeight: '4px' }}
              />
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      <div className="flex gap-[3px] mt-1">
        {activity.map((day, i) => (
          <div key={day.date} className="flex-1 text-center">
            {i % labelEvery === 0 ? (
              <span className="text-[9px] text-gray-600">
                {day.date.slice(5)} {/* MM-DD */}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackBar({
  label,
  count,
  total,
  emoji,
  color,
}: {
  label: string;
  count: number;
  total: number;
  emoji: string;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 text-center shrink-0 text-base">{emoji}</div>
      <div className="w-12 shrink-0 text-sm text-gray-400 capitalize">{label}</div>
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        {count > 0 && (
          <div
            className={`h-2 rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="w-16 shrink-0 text-right text-sm text-gray-500 tabular-nums">
        {count} <span className="text-gray-700">({pct}%)</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StatsClient({ stats }: Props) {
  const { readingList, feedback, digests, topTracks, activity, generatedAt } = stats;

  const readRate =
    feedback.total > 0 ? Math.round(((feedback.read + feedback.love + feedback.save) / feedback.total) * 100) : 0;

  return (
    <div className="space-y-10">
      {/* ── Top stat cards ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            emoji="📄"
            label="Papers Scored"
            value={digests.totalPapersScored.toLocaleString()}
            sub="across all digests"
          />
          <StatCard
            emoji="📬"
            label="Digests Received"
            value={digests.totalDigests}
            sub={`${digests.papersLast30Days} papers last 30d`}
          />
          <StatCard
            emoji="📚"
            label="Reading List"
            value={readingList.total}
            sub={`${readingList.done} finished`}
          />
          <StatCard
            emoji="💬"
            label="Papers Rated"
            value={feedback.total}
            sub={`${readRate}% positive`}
          />
          <StatCard
            emoji="❤️"
            label="Loved"
            value={feedback.love + feedback.save}
            sub="saved or loved"
          />
          <StatCard
            emoji="⏭️"
            label="Skipped"
            value={feedback.skip + feedback.meh}
            sub="meh or skipped"
          />
        </div>
      </section>

      {/* ── Activity chart ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Digest Activity — Last 30 Days
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <ActivityChart activity={activity} />
          <p className="text-xs text-gray-600 mt-3">
            Each bar = papers surfaced in that day&apos;s digest. Hover for details.
          </p>
        </div>
      </section>

      {/* ── Reading list breakdown ───────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Reading List</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          {readingList.total === 0 ? (
            <p className="text-gray-500 text-sm">No papers saved yet.</p>
          ) : (
            <>
              <FeedbackBar label="Unread" count={readingList.unread} total={readingList.total} emoji="📖" color="bg-amber-500" />
              <FeedbackBar label="Reading" count={readingList.reading} total={readingList.total} emoji="🔍" color="bg-blue-500" />
              <FeedbackBar label="Done" count={readingList.done} total={readingList.total} emoji="✅" color="bg-emerald-500" />
            </>
          )}
        </div>
      </section>

      {/* ── Feedback breakdown ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Your Feedback</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          {feedback.total === 0 ? (
            <p className="text-gray-500 text-sm">No feedback given yet. Start reading papers to build your profile!</p>
          ) : (
            <>
              <FeedbackBar label="Love" count={feedback.love} total={feedback.total} emoji="❤️" color="bg-rose-500" />
              <FeedbackBar label="Save" count={feedback.save} total={feedback.total} emoji="🔖" color="bg-indigo-500" />
              <FeedbackBar label="Read" count={feedback.read} total={feedback.total} emoji="✅" color="bg-emerald-500" />
              <FeedbackBar label="Meh" count={feedback.meh} total={feedback.total} emoji="😐" color="bg-yellow-600" />
              <FeedbackBar label="Skip" count={feedback.skip} total={feedback.total} emoji="⏭️" color="bg-gray-600" />
            </>
          )}
        </div>
      </section>

      {/* ── Top tracks ───────────────────────────────────────────────────── */}
      {topTracks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Top Research Tracks</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            {topTracks.map((track) => (
              <TrackBar key={track.name} track={track} />
            ))}
            <p className="text-xs text-gray-600 pt-1">Papers matched per track across all scored digests.</p>
          </div>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <p className="text-xs text-gray-700 text-right pb-4">
        Stats generated {new Date(generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  );
}
