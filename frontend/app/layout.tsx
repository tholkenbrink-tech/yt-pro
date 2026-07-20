import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/OfflineBanner";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "yt-pro",
  description: "Persönlicher Video-Downloader für iPhone",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "yt-pro",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="safe-area-shell min-h-screen pb-20">
        <ServiceWorkerRegister />
        <OfflineBanner />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
