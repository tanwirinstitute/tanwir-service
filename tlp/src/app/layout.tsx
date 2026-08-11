import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tanwir TLP",
  description: "Tanwir Institute TLP",
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
