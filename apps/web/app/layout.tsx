import "./globals.css";
import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://paperbrief.ai";

export const metadata: Metadata = {
  title: "PaperBrief — Your personal ML research digest",
  description:
    "PaperBrief reads 500+ ML papers a day so you don't have to. Enter your research interests, get a weekly digest of the papers that actually matter — ranked by relevance, summarised in plain English.",
  openGraph: {
    title: "PaperBrief — Stop drowning in arxiv",
    description:
      "Your personal research radar. Weekly digest of the ML papers that matter to your work.",
    url: SITE_URL,
    siteName: "PaperBrief",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "PaperBrief — Your personal ML research digest",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperBrief — Stop drowning in arXiv",
    description:
      "Your personal research radar. Weekly digest of the ML papers that matter to your work.",
    images: [`${SITE_URL}/opengraph-image`],
  },
  // Auto-discovery: RSS readers pick this up automatically
  alternates: {
    types: {
      "application/rss+xml": `${SITE_URL}/rss`,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
