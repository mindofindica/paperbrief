"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "magic" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Failed to send magic link");
        return;
      }
      setStatus("success");
      setMessage("Check your email for a sign-in link!");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again?");
    }
  }

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Invalid credentials");
        return;
      }
      setStatus("success");
      setMessage("Signed in!");
      router.push("/dashboard");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again?");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">PaperBrief</h1>
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          {/* Tab switcher */}
          <div className="flex border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => { setMode("password"); setMessage(""); setStatus("idle"); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "password"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-gray-300"
              }`}
            >
              Password
            </button>
            <button
              onClick={() => { setMode("magic"); setMessage(""); setStatus("idle"); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "magic"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-gray-300"
              }`}
            >
              Magic link
            </button>
          </div>

          {mode === "password" ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 font-medium disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-400">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2.5 font-medium disabled:opacity-60 transition-colors"
              >
                {status === "loading" ? "Sending..." : "Send magic link"}
              </button>
            </form>
          )}

          {message && (
            <p className={`text-sm text-center ${status === "error" ? "text-red-400" : "text-green-400"}`}>
              {message}
            </p>
          )}
        </div>

        <a
          href="/"
          className="block text-center text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← Back to home
        </a>
      </div>
    </div>
  );
}
