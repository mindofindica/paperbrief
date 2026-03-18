/**
 * topics.ts
 *
 * Topic taxonomy + query functions for Research Topic Landing Pages.
 * Uses service role key (server-only) — never call from client components.
 */

import { getServiceSupabase } from './supabase';

export interface Topic {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  arxivCats: string[]; // arXiv category codes
  titleKeywords: string[]; // keywords to match in paper titles (ILIKE)
}

export interface TopicPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  categories: string[];
  published_at: string | null;
}

export const TOPICS: Topic[] = [
  {
    slug: 'llm-agents',
    name: 'LLM Agents',
    emoji: '🤖',
    description: 'Autonomous agents powered by large language models, multi-agent systems, and tool-using AI.',
    arxivCats: ['cs.AI', 'cs.MA'],
    titleKeywords: ['agent', 'multi-agent', 'agentic', 'tool use'],
  },
  {
    slug: 'rag-retrieval',
    name: 'RAG & Retrieval',
    emoji: '🔍',
    description: 'Retrieval-augmented generation, knowledge grounding, and neural information retrieval.',
    arxivCats: ['cs.IR', 'cs.CL'],
    titleKeywords: ['retrieval', 'rag', 'retrieval-augmented', 'grounding'],
  },
  {
    slug: 'reasoning',
    name: 'Reasoning',
    emoji: '🧠',
    description: 'Chain-of-thought prompting, logical reasoning, planning, and problem-solving in LLMs.',
    arxivCats: ['cs.AI', 'cs.CL'],
    titleKeywords: ['reasoning', 'chain-of-thought', 'planning', 'problem solving'],
  },
  {
    slug: 'fine-tuning',
    name: 'Fine-tuning & PEFT',
    emoji: '⚙️',
    description: 'Parameter-efficient fine-tuning, LoRA, instruction tuning, and supervised fine-tuning.',
    arxivCats: ['cs.LG'],
    titleKeywords: ['fine-tuning', 'lora', 'peft', 'instruction tuning', 'sft'],
  },
  {
    slug: 'vision-language',
    name: 'Vision & Multimodal',
    emoji: '👁️',
    description: 'Vision-language models, multimodal AI, visual question answering, and image-text alignment.',
    arxivCats: ['cs.CV', 'cs.CL'],
    titleKeywords: ['vision', 'multimodal', 'vlm', 'visual language'],
  },
  {
    slug: 'code-generation',
    name: 'Code Generation',
    emoji: '💻',
    description: 'AI-powered code synthesis, program repair, and automated software engineering.',
    arxivCats: ['cs.SE', 'cs.PL', 'cs.CL'],
    titleKeywords: ['code generation', 'coding', 'programming'],
  },
  {
    slug: 'alignment-safety',
    name: 'Alignment & Safety',
    emoji: '🛡️',
    description: 'AI alignment, RLHF, harmlessness, robustness, and LLM jailbreak research.',
    arxivCats: ['cs.AI', 'cs.LG'],
    titleKeywords: ['alignment', 'safety', 'rlhf', 'harmless', 'jailbreak'],
  },
  {
    slug: 'evaluation',
    name: 'Benchmarks & Evaluation',
    emoji: '📊',
    description: 'LLM benchmarks, evaluation frameworks, surveys, and leaderboard methodology.',
    arxivCats: ['cs.LG', 'cs.CL', 'cs.AI'],
    titleKeywords: ['benchmark', 'evaluation', 'survey', 'leaderboard'],
  },
  {
    slug: 'efficient-inference',
    name: 'Efficient Inference',
    emoji: '⚡',
    description: 'Quantization, pruning, speculative decoding, KV cache, and fast LLM serving.',
    arxivCats: ['cs.LG'],
    titleKeywords: ['inference', 'quantization', 'pruning', 'speculative decoding', 'kv cache'],
  },
  {
    slug: 'foundation-models',
    name: 'Foundation Models',
    emoji: '🏗️',
    description: 'Large language model pretraining, scaling laws, and foundation model architectures.',
    arxivCats: ['cs.LG', 'cs.CL', 'cs.AI'],
    titleKeywords: ['foundation model', 'large language model', 'pretraining', 'scaling'],
  },
  {
    slug: 'reinforcement-learning',
    name: 'Reinforcement Learning',
    emoji: '🎮',
    description: 'RL from human feedback, reward modeling, policy gradient methods, and PPO.',
    arxivCats: ['cs.LG', 'cs.AI'],
    titleKeywords: ['reinforcement learning', 'reward model', 'policy gradient', 'ppo'],
  },
  {
    slug: 'diffusion-models',
    name: 'Diffusion & Generative',
    emoji: '🎨',
    description: 'Diffusion models, image generation, text-to-image synthesis, and generative AI.',
    arxivCats: ['cs.CV', 'cs.LG'],
    titleKeywords: ['diffusion', 'generative', 'image generation', 'stable diffusion', 'text-to-image'],
  },
];

export function getTopicBySlug(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}

export function getAllTopics(): Topic[] {
  return TOPICS;
}

export async function getTopicPapers(
  slug: string,
  limit = 30,
  days = 30,
): Promise<TopicPaper[]> {
  const topic = getTopicBySlug(slug);
  if (!topic) return [];

  try {
    const supabase = getServiceSupabase();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Build OR filter: categories overlap OR any title keyword matches
    const keywordFilters = topic.titleKeywords
      .map((kw) => `title.ilike.%${kw}%`)
      .join(',');
    const catFilter = `categories.ov.{${topic.arxivCats.join(',')}}`;
    const orFilter = [catFilter, keywordFilters].filter(Boolean).join(',');

    const { data, error } = await supabase
      .from('papers')
      .select('arxiv_id, title, abstract, authors, categories, published_at')
      .or(orFilter)
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[getTopicPapers] Supabase error:', error.message);
      return [];
    }

    return (data ?? []) as TopicPaper[];
  } catch (err) {
    console.error('[getTopicPapers] Unexpected error:', err);
    return [];
  }
}

export async function getAllTopicsWithCounts(
  days = 30,
): Promise<Array<Topic & { count: number }>> {
  const results = await Promise.all(
    TOPICS.map(async (topic) => {
      try {
        const papers = await getTopicPapers(topic.slug, 100, days);
        return { ...topic, count: papers.length };
      } catch {
        return { ...topic, count: 0 };
      }
    }),
  );
  return results;
}
