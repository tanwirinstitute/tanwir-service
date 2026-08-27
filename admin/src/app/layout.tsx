import type { Metadata, Viewport } from "next";
import "./globals.css";

const OG_IMAGE_URL =
  "https://images.squarespace-cdn.com/content/66a00d45db79b1271d17284d/cad43153-54bc-437a-b1cf-d221fd59c690/tanwir-social.jpg?content-type=image%2Fjpeg";

export const metadata: Metadata = {
  title: "Tanwir Institute - Registration",
  description: "Tanwir Institute admin",
  openGraph: {
    title: "Tanwir Institute - Registration",
    description: "Tanwir Institute admin",
    images: [{ url: OG_IMAGE_URL }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
