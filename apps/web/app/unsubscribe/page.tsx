/**
 * /unsubscribe — Confirmation page after email unsubscribe
 *
 * Shown after the GET /api/unsubscribe redirect.
 *
 * Query params:
 *   ?status=success  → show "You've been unsubscribed" + re-subscribe button
 *   ?status=error    → show friendly error (bad token)
 *   (default)        → neutral landing (no token in URL — reached manually)
 */

import ResubscribeButton from "./ResubscribeButton";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo */}
        <p className="text-3xl">📄</p>
        <p className="text-lg font-bold tracking-tight text-gray-100">PaperBrief</p>

        {status === "success" && <SuccessView />}
        {status === "error" && <ErrorView />}
        {!status && <NeutralView />}
      </div>
    </div>
  );
}

// ── Status views ──────────────────────────────────────────────────────────────

function SuccessView() {
  return (
    <>
      <div className="rounded-2xl border border-gray-800 bg-gray-900 px-8 py-10 space-y-4">
        <p className="text-4xl">✅</p>
        <h1 className="text-2xl font-bold text-gray-100">You&apos;re unsubscribed</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          You&apos;ve been removed from the PaperBrief digest. You won&apos;t receive
          any more research emails from us.
        </p>
        <p className="text-gray-500 text-xs">
          Changed your mind? You can re-subscribe below (requires signing in).
        </p>
      </div>

      {/* Re-subscribe button — client component handles the POST */}
      <ResubscribeButton />

      <p className="text-xs text-gray-600">
        Your reading list and tracks are preserved.{" "}
        <a href="/dashboard" className="text-gray-500 hover:text-gray-300 underline transition-colors">
          Visit dashboard
        </a>
      </p>
    </>
  );
}

function ErrorView() {
  return (
    <>
      <div className="rounded-2xl border border-red-900/50 bg-gray-900 px-8 py-10 space-y-4">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-2xl font-bold text-gray-100">Something went wrong</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          This unsubscribe link is invalid or may have been tampered with.
          Try clicking the link directly from your email.
        </p>
      </div>

      <p className="text-xs text-gray-600">
        Need help?{" "}
        <a
          href="mailto:hello@paperbrief.io"
          className="text-gray-500 hover:text-gray-300 underline transition-colors"
        >
          Contact us
        </a>
      </p>
    </>
  );
}

function NeutralView() {
  return (
    <>
      <div className="rounded-2xl border border-gray-800 bg-gray-900 px-8 py-10 space-y-4">
        <h1 className="text-2xl font-bold text-gray-100">Email preferences</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          To unsubscribe from PaperBrief digest emails, click the unsubscribe
          link at the bottom of any email we&apos;ve sent you.
        </p>
        <p className="text-gray-500 text-sm">
          You can also manage your preferences from the{" "}
          <a href="/dashboard" className="text-gray-400 hover:text-gray-200 underline transition-colors">
            dashboard
          </a>
          .
        </p>
      </div>
    </>
  );
}
