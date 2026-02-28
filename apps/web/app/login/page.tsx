export default function LoginPage() {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">📄 PaperBrief</h1>
            <p className="text-gray-400 mt-2">Your personal ML research digest</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-4">
            <div className="text-5xl">🔗</div>
            <h2 className="text-xl font-semibold">Sign in via Signal</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Access is invite-only via magic links sent through Signal.
              When your daily digest is ready, you&apos;ll receive a link that logs you in automatically.
            </p>
            <div className="pt-4 border-t border-gray-800">
              <p className="text-gray-500 text-xs">
                No password needed. Links expire after 24 hours.
              </p>
            </div>
          </div>

          <a
            href="/"
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ← Back to home
          </a>
        </div>
      </body>
    </html>
  );
}
