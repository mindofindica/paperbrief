/**
 * AdminDashboard — client-side admin SPA for PaperBrief
 *
 * Auth-gated by ADMIN_SECRET (stored in sessionStorage).
 * Makes API calls with x-admin-secret header — secret never exposed in bundle.
 *
 * Tabs:
 *   Overview  — stats cards (waitlist, users, digests)
 *   Waitlist  — full waitlist table + batch invite form
 *   Users     — registered users with track/digest/reading-list counts
 */
"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "waitlist" | "users";

interface WaitlistStats {
  total: number;
  invited: number;
  pending: number;
}

interface WaitlistEntry {
  id: string;
  email: string;
  created_at: string;
  invited_at: string | null;
  invite_token: string | null;
  invite_sent_by: string | null;
}

interface WaitlistResponse extends WaitlistStats {
  entries?: WaitlistEntry[];
}

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  track_count: number;
  digest_count: number;
  reading_list_count: number;
  last_digest_at: string | null;
  last_active_at: string | null;
}

interface UsersResponse {
  total: number;
  users: AdminUser[];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "amber" | "purple";
}) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function Badge({ invited }: { invited: boolean }) {
  return invited ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
      ✓ Invited
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      Pending
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
      {message}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  waitlist,
  users,
}: {
  waitlist: WaitlistStats | null;
  users: UsersResponse | null;
}) {
  if (!waitlist || !users) return <LoadingSpinner />;

  const totalDigests = users.users.reduce((s, u) => s + u.digest_count, 0);
  const totalTracks = users.users.reduce((s, u) => s + u.track_count, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Waitlist (total)"
          value={waitlist.total}
          sub={`${waitlist.pending} pending`}
          color="blue"
        />
        <StatCard
          label="Invited"
          value={waitlist.invited}
          sub={waitlist.total ? `${Math.round((waitlist.invited / waitlist.total) * 100)}% of waitlist` : undefined}
          color="green"
        />
        <StatCard
          label="Registered Users"
          value={users.total}
          sub={`${totalTracks} active track${totalTracks !== 1 ? "s" : ""}`}
          color="purple"
        />
        <StatCard
          label="Digests Sent"
          value={totalDigests}
          sub="across all users"
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent users */}
        <div className="rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Recent Users
          </h3>
          {users.users.length === 0 ? (
            <p className="text-sm text-gray-400">No users yet.</p>
          ) : (
            <ul className="space-y-2">
              {users.users.slice(0, 5).map((u) => (
                <li key={u.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-800 truncate max-w-[200px]">
                    {u.email}
                  </span>
                  <span className="text-gray-400 text-xs ml-2 shrink-0">
                    {fmtRelative(u.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Waitlist snapshot */}
        <div className="rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Waitlist Snapshot
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total signups</span>
              <span className="font-medium">{waitlist.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Invited</span>
              <span className="font-medium text-green-700">{waitlist.invited}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Pending invite</span>
              <span className="font-medium text-amber-700">{waitlist.pending}</span>
            </div>
            {/* Progress bar */}
            {waitlist.total > 0 && (
              <div className="mt-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (waitlist.invited / waitlist.total) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {Math.round((waitlist.invited / waitlist.total) * 100)}% invited
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Waitlist Tab ──────────────────────────────────────────────────────────────

function WaitlistTab({
  secret,
  onRefresh,
}: {
  secret: string;
  onRefresh: () => void;
}) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteN, setInviteN] = useState(5);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/waitlist?full=1", {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WaitlistResponse = await res.json();
      setStats({ total: data.total, invited: data.invited, pending: data.pending });
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite() {
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: {
          "x-admin-secret": secret,
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: inviteN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setInviteResult(
        `✓ Invited ${data.invited?.length ?? 0} users (${data.emailsSent ?? 0} emails sent)`
      );
      await load();
      onRefresh();
    } catch (e) {
      setInviteResult(
        `✗ ${e instanceof Error ? e.message : "Error"}`
      );
    } finally {
      setInviting(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Waitlist{" "}
          {stats && (
            <span className="text-sm font-normal text-gray-500">
              ({stats.pending} pending, {stats.invited} invited)
            </span>
          )}
        </h2>
        <button
          onClick={load}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Refresh
        </button>
      </div>

      {/* Batch invite form */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="text-sm font-semibold text-amber-800 mb-3">
          Batch Invite
        </h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-amber-700">Invite next</label>
          <input
            type="number"
            min={1}
            max={100}
            value={inviteN}
            onChange={(e) => setInviteN(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 rounded border border-amber-300 bg-white px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <label className="text-sm text-amber-700">pending users</label>
          <button
            onClick={handleInvite}
            disabled={inviting || stats?.pending === 0}
            className="ml-2 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {inviting ? "Inviting…" : "Send Invites"}
          </button>
        </div>
        {inviteResult && (
          <p
            className={`mt-3 text-sm font-medium ${
              inviteResult.startsWith("✓") ? "text-green-700" : "text-red-700"
            }`}
          >
            {inviteResult}
          </p>
        )}
      </div>

      {/* Waitlist table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Email
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Signed up
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Status
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Invited
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No waitlist entries.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {e.email}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmtDate(e.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge invited={!!e.invited_at} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmtRelative(e.invited_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ secret }: { secret: string }) {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Users{" "}
          <span className="text-sm font-normal text-gray-500">
            ({data.total} total)
          </span>
        </h2>
        <button
          onClick={load}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Email
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">
                Tracks
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">
                Digests
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">
                Reading List
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Joined
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Last Active
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {data.users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              data.users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 font-medium">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        u.track_count > 0
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {u.track_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {u.digest_count}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {u.reading_list_count}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmtDate(u.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {fmtRelative(u.last_active_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Auth Gate ─────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }: { onAuth: (secret: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    // Quick pre-flight — check against waitlist endpoint
    const res = await fetch("/api/admin/waitlist", {
      headers: { "x-admin-secret": input.trim() },
    });
    if (res.ok || res.status === 503) {
      // 503 means ADMIN_SECRET not set, which is a config issue — accept as "valid" so UX isn't blocked
      onAuth(input.trim());
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">📄</p>
          <h1 className="text-2xl font-bold text-gray-900">PaperBrief Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your admin secret to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Secret
            </label>
            <input
              type="password"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(false);
              }}
              placeholder="ADMIN_SECRET"
              autoFocus
              className={`w-full rounded-lg border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                error
                  ? "border-red-300 focus:ring-red-400"
                  : "border-gray-300 focus:ring-blue-500"
              }`}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-600">Incorrect secret. Try again.</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          Set via <code className="bg-gray-100 px-1 rounded">ADMIN_SECRET</code> Vercel env var
        </p>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const SESSION_KEY = "pb_admin_secret";

export default function AdminDashboard() {
  const [secret, setSecret] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null);
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Restore secret from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setSecret(stored);
  }, []);

  function handleAuth(s: string) {
    sessionStorage.setItem(SESSION_KEY, s);
    setSecret(s);
  }

  function handleSignOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setSecret(null);
    setWaitlistStats(null);
    setUsersData(null);
  }

  // Load overview data when authenticated
  const loadOverview = useCallback(async (s: string) => {
    setOverviewError(null);
    try {
      const [wRes, uRes] = await Promise.all([
        fetch("/api/admin/waitlist", { headers: { "x-admin-secret": s } }),
        fetch("/api/admin/users", { headers: { "x-admin-secret": s } }),
      ]);
      if (!wRes.ok && wRes.status === 401) {
        // Secret is wrong — sign out
        handleSignOut();
        return;
      }
      if (wRes.ok) setWaitlistStats(await wRes.json());
      if (uRes.ok) setUsersData(await uRes.json());
    } catch {
      setOverviewError("Failed to load dashboard data");
    }
  }, []);

  useEffect(() => {
    if (secret) loadOverview(secret);
  }, [secret, loadOverview]);

  if (!secret) {
    return <AuthGate onAuth={handleAuth} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "waitlist", label: "Waitlist" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 text-sm">
              ← paperbrief.ai
            </a>
            <span className="text-gray-300">|</span>
            <h1 className="text-lg font-bold text-gray-900">Admin</h1>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                {t.label}
                {t.id === "waitlist" && waitlistStats?.pending ? (
                  <span className="ml-2 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-xs bg-amber-100 text-amber-700 font-bold">
                    {waitlistStats.pending}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {overviewError && <ErrorBanner message={overviewError} />}
        {tab === "overview" && (
          <OverviewTab waitlist={waitlistStats} users={usersData} />
        )}
        {tab === "waitlist" && (
          <WaitlistTab
            secret={secret}
            onRefresh={() => loadOverview(secret)}
          />
        )}
        {tab === "users" && <UsersTab secret={secret} />}
      </main>
    </div>
  );
}
