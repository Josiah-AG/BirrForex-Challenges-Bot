import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WinnerPip | Trading Competition Platform",
    template: "%s | WinnerPip",
  },
  description: "Join live forex trading challenges, compete on real-time leaderboards, and win prizes. WinnerPip tracks your MT5 trades automatically with fair rule evaluation. Host your own trading competitions.",
  keywords: [
    "trading competition", "forex challenge", "trading challenge platform",
    "MT5 trading contest", "forex leaderboard", "trading competition hosting",
    "forex trading prizes", "live trading challenge", "demo trading contest",
    "trading competition management", "WinnerPip", "BirrForex",
  ],
  authors: [{ name: "BirrForex", url: "https://linktr.ee/birrforex" }],
  creator: "BirrForex",
  publisher: "WinnerPip",
  metadataBase: new URL("https://winnerpip.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://winnerpip.com",
    siteName: "WinnerPip",
    title: "WinnerPip | Trading Competition Platform",
    description: "Join live forex trading challenges, compete on real-time leaderboards, and win prizes. Automated MT5 trade tracking with fair rule evaluation.",
    images: [
      {
        url: "/winnerpip_512.png",
        width: 512,
        height: 512,
        alt: "WinnerPip Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "WinnerPip | Trading Competition Platform",
    description: "Join live forex trading challenges, compete on real-time leaderboards, and win prizes.",
    images: ["/winnerpip_512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "WinnerPip",
              "url": "https://winnerpip.com",
              "description": "Trading competition platform with automated MT5 trade tracking, real-time leaderboards, and configurable rules.",
              "applicationCategory": "FinanceApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD",
              },
              "creator": {
                "@type": "Organization",
                "name": "BirrForex",
                "url": "https://linktr.ee/birrforex",
              },
            }),
          }}
        />
      </head>
      <body className="antialiased bg-[#0a0e1a] text-white">
        {children}
      </body>
    </html>
  );
}
