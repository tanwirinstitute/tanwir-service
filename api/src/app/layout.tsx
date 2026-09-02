import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tanwir API",
  description: "Internal APIs for Tanwir Institute",
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
