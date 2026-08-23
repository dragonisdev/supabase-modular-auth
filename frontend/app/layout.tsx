import type { Metadata } from "next";

import React, { type ReactNode } from "react";

import { CsrfProvider } from "@/components";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Starter",
  description:
    "A secure full-stack SaaS starter built with Next.js, Express, TypeScript, and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <CsrfProvider>{children}</CsrfProvider>
      </body>
    </html>
  );
}
