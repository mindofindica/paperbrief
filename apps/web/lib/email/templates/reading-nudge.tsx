/**
 * reading-nudge.tsx
 *
 * React Email template for the weekly reading list nudge.
 *
 * Sent when a user has unread papers saved for ≥7 days.
 * Surfaces the top 3 highest-priority / most recent papers and links
 * them to the reading list for easy access.
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
} from '@react-email/components';
import * as React from 'react';

export interface NudgePaper {
  arxiv_id: string;
  title: string;
  authors: string | null;
  track: string | null;
  saved_at: string;
}

export interface ReadingNudgeEmailProps {
  /** User's email (used for personalised greeting) */
  email: string;
  /** Papers to surface (max 3 rendered) */
  papers: NudgePaper[];
  /** Total unread count (may be > papers.length) */
  unreadCount: number;
  /** Full URL to the user's reading list */
  readingListUrl: string;
  /** Personalised unsubscribe URL */
  unsubscribeUrl?: string;
}

function formatAuthors(authorsJson: string | null): string {
  if (!authorsJson) return '';
  try {
    const arr = JSON.parse(authorsJson);
    if (!Array.isArray(arr) || arr.length === 0) return '';
    if (arr.length > 3) return `${arr.slice(0, 3).join(', ')} +${arr.length - 3} more`;
    return arr.join(', ');
  } catch {
    return authorsJson;
  }
}

function daysSince(savedAt: string): string {
  const ms = Date.now() - new Date(savedAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function ReadingNudgeEmail({
  email,
  papers,
  unreadCount,
  readingListUrl,
  unsubscribeUrl,
}: ReadingNudgeEmailProps) {
  const firstName = email.split('@')[0];
  const topPapers = papers.slice(0, 3);

  const previewText =
    unreadCount === 1
      ? `You have 1 unread paper waiting for you 📚`
      : `You have ${unreadCount} unread papers waiting for you 📚`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>Your reading list is waiting</Heading>

          <Text style={paragraph}>
            Hey {firstName} 👋
          </Text>

          <Text style={paragraph}>
            You have <strong>{unreadCount} unread paper{unreadCount !== 1 ? 's' : ''}</strong> saved
            in your reading list.
            {unreadCount === 1
              ? ' Here it is:'
              : ` Here are your top ${Math.min(topPapers.length, unreadCount)}:`}
          </Text>

          {/* Paper cards */}
          {topPapers.map((paper, i) => {
            const authors = formatAuthors(paper.authors);
            const when = daysSince(paper.saved_at);
            const paperUrl = `https://arxiv.org/abs/${paper.arxiv_id}`;

            return (
              <Section key={paper.arxiv_id} style={i > 0 ? paperSectionWithBorder : paperSection}>
                <Text style={paperTitle}>
                  <a href={paperUrl} style={paperTitleLink}>
                    {paper.title}
                  </a>
                </Text>
                {authors && (
                  <Text style={paperMeta}>{authors}</Text>
                )}
                <Text style={paperMeta}>
                  {paper.track ? `${paper.track} · ` : ''}Saved {when}
                </Text>
              </Section>
            );
          })}

          {unreadCount > 3 && (
            <Text style={moreText}>
              …and {unreadCount - 3} more paper{unreadCount - 3 !== 1 ? 's' : ''} in your list.
            </Text>
          )}

          {/* CTA */}
          <Section style={ctaSection}>
            <Button style={button} href={readingListUrl}>
              Open Reading List →
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Sent by{' '}
            <a href="https://paperbrief.ai" style={footerLink}>
              PaperBrief
            </a>
            {' · '}
            {unsubscribeUrl ? (
              <a href={unsubscribeUrl} style={footerLink}>
                Unsubscribe
              </a>
            ) : (
              <a href="https://paperbrief.ai/unsubscribe" style={footerLink}>
                Unsubscribe
              </a>
            )}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '40px 24px',
  backgroundColor: '#ffffff',
};

const logoSection: React.CSSProperties = {
  marginBottom: '24px',
};

const logo: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#111827',
  margin: '0',
};

const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#111827',
  margin: '0 0 16px 0',
};

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#374151',
  margin: '0 0 16px 0',
};

const paperSection: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '14px 16px',
  marginBottom: '10px',
};

const paperSectionWithBorder: React.CSSProperties = {
  ...paperSection,
};

const paperTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#111827',
  margin: '0 0 4px 0',
  lineHeight: '1.4',
};

const paperTitleLink: React.CSSProperties = {
  color: '#111827',
  textDecoration: 'none',
};

const paperMeta: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '0',
  lineHeight: '1.5',
};

const moreText: React.CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '8px 0 16px 0',
  fontStyle: 'italic',
};

const ctaSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '28px 0',
};

const button: React.CSSProperties = {
  backgroundColor: '#4f46e5',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  display: 'inline-block',
};

const hr: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  margin: '24px 0',
};

const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  textAlign: 'center',
  margin: '0',
};

const footerLink: React.CSSProperties = {
  color: '#9ca3af',
  textDecoration: 'underline',
};
