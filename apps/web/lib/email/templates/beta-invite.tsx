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

interface BetaInviteEmailProps {
  email: string;
  inviteUrl: string;
}

export function BetaInviteEmail({ email, inviteUrl }: BetaInviteEmailProps) {
  const username = email.split("@")[0];

  return (
    <Html>
      <Head />
      <Preview>
        Your PaperBrief beta access is ready — click to claim it 🎉
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>You&apos;re in! 🎉</Heading>

          <Text style={paragraph}>Hey {username} 👋</Text>

          <Text style={paragraph}>
            The wait is over — your spot in the PaperBrief beta is ready. As one
            of our founding members, you get early access to everything we&apos;ve
            been building.
          </Text>

          <Section style={highlightBox}>
            <Text style={highlightText}>
              🧠 <strong>What you get:</strong> AI-powered paper summaries,
              personalised weekly digests, and a reading list that keeps pace
              with research — all in plain English.
            </Text>
          </Section>

          <Text style={paragraph}>
            Click the button below to activate your account. This link is unique
            to you and expires in <strong>7 days</strong>.
          </Text>

          <Section style={ctaSection}>
            <Button href={inviteUrl} style={button}>
              Claim Your Beta Access →
            </Button>
          </Section>

          <Text style={smallNote}>
            Or copy this link into your browser:
            <br />
            <a href={inviteUrl} style={link}>
              {inviteUrl}
            </a>
          </Text>

          <Hr style={hr} />

          <Text style={paragraph}>
            Got questions? Just reply to this email — it goes straight to the
            founder.
          </Text>

          <Text style={footer}>
            You&apos;re receiving this because you signed up at{" "}
            <a href="https://paperbrief.ai" style={link}>
              paperbrief.ai
            </a>
            . If this was a mistake, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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

const highlightBox: React.CSSProperties = {
  backgroundColor: "#f0f7ff",
  borderLeft: "4px solid #3b82f6",
  borderRadius: "4px",
  padding: "16px 20px",
  marginBottom: "20px",
};

const highlightText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#1e3a5f",
  margin: "0",
};

const ctaSection: React.CSSProperties = { textAlign: "center", margin: "32px 0" };

const button: React.CSSProperties = {
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
