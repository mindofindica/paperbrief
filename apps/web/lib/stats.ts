/**
 * stats.ts — Aggregate user statistics from local SQLite DB
 *
 * All queries are read-only and run against the same SQLite DB used
 * by the rest of PaperBrief. No Supabase calls needed — stats are
 * single-user and don't require auth context.
 */

import { getRawDb } from './arxiv-db';

export interface ReadingListStats {
  total: number;
  unread: number;
  reading: number;
  done: number;
}

export interface FeedbackStats {
  total: number;
  read: number;
  save: number;
  love: number;
  meh: number;
  skip: number;
}

export interface DigestStats {
  totalDigests: number;
  totalPapersScored: number;
  papersLast30Days: number;
}

export interface TrackStat {
  name: string;
  count: number;
  pct: number; // percentage of max for chart rendering
}

export interface ActivityDay {
  date: string;  // YYYY-MM-DD
  count: number; // papers surfaced that day
}

export interface StatsResult {
  readingList: ReadingListStats;
  feedback: FeedbackStats;
  digests: DigestStats;
  topTracks: TrackStat[];
  activity: ActivityDay[];   // last 30 days
  generatedAt: string;       // ISO timestamp
}

export function getStats(): StatsResult {
  const db = getRawDb();

  // ── Reading List ──────────────────────────────────────────────────────────
  const rlRows = db.prepare(`
    SELECT status, COUNT(*) AS cnt
    FROM reading_list
    GROUP BY status
  `).all() as { status: string; cnt: number }[];

  const rlMap: Record<string, number> = {};
  let rlTotal = 0;
  for (const row of rlRows) {
    rlMap[row.status] = row.cnt;
    rlTotal += row.cnt;
  }

  const readingList: ReadingListStats = {
    total: rlTotal,
    unread: rlMap['unread'] ?? 0,
    reading: rlMap['reading'] ?? 0,
    done: rlMap['done'] ?? 0,
  };

  // ── Feedback ──────────────────────────────────────────────────────────────
  const fbRows = db.prepare(`
    SELECT feedback_type, COUNT(*) AS cnt
    FROM paper_feedback
    GROUP BY feedback_type
  `).all() as { feedback_type: string; cnt: number }[];

  const fbMap: Record<string, number> = {};
  let fbTotal = 0;
  for (const row of fbRows) {
    fbMap[row.feedback_type] = row.cnt;
    fbTotal += row.cnt;
  }

  const feedback: FeedbackStats = {
    total: fbTotal,
    read: fbMap['read'] ?? 0,
    save: fbMap['save'] ?? 0,
    love: fbMap['love'] ?? 0,
    meh: fbMap['meh'] ?? 0,
    skip: fbMap['skip'] ?? 0,
  };

  // ── Digest activity ───────────────────────────────────────────────────────
  const totalDigests = (db.prepare(`SELECT COUNT(*) AS cnt FROM sent_digests`).get() as any).cnt as number;
  const totalScored = (db.prepare(`SELECT COUNT(*) AS cnt FROM llm_scores`).get() as any).cnt as number;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().slice(0, 10);

  const recentPapers = (db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM digest_papers
    WHERE digest_date >= ?
  `).get(fromDate) as any).cnt as number;

  const digests: DigestStats = {
    totalDigests,
    totalPapersScored: totalScored,
    papersLast30Days: recentPapers,
  };

  // ── Top tracks ────────────────────────────────────────────────────────────
  const trackRows = db.prepare(`
    SELECT track_name AS name, COUNT(*) AS count
    FROM track_matches
    GROUP BY track_name
    ORDER BY count DESC
    LIMIT 8
  `).all() as { name: string; count: number }[];

  const maxTrack = trackRows[0]?.count ?? 1;
  const topTracks: TrackStat[] = trackRows.map((r) => ({
    name: r.name,
    count: r.count,
    pct: Math.round((r.count / maxTrack) * 100),
  }));

  // ── Activity: papers surfaced per day, last 30 days ───────────────────────
  const activityRows = db.prepare(`
    SELECT digest_date AS date, COUNT(*) AS count
    FROM digest_papers
    WHERE digest_date >= ?
    GROUP BY digest_date
    ORDER BY digest_date ASC
  `).all(fromDate) as { date: string; count: number }[];

  // Fill any missing days with 0 so the chart always has 30 data points
  const activityMap = new Map(activityRows.map((r) => [r.date, r.count]));
  const activity: ActivityDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    activity.push({ date: key, count: activityMap.get(key) ?? 0 });
  }

  return {
    readingList,
    feedback,
    digests,
    topTracks,
    activity,
    generatedAt: new Date().toISOString(),
  };
}
