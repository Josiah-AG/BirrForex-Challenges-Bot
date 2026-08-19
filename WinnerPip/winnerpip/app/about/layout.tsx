import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "WinnerPip is a trading competition platform providing automated MT5 trade tracking, rule evaluation, and real-time leaderboards for forex trading challenges. Powered by BirrForex.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
