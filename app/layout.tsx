import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VAELKOR CIVIC — civic works ledger",
  description:
    "Report infrastructure problems, confirm them with your neighbours, and track repair through evidence-backed inspection.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} font-sans antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius)] focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
            >
              Skip to content
            </a>
            <AppHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <AppFooter />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

