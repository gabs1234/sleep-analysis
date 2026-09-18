import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/common/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sleep Journal",
  description: "A personal timeline for sleep, wellbeing, and structured self-experiments",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sleep Journal",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f3ee",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[#f5f3ee]`}
    >
      <body className="flex min-h-full flex-col bg-[#f5f3ee] text-[#252421] selection:bg-[#dcd3ff]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
