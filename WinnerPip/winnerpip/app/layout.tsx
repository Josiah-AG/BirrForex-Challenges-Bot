import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WinnerPip - Trade, Compete, Win",
  description: "Trading Competition Management Platform",
  icons: {
    icon: "/winnerpip-icon.png",
    apple: "/winnerpip-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0e1a] text-white">
        {children}
      </body>
    </html>
  );
}
