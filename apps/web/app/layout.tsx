export const metadata = {
  title: "PaperBrief",
  description: "Your personal ML research digest, powered by AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
