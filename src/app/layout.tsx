import type { Metadata } from "next";
import { Spectral, Public_Sans, Martian_Mono } from "next/font/google";
import "./globals.css";

// Self hosted by next/font, so no request leaves the page at runtime and there
// is no layout shift to design around.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-spectral",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const martianMono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Verso",
  description: "Invoice fields, filled by a model and confirmed by a person.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${publicSans.variable} ${martianMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
