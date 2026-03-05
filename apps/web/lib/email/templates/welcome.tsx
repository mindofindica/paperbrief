import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface WelcomeEmailProps {
  email: string;
}

export function WelcomeEmail({ email }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;re on the PaperBrief waitlist — we&apos;ll be in touch soon 🎉</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo / wordmark */}
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>You&apos;re on the list!</Heading>

          <Text style={paragraph}>
            Hey{email ? ` ${email.split("@")[0]}` : ""} 👋
          </Text>

          <Text style={paragraph}>
            Thanks for signing up — you&apos;re now on the PaperBrief waitlist.
            We&apos;ll let you know the moment early access opens.
          </Text>

          <Text style={paragraph}>
            <strong>What is PaperBrief?</strong>
          </Text>

          <Text style={paragraph}>
            PaperBrief turns dense academic papers into clear, jargon-free
            summaries — so you stay on top of research without drowning in PDFs.
            Every day, the papers that matter to you, distilled into plain
            English.
          </Text>

          <Section style={highlightBox}>
            <Text style={highlightText}>
              🚀 We&apos;re in the final stretch of development. Waitlist members
              get <strong>first access</strong> and a founding-member discount.
            </Text>
          </Section>

          <Text style={paragraph}>
            In the meantime, if you have feedback, thoughts, or just want to say
            hi — hit reply. Every email goes straight to the founder.
          </Text>

          <Section style={ctaSection}>
            <Button
              href="https://paperbrief.vercel.app"
              style={button}
            >
              Visit PaperBrief →
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You&apos;re receiving this because you signed up at{" "}
            <a href="https://paperbrief.vercel.app" style={link}>
              paperbrief.vercel.app
            </a>
            . We won&apos;t spam you — just one email when access opens.
          </Text>
          <Text style={footer}>
            © 2026 PaperBrief · Built with ☕ by{" "}
            <a href="https://x.com/mindofindica" style={link}>
              @mindofindica
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

// ─── Styles ──────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "560px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const logoSection: React.CSSProperties = {
  padding: "24px 40px 0",
};

const logo: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  color: "#1a1a1a",
  margin: "0",
};

const h1: React.CSSProperties = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "24px 40px 16px",
};

const paragraph: React.CSSProperties = {
  color: "#444",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 40px 16px",
};

const highlightBox: React.CSSProperties = {
  backgroundColor: "#f0f7ff",
  borderLeft: "4px solid #2563eb",
  borderRadius: "4px",
  margin: "0 40px 24px",
  padding: "12px 16px",
  width: "100%",
  boxSizing: "border-box",
  display: "block",
};

const highlightText: React.CSSProperties = {
  color: "#1e40af",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0",
  display: "block",
};

const ctaSection: React.CSSProperties = {
  margin: "32px 40px",
  textAlign: "center",
};

const button: React.CSSProperties = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
  display: "inline-block",
};

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "32px 40px",
};

const footer: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0 40px 8px",
};

const link: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "underline",
};
