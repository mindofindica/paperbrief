/**
 * Pre-built research interest templates for new PaperBrief users.
 * Each template maps to one Track that can be created in a single batch call.
 */

export type TrackTemplate = {
  key: string;
  emoji: string;
  name: string;
  description: string;
  keywords: string[];
  arxiv_cats: string[];
  min_score: number;
};

export const TRACK_TEMPLATES: TrackTemplate[] = [
  {
    key: "llms",
    emoji: "🧠",
    name: "Large Language Models",
    description: "Scaling laws, instruction tuning, RLHF, and frontier model research.",
    keywords: [
      "large language model",
      "instruction tuning",
      "RLHF",
      "transformer",
      "GPT",
      "LLaMA",
      "chain-of-thought",
      "in-context learning",
    ],
    arxiv_cats: ["cs.CL", "cs.LG", "cs.AI"],
    min_score: 0.65,
  },
  {
    key: "agents",
    emoji: "🤖",
    name: "AI Agents & Reasoning",
    description: "Autonomous agents, tool use, planning, and multi-step reasoning.",
    keywords: [
      "AI agent",
      "autonomous agent",
      "tool use",
      "planning",
      "ReAct",
      "agentic",
      "multi-agent",
      "task decomposition",
    ],
    arxiv_cats: ["cs.AI", "cs.CL", "cs.LG"],
    min_score: 0.65,
  },
  {
    key: "computer_vision",
    emoji: "👁️",
    name: "Computer Vision",
    description: "Image generation, segmentation, detection, and vision-language models.",
    keywords: [
      "diffusion model",
      "image generation",
      "object detection",
      "segmentation",
      "ViT",
      "vision transformer",
      "CLIP",
      "multimodal",
    ],
    arxiv_cats: ["cs.CV", "cs.LG"],
    min_score: 0.65,
  },
  {
    key: "nlp",
    emoji: "📝",
    name: "NLP & Text Understanding",
    description: "Summarisation, translation, information extraction, and sentiment analysis.",
    keywords: [
      "natural language processing",
      "text classification",
      "named entity recognition",
      "machine translation",
      "summarization",
      "question answering",
      "information extraction",
    ],
    arxiv_cats: ["cs.CL", "cs.IR"],
    min_score: 0.6,
  },
  {
    key: "rl",
    emoji: "🎮",
    name: "Reinforcement Learning",
    description: "RL algorithms, policy optimisation, offline RL, and reward modelling.",
    keywords: [
      "reinforcement learning",
      "policy gradient",
      "reward model",
      "offline RL",
      "PPO",
      "DPO",
      "multi-agent RL",
      "exploration",
    ],
    arxiv_cats: ["cs.LG", "cs.AI"],
    min_score: 0.65,
  },
  {
    key: "efficient_ml",
    emoji: "⚡",
    name: "Efficient ML & Compression",
    description: "Quantisation, pruning, distillation, and fast inference for LLMs.",
    keywords: [
      "quantization",
      "pruning",
      "knowledge distillation",
      "efficient inference",
      "LoRA",
      "model compression",
      "speculative decoding",
      "flash attention",
    ],
    arxiv_cats: ["cs.LG", "cs.CL", "cs.AR"],
    min_score: 0.6,
  },
  {
    key: "multimodal",
    emoji: "🎨",
    name: "Multimodal AI",
    description: "Models that combine vision, language, audio, and other modalities.",
    keywords: [
      "multimodal",
      "vision language model",
      "VLM",
      "image captioning",
      "visual question answering",
      "text-to-image",
      "audio language model",
    ],
    arxiv_cats: ["cs.CV", "cs.CL", "cs.MM"],
    min_score: 0.65,
  },
  {
    key: "safety",
    emoji: "🛡️",
    name: "AI Safety & Alignment",
    description: "Alignment, interpretability, robustness, red-teaming, and safe deployment.",
    keywords: [
      "AI safety",
      "alignment",
      "interpretability",
      "mechanistic interpretability",
      "red teaming",
      "jailbreak",
      "robustness",
      "constitutional AI",
    ],
    arxiv_cats: ["cs.LG", "cs.AI", "cs.CL"],
    min_score: 0.6,
  },
];

/** Look up a template by its key. */
export function getTemplateByKey(key: string): TrackTemplate | undefined {
  return TRACK_TEMPLATES.find((t) => t.key === key);
}

/** Validate that a set of keys are all known template keys. */
export function validateTemplateKeys(keys: string[]): { valid: boolean; unknown: string[] } {
  const known = new Set(TRACK_TEMPLATES.map((t) => t.key));
  const unknown = keys.filter((k) => !known.has(k));
  return { valid: unknown.length === 0, unknown };
}
