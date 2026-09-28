import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backend Engineer",
  description:
    "I specialize in Node.js and TypeScript, building backend systems and APIs with a focus on architecture, reliability, and real-world engineering constraints.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
