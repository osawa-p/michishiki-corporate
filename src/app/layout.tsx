import type { Metadata } from "next";
import { Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-jp",
});

const shipporiMincho = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-shippori-mincho",
});

const siteName = "株式会社ミチビキ";
const siteDescription =
  "株式会社ミチビキは、SEO・AXO/LLMO（AI検索最適化）・CVR改善・データ分析を軸に、検索エンジンとAIの両方から選ばれるWebマーケティングを戦略から実装まで支援します。";

export const metadata: Metadata = {
  metadataBase: new URL("https://michi-biki.jp"),
  title: {
    default: `${siteName} | SEO・AXO/LLMOコンサルティング`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "株式会社ミチビキ",
    "ミチビキ",
    "SEO",
    "LLMO",
    "AXO",
    "AI検索最適化",
    "SEOコンサルティング",
    "CVR改善",
    "データ分析",
    "michi-biki",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "https://michi-biki.jp",
    siteName,
    title: `${siteName} | SEO・AXO/LLMOコンサルティング`,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | SEO・AXO/LLMOコンサルティング`,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${notoSansJP.variable} ${shipporiMincho.variable} font-sans antialiased bg-paper text-ink`}
      >
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
