/**
 * ResubscribeButton — client component for re-subscribe action
 *
 * Makes a POST to /api/resubscribe (requires session cookie).
 * Shows a success/error message inline after the request.
 */

"use client";

import { useState } from "react";

type State = "idle" | "loading" | "success" | "error" | "unauthed";

export default function ResubscribeButton() {
  const [state, setState] = useState<State>("idle");

  async function handleResubscribe() {
    setState("loading");
    try {
      const res = await fetch("/api/resubscribe", {
        method: "POST",
        credentials: "include",
      });

      if (res.status === 401) {
        setState("unauthed");
        return;
      }

      if (!res.ok) {
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <p className="text-sm text-green-400 py-2">
        ✅ You&apos;re re-subscribed! Your next digest will land as usual.
      </p>
    );
  }

  if (state === "unauthed") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-400">
          You need to be signed in to re-subscribe.
        </p>
        <a
          href="/auth/login"
          className="inline-block rounded-lg border border-gray-700 bg-gray-800 px-5 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
        >
          Sign in →
        </a>
      </div>
    );
  }

  if (state === "error") {
    return (
      <p className="text-sm text-red-400 py-2">
        Something went wrong. Please try again or{" "}
        <a href="mailto:hello@paperbrief.io" className="underline">
          contact us
        </a>
        .
      </p>
    );
  }

  return (
    <button
      onClick={handleResubscribe}
      disabled={state === "loading"}
      className="rounded-lg border border-gray-700 bg-gray-800 px-6 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {state === "loading" ? "Re-subscribing…" : "Re-subscribe to digest"}
    </button>
  );
}
