import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host Trading Challenges",
  description: "Run your own trading competitions on WinnerPip. Automated trade tracking, real-time leaderboards, configurable rules, and participant management. Start hosting today.",
  openGraph: {
    title: "Host Trading Challenges | WinnerPip",
    description: "Run your own trading competitions with automated tracking, leaderboards, and fair evaluation. Perfect for trading educators and community leaders.",
  },
};

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
