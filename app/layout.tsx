import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/navigation/SkipLink";
import { rootMetadata } from "@/lib/seo/metadata";
import { themeInitScript } from "@/lib/theme/preference";
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

export const metadata: Metadata = rootMetadata();

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // The <head> script may set `data-theme` before hydration.
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <SiteHeader />
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex-1 outline-none"
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
