import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tanwir Emailer",
  description: "Transactional email service for Tanwir Institute",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
