import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Artisan Coffee Shop",
  description: "Internal ordering and POS system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen bg-cream text-espresso overflow-x-hidden w-full">
        <TopBar />
        <main className="mx-auto w-full max-w-5xl px-3 sm:px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
