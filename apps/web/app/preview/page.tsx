import AppNav from '../components/AppNav';
import PreviewClient from './PreviewClient';

export const metadata = {
  title: 'Preview Digest — PaperBrief',
  description: "Dry-run your next digest to see which papers would be included, before it\u2019s sent.",
};

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-100">📬 Digest Preview</h1>
          <p className="text-sm text-gray-500">
            See what your next digest would contain — no email sent, nothing saved.
          </p>
        </header>

        <PreviewClient />
      </main>
    </div>
  );
}
