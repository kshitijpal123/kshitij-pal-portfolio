import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/*
 * Sans and serif are variable fonts: one file per subset covers every weight.
 * Usable weights are limited by the `--font-weight-*` tokens in globals.css.
 * Only the body face is preloaded; serif and mono download on first use.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  preload: false,
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  preload: false,
});

export const metadata: Metadata = {
  title: "Backend Engineer",
  description:
    "I specialize in Node.js and TypeScript, building backend systems and APIs with a focus on architecture, reliability, and real-world engineering constraints.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
