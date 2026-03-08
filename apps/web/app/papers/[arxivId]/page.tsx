import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import PaperDetailClient, { type PaperMeta, type ContentMap } from './PaperDetailClient';

interface Props {
  params: Promise<{ arxivId: string }>;
}

export default async function PaperDetailPage({ params }: Props) {
  const { arxivId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch paper metadata
  const { data: paper } = await supabase
    .from('papers')
    .select('arxiv_id, title, abstract, authors, published_at')
    .eq('arxiv_id', arxivId)
    .single();

  if (!paper) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-gray-700 mb-2">Paper not yet processed</h1>
        <p className="text-gray-500 text-sm">
          This paper hasn&apos;t been picked up by the pipeline yet. It will appear after the next daily digest run.
        </p>
        <p className="mt-2 text-xs text-gray-400">arxiv:{arxivId}</p>
      </div>
    );
  }

  // Fetch all pre-generated content variants
  const { data: contentRows } = await supabase
    .from('paper_content')
    .select('variant, content')
    .eq('arxiv_id', arxivId);

  const content: ContentMap = {};
  for (const row of contentRows ?? []) {
    content[row.variant] = row.content;
  }

  return <PaperDetailClient paper={paper as PaperMeta} content={content} />;
}
