/**
 * digest.tsx — React Email template for PaperBrief weekly digest
 *
 * Per-track sections, paper cards with score stars, abstract excerpt,
 * authors, and arXiv links. Matches the welcome email visual style.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import type { Digest, DigestEntry } from "@paperbrief/core";

interface DigestEmailProps {
  digest: Digest;
  unsubscribeUrl?: string;
  dashboardUrl?: string;
}

// ── Score → visual representation ────────────────────────────────────────────

function scoreDots(score: number): string {
  const filled = Math.round(score);
  return "●".repeat(filled) + "○".repeat(5 - filled);
}

function scoreBadge(score: number): { label: string; color: string; bg: string } {
  if (score >= 5) return { label: "🔥 Essential", color: "#b45309", bg: "#fef3c7" };
  if (score >= 4) return { label: "⭐ Relevant", color: "#1d4ed8", bg: "#dbeafe" };
  if (score >= 3) return { label: "📌 Worth a look", color: "#065f46", bg: "#d1fae5" };
  return { label: "· Marginal", color: "#6b7280", bg: "#f3f4f6" };
}

// ── Paper card component ──────────────────────────────────────────────────────

function PaperCard({ entry }: { entry: DigestEntry }) {
  const badge = scoreBadge(entry.score);
  const excerpt =
    entry.summary.length > 200
      ? entry.summary.slice(0, 197) + "…"
      : entry.summary;

  return (
    <Section style={cardStyle}>
      {/* Score badge */}
      <Text style={{ ...badgeStyle, color: badge.color, backgroundColor: badge.bg }}>
        {badge.label} &nbsp; {scoreDots(entry.score)}
      </Text>

      {/* Title */}
      <Text style={cardTitle}>{entry.title}</Text>

      {/* Authors */}
      <Text style={cardMeta}>{entry.authors}</Text>

      {/* Summary excerpt */}
      <Text style={cardBody}>{excerpt}</Text>

      {/* Relevance reason */}
      {entry.reason ? (
        <Text style={cardReason}>Why this matters: {entry.reason}</Text>
      ) : null}

      {/* CTA */}
      <Button href={entry.absUrl} style={paperButton}>
        Read on arXiv →
      </Button>
    </Section>
  );
}

// ── Track section component ───────────────────────────────────────────────────

function TrackSection({
  trackName,
  entries,
}: {
  trackName: string;
  entries: DigestEntry[];
}) {
  return (
    <Section style={trackSectionStyle}>
      <Heading style={trackHeading}>{trackName}</Heading>
      {entries.map((e) => (
        <PaperCard key={e.arxivId} entry={e} />
      ))}
    </Section>
  );
}

// ── Main email component ──────────────────────────────────────────────────────

export function DigestEmail({
  digest,
  unsubscribeUrl = "https://paperbrief.ai/unsubscribe",
  dashboardUrl = "https://paperbrief.ai/dashboard",
}: DigestEmailProps) {
  // Group entries by track
  const byTrack = new Map<string, DigestEntry[]>();
  for (const e of digest.entries) {
    const list = byTrack.get(e.trackName) ?? [];
    list.push(e);
    byTrack.set(e.trackName, list);
  }

  const trackCount = byTrack.size;
  const paperCount = digest.totalPapersIncluded;

  return (
    <Html>
      <Head />
      <Preview>
        {String(paperCount)} paper{paperCount !== 1 ? "s" : ""} picked from{" "}
        {String(digest.totalPapersScanned)} this week — your PaperBrief digest 📄
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={headerSection}>
            <Text style={logo}>📄 PaperBrief</Text>
            <Heading style={h1}>Your weekly digest</Heading>
            <Text style={subtitle}>
              Week of {digest.weekOf} &nbsp;·&nbsp;{" "}
              {paperCount} paper{paperCount !== 1 ? "s" : ""} from{" "}
              {digest.totalPapersScanned} scanned across{" "}
              {trackCount} track{trackCount !== 1 ? "s" : ""}
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Track sections */}
          {[...byTrack.entries()].map(([trackName, entries]) => (
            <TrackSection key={trackName} trackName={trackName} entries={entries} />
          ))}

          {/* Footer CTA */}
          <Hr style={hr} />

          <Section style={ctaSection}>
            <Button href={dashboardUrl} style={ctaButton}>
              Manage your tracks →
            </Button>
          </Section>

          {/* Footer */}
          <Text style={footer}>
            You&apos;re receiving this because you have active PaperBrief tracks.{" "}
            <a href={unsubscribeUrl} style={footerLink}>
              Unsubscribe
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px",
  maxWidth: "600px",
  borderRadius: "8px",
};

const headerSection: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 0 8px",
};

const logo: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#1a1a2e",
  margin: "0 0 8px",
  letterSpacing: "-0.5px",
};

const h1: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#1a1a2e",
  margin: "8px 0 4px",
  lineHeight: "1.2",
};

const subtitle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  margin: "0 0 16px",
};

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "16px 0",
};

const trackSectionStyle: React.CSSProperties = {
  margin: "0 0 24px",
};

const trackHeading: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "700",
  color: "#374151",
  margin: "16px 0 8px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "16px",
  margin: "0 0 12px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "12px",
  fontWeight: "600",
  padding: "2px 8px",
  borderRadius: "9999px",
  margin: "0 0 8px",
};

const cardTitle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#111827",
  margin: "0 0 4px",
  lineHeight: "1.4",
};

const cardMeta: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 8px",
  fontStyle: "italic",
};

const cardBody: React.CSSProperties = {
  fontSize: "13px",
  color: "#374151",
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const cardReason: React.CSSProperties = {
  fontSize: "12px",
  color: "#4b5563",
  fontStyle: "italic",
  margin: "0 0 10px",
  borderLeft: "3px solid #d1d5db",
  paddingLeft: "8px",
};

const paperButton: React.CSSProperties = {
  backgroundColor: "#1a1a2e",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: "600",
  padding: "6px 14px",
  borderRadius: "6px",
  textDecoration: "none",
  display: "inline-block",
};

const ctaSection: React.CSSProperties = {
  textAlign: "center",
  padding: "8px 0",
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#1a1a2e",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  padding: "10px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  display: "inline-block",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center",
  margin: "16px 0 0",
};

const footerLink: React.CSSProperties = {
  color: "#9ca3af",
  textDecoration: "underline",
};
