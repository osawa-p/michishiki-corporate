import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-jp",
});

const siteName = "株式会社ミチビキ";
const siteDescription =
  "株式会社ミチビキは、人とペットの豊かな未来を支えるサービスを提供しています。";

export const metadata: Metadata = {
  metadataBase: new URL("https://michi-biki.jp"),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "株式会社ミチビキ",
    "ミチビキ",
    "ペット",
    "ペットサービス",
    "人とペット",
    "動物",
    "企業",
    "会社",
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
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
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
      <body className={`${notoSansJP.variable} font-sans antialiased bg-white text-gray-800`}>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
