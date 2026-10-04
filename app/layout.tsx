import type { Metadata, Viewport } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Artisan Coffee Shop",
  description: "Internal ordering and POS system",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen bg-cream text-espresso overflow-x-hidden w-full antialiased selection:bg-latte selection:text-espresso">
        <TopBar />
        <main className="mx-auto w-full max-w-5xl px-3 sm:px-5 py-3 sm:py-6">{children}</main>
      </body>
    </html>
  );
}

