"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      setMessage("Check your email!");
      setEmail("");
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
          <p className="text-gray-400">Sign in with a magic link</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full border border-gray-700 rounded-lg px-3 py-2 bg-gray-950 text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 disabled:opacity-60"
          >
            {status === "loading" ? "Sending..." : "Send magic link"}
          </button>

          {message ? (
            <p className={`text-sm ${status === "error" ? "text-red-400" : "text-green-400"}`}>
              {message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
