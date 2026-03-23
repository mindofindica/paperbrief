import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface OnboardingActiveEmailProps {
  /** The user's email address — used to personalise the greeting */
  email: string;
  /** Base URL of the app — e.g. "https://paperbrief.ai" */
  appUrl?: string;
}

const DEFAULT_APP_URL = "https://paperbrief.ai";

export function OnboardingActiveEmail({
  email,
  appUrl = DEFAULT_APP_URL,
}: OnboardingActiveEmailProps) {
  const firstName = email.split("@")[0];

  const features = [
    {
      icon: "📰",
      title: "Paper of the Day",
      desc: "One standout paper from ML/AI research, every day.",
      href: `${appUrl}/today`,
      cta: "See today's paper",
    },
    {
      icon: "🗂️",
      title: "Browse Topics",
      desc: "Explore curated research areas — from LLMs to robotics.",
      href: `${appUrl}/topics`,
      cta: "Browse topics",
    },
    {
      icon: "📅",
      title: "Daily Digest",
      desc: "Papers scored by relevance to your tracks, every morning.",
      href: `${appUrl}/digest`,
      cta: "Go to digest",
    },
  ];

  return (
    <Html>
      <Head />
      <Preview>You&apos;re in — here&apos;s what to explore on PaperBrief 🎉</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>You&apos;re in, {firstName}! 🎉</Heading>

          <Text style={paragraph}>
            Your PaperBrief account is active. Every morning you&apos;ll receive
            a digest of the most relevant ML &amp; AI papers — scored and ranked
            to your research interests.
          </Text>

          <Text style={paragraph}>
            While your first digest is being prepared, here&apos;s what you can
            explore right now:
          </Text>

          {/* 3-column feature grid */}
          <Section style={featureGrid}>
            <Row>
              {features.map((f) => (
                <Column key={f.title} style={featureCol}>
                  <Section style={featureCard}>
                    <Text style={featureIcon}>{f.icon}</Text>
                    <Text style={featureTitle}>{f.title}</Text>
                    <Text style={featureDesc}>{f.desc}</Text>
                    <Button href={f.href} style={featureButton}>
                      {f.cta} →
                    </Button>
                  </Section>
                </Column>
              ))}
            </Row>
          </Section>

          {/* Primary CTA */}
          <Section style={ctaSection}>
            <Button href={`${appUrl}/settings`} style={primaryButton}>
              Customise your tracks →
            </Button>
          </Section>

          <Text style={smallNote}>
            You can fine-tune keywords, arXiv categories, and minimum score
            thresholds at any time from{" "}
            <a href={`${appUrl}/settings`} style={link}>
              Settings
            </a>
            .
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            You&apos;re receiving this because you just activated your account at{" "}
            <a href={appUrl} style={link}>
              paperbrief.ai
            </a>
            . Questions? Reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const main: React.CSSProperties = {
  backgroundColor: "#f4f5f7",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "40px",
  borderRadius: "8px",
  maxWidth: "560px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const logoSection: React.CSSProperties = { marginBottom: "24px" };

const logo: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#1a1a2e",
  margin: "0",
};

const h1: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: "700",
  color: "#1a1a2e",
  marginBottom: "16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#444",
  marginBottom: "16px",
};

const featureGrid: React.CSSProperties = {
  marginBottom: "24px",
};

const featureCol: React.CSSProperties = {
  width: "33.33%",
  verticalAlign: "top",
  paddingRight: "8px",
};

const featureCard: React.CSSProperties = {
  backgroundColor: "#f8faff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center",
};

const featureIcon: React.CSSProperties = {
  fontSize: "28px",
  margin: "0 0 8px 0",
  textAlign: "center",
};

const featureTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "700",
  color: "#1a1a2e",
  margin: "0 0 6px 0",
  textAlign: "center",
};

const featureDesc: React.CSSProperties = {
  fontSize: "12px",
  color: "#666",
  lineHeight: "1.4",
  margin: "0 0 12px 0",
  textAlign: "center",
};

const featureButton: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  color: "#2563eb",
  fontSize: "11px",
  fontWeight: "600",
  padding: "6px 10px",
  borderRadius: "4px",
  textDecoration: "none",
  display: "inline-block",
  border: "1px solid #bfdbfe",
};

const ctaSection: React.CSSProperties = { textAlign: "center", margin: "32px 0" };

const primaryButton: React.CSSProperties = {
  backgroundColor: "#3b82f6",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  padding: "14px 28px",
  borderRadius: "6px",
  textDecoration: "none",
  display: "inline-block",
};

const smallNote: React.CSSProperties = {
  fontSize: "12px",
  color: "#888",
  textAlign: "center",
  marginBottom: "24px",
};

const hr: React.CSSProperties = {
  borderColor: "#e8e8e8",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#aaa",
  lineHeight: "1.5",
};

const link: React.CSSProperties = { color: "#3b82f6" };
