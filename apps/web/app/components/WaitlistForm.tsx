"use client";

import { useState } from "react";

export type WaitlistFormProps = {
  className?: string;
  buttonText?: string;
  inputPlaceholder?: string;
  compact?: boolean;
  note?: string;
};

export default function WaitlistForm({
  className = "",
  buttonText = "Join the waitlist",
  inputPlaceholder = "you@university.edu",
  compact = false,
  note,
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "Something went wrong");
        return;
      }
      setStatus("success");
      setMessage(data?.message || "You're on the list!");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage("Network error. Try again?");
    }
  }

  const inputBase = compact
    ? "text-sm px-3 py-2"
    : "text-base px-4 py-3";
  const buttonBase = compact
    ? "text-sm px-3 py-2"
    : "text-base px-6 py-3";

  return (
    <div className={`w-full ${className}`}>
      <form
        onSubmit={onSubmit}
        className={`flex flex-col sm:flex-row gap-3 ${compact ? "items-center" : "justify-center"}`}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={inputPlaceholder}
          className={`w-full sm:w-auto border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 ${inputBase}`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-60 ${buttonBase}`}
        >
          {status === "loading" ? "Joining..." : buttonText}
        </button>
      </form>
      {note ? (
        <p className="text-gray-500 text-sm mt-2 text-center">{note}</p>
      ) : null}
      {message ? (
        <p
          className={`text-sm mt-2 text-center ${
            status === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
