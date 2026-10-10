import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { PRESETS } from "@/lib/glass/presets";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "玻璃实验室 GlassLab - 液态玻璃效果实验室",
  description: `基于 Kyant0/AndroidLiquidGlass 算法移植的 Web 液态玻璃实验室，支持 ${PRESETS.length} 种玻璃样式、7-tap 四极光谱色散、菲涅尔高光、导出分享与多用户预设。`,
  keywords: ["液态玻璃", "Liquid Glass", "玻璃实验室", "Kyant0", "Next.js", "React", "SVG 滤镜", "displacement map", "spectral dispersion"],
  authors: [{ name: "GlassLab" }],
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "玻璃实验室 GlassLab",
    description: `Kyant0 液态玻璃算法 Web 移植 · ${PRESETS.length} 种样式实时调节`,
    siteName: "GlassLab",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
