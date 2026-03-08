"use client";

import type { TrackTemplate } from "../../../lib/track-templates";

type TemplateCardProps = {
  template: TrackTemplate;
  selected: boolean;
  onToggle: (key: string) => void;
};

export default function TemplateCard({ template, selected, onToggle }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(template.key)}
      aria-pressed={selected}
      className={[
        "w-full text-left rounded-xl border p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
        selected
          ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-900/30"
          : "border-gray-700 bg-gray-900 hover:border-gray-500 hover:bg-gray-800",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Emoji badge */}
        <span
          className={[
            "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl",
            selected ? "bg-blue-900/60" : "bg-gray-800",
          ].join(" ")}
          aria-hidden="true"
        >
          {template.emoji}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-100">{template.name}</span>
            {selected && (
              <span className="text-xs text-blue-300 font-medium bg-blue-900/50 px-1.5 py-0.5 rounded">
                ✓ Selected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{template.description}</p>

          {/* Keyword preview chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            {template.keywords.slice(0, 4).map((kw) => (
              <span
                key={kw}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700/60"
              >
                {kw}
              </span>
            ))}
            {template.keywords.length > 4 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                +{template.keywords.length - 4} more
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
