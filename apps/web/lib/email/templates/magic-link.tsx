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

interface MagicLinkEmailProps {
  magicUrl: string;
  expiresInHours?: number;
}

export function MagicLinkEmail({ magicUrl, expiresInHours = 24 }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your PaperBrief sign-in link — valid for ${expiresInHours} hours`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logo}>📄 PaperBrief</Text>
          </Section>

          <Heading style={h1}>Sign in to PaperBrief</Heading>

          <Text style={text}>
            Click the button below to sign in. This link is valid for{" "}
            {String(expiresInHours)} hour{expiresInHours !== 1 ? "s" : ""} and can only
            be used once.
          </Text>

          <Section style={buttonSection}>
            <Button href={magicUrl} style={button}>
              Sign in to PaperBrief
            </Button>
          </Section>

          <Text style={hint}>
            Or copy and paste this URL into your browser:
          </Text>
          <Text style={urlText}>{magicUrl}</Text>

          <Hr style={hr} />

          <Text style={footer}>
            If you didn&apos;t request this link, you can safely ignore this
            email. Someone may have entered your address by mistake.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: "#0a0a0f",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  margin: "0 auto",
  padding: "40px 24px",
  maxWidth: "520px",
};

const logoSection: React.CSSProperties = {
  marginBottom: "32px",
};

const logo: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#f9fafb",
  margin: "0",
};

const h1: React.CSSProperties = {
  color: "#f9fafb",
  fontSize: "24px",
  fontWeight: "700",
  margin: "0 0 16px",
};

const text: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 28px",
};

const buttonSection: React.CSSProperties = {
  marginBottom: "24px",
};

const button: React.CSSProperties = {
  backgroundColor: "#2563eb",
  borderRadius: "8px",
  color: "#fff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
};

const hint: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "13px",
  margin: "0 0 4px",
};

const urlText: React.CSSProperties = {
  color: "#60a5fa",
  fontSize: "12px",
  wordBreak: "break-all",
  margin: "0 0 28px",
};

const hr: React.CSSProperties = {
  borderColor: "#1f2937",
  margin: "0 0 24px",
};

const footer: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0",
};
