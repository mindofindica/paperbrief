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

interface AlreadyWaitlistedEmailProps {
  email: string;
}

export function AlreadyWaitlistedEmail({ email }: AlreadyWaitlistedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You&apos;re already on the PaperBrief waitlist — sit tight!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>You&apos;re already in!</Heading>

          <Text style={paragraph}>
            Hey{email ? ` ${email.split("@")[0]}` : ""} 👋
          </Text>

          <Text style={paragraph}>
            Looks like you&apos;re already on the waitlist — no worries, your
            spot is saved and you&apos;ll be among the first to get access when
            we launch.
          </Text>

          <Text style={paragraph}>
            We&apos;ll reach out the moment early access opens. Thanks for the
            enthusiasm!
          </Text>

          <Section style={ctaSection}>
            <Button
              href="https://paperbrief.ai"
              style={button}
            >
              Back to PaperBrief →
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You&apos;re receiving this because you signed up at{" "}
            <a href="https://paperbrief.ai" style={link}>
              paperbrief.ai
            </a>
            .
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

export default AlreadyWaitlistedEmail;

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
