"use client";

/**
 * AdminDashboard.tsx — PaperBrief admin panel
 *
 * Auth: ADMIN_SECRET stored in sessionStorage (cleared on tab close).
 * Tabs: Overview | Waitlist | Users
 *
 * All API calls go to /api/admin/* with x-admin-secret header.
 */

import React, { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  invite_sent_by: string | null;
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

type Tab = "overview" | "waitlist" | "users";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SESSION_KEY = "pb_admin_secret";

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (secret: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError("");

    // Verify secret by hitting a lightweight admin endpoint
    const res = await fetch("/api/admin/waitlist", {
      headers: { "x-admin-secret": value.trim() },
    });

    setLoading(false);
    if (res.ok) {
      sessionStorage.setItem(SESSION_KEY, value.trim());
      onLogin(value.trim());
    } else if (res.status === 401) {
      setError("Incorrect admin secret.");
    } else if (res.status === 503) {
      setError("Admin endpoint not configured (ADMIN_SECRET env var missing).");
    } else {
      setError("Unexpected error — check console.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-3xl">📄</span>
          <h1 className="mt-2 text-xl font-bold text-gray-900">PaperBrief Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your admin secret to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Admin secret"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = "blue",
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: "blue" | "green" | "amber" | "purple";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${colors[color].split(" ")[1]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  secret,
  waitlistStats,
  userCount,
}: {
  secret: string;
  waitlistStats: WaitlistStats | null;
  userCount: number;
}) {
  const [inviteLimit, setInviteLimit] = useState(5);
  const [inviteResult, setInviteResult] = useState<{
    invited: string[];
    emailsSent: number;
    errors: { email: string; error: string }[];
  } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");
    setInviteResult(null);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({ limit: inviteLimit }),
    });

    setInviting(false);
    if (res.ok) {
      const data = await res.json();
      setInviteResult(data);
    } else {
      const data = await res.json().catch(() => ({}));
      setInviteError(data.error ?? "Invite failed — check console.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Waitlist"
          value={waitlistStats?.total ?? "—"}
          sub="total signups"
          color="blue"
        />
        <StatCard
          label="Pending"
          value={waitlistStats?.pending ?? "—"}
          sub="not yet invited"
          color="amber"
        />
        <StatCard
          label="Invited"
          value={waitlistStats?.invited ?? "—"}
          sub="beta access sent"
          color="green"
        />
        <StatCard
          label="Users"
          value={userCount}
          sub="registered accounts"
          color="purple"
        />
      </div>

      {/* Invite panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Send invites</h2>
        <p className="text-xs text-gray-500 mb-4">
          Invites are sent oldest-first from the pending waitlist.
          Each recipient gets a magic link via email.
        </p>
        <form onSubmit={handleInvite} className="flex items-center gap-3">
          <label className="text-sm text-gray-700">
            Invite
            <input
              type="number"
              min={1}
              max={100}
              value={inviteLimit}
              onChange={(e) => setInviteLimit(Number(e.target.value))}
              className="mx-2 w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
            />
            users
          </label>
          <button
            type="submit"
            disabled={inviting || (waitlistStats?.pending ?? 0) === 0}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Send invites"}
          </button>
        </form>

        {inviteError && (
          <p className="mt-3 text-sm text-red-600">{inviteError}</p>
        )}

        {inviteResult && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4 text-sm">
            <p className="font-medium text-green-800">
              ✅ {inviteResult.invited.length} invited, {inviteResult.emailsSent} emails sent
            </p>
            {inviteResult.invited.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-green-700">
                {inviteResult.invited.map((email) => (
                  <li key={email} className="truncate">• {email}</li>
                ))}
              </ul>
            )}
            {inviteResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-red-700">Errors:</p>
                {inviteResult.errors.map((e) => (
                  <p key={e.email} className="text-red-600">• {e.email}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Waitlist tab ──────────────────────────────────────────────────────────────

function WaitlistTab({ secret }: { secret: string }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "invited">("all");

  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/waitlist?full=1", {
      headers: { "x-admin-secret": secret },
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
    } else {
      setError("Failed to load waitlist.");
    }
  }, [secret]);

  useEffect(() => { fetchWaitlist(); }, [fetchWaitlist]);

  const filtered = entries.filter((e) => {
    if (filter === "pending") return !e.invited_at;
    if (filter === "invited") return !!e.invited_at;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "invited"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
              filter === f
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">
          {filtered.length} entries
        </span>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signed up</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No entries
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-[240px] truncate">
                      {entry.email}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmtRelative(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.invited_at ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ✓ Invited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtDate(entry.invited_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ secret }: { secret: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/users?limit=100", {
      headers: { "x-admin-secret": secret },
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } else {
      setError("Failed to load users.");
    }
  }, [secret]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total} registered account{total !== 1 ? "s" : ""}
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tracks</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Digests</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Saved</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No users yet
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-[220px] truncate">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmtRelative(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        u.track_count > 0
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-400"
                      }`}>
                        {u.track_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {u.digest_count}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {u.reading_list_count}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtRelative(u.last_active_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [secret, setSecret] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null);
  const [userCount, setUserCount] = useState(0);

  // Restore secret from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setSecret(stored);
  }, []);

  // Fetch overview stats when logged in
  useEffect(() => {
    if (!secret) return;

    async function fetchOverview() {
      const [wRes, uRes] = await Promise.all([
        fetch("/api/admin/waitlist", { headers: { "x-admin-secret": secret! } }),
        fetch("/api/admin/users?limit=1", { headers: { "x-admin-secret": secret! } }),
      ]);

      if (wRes.ok) {
        const data = await wRes.json();
        setWaitlistStats({ total: data.total, invited: data.invited, pending: data.pending });
      }
      if (uRes.ok) {
        const data = await uRes.json();
        setUserCount(data.total ?? 0);
      }
    }

    fetchOverview();
  }, [secret]);

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setSecret(null);
  }

  if (!secret) {
    return <LoginScreen onLogin={setSecret} />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "waitlist", label: "Waitlist" },
    { id: "users", label: "Users" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <span className="font-bold text-gray-900">PaperBrief</span>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-500 font-medium">Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === "overview" && (
          <OverviewTab
            secret={secret}
            waitlistStats={waitlistStats}
            userCount={userCount}
          />
        )}
        {activeTab === "waitlist" && <WaitlistTab secret={secret} />}
        {activeTab === "users" && <UsersTab secret={secret} />}
      </main>
    </div>
  );
}
