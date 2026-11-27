import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";

export const metadata: Metadata = {
  title: "تحدّي | خطوات صغيرة، أثر كبير",
  description: "منصة متابعة العادات اليومية والإنجازات والمنافسة.",
  manifest: "/manifest.webmanifest",
  applicationName: "تحدّي",
};

export const viewport: Viewport = { themeColor: "#f5f8fc", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body><AppProvider>{children}</AppProvider><script dangerouslySetInnerHTML={{ __html: "if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));" }} /></body></html>;
}
