import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Challenges",
  description: "Browse active and past forex trading challenges on WinnerPip. Join competitions with real prizes, demo or real accounts, and compete on live leaderboards.",
  openGraph: {
    title: "Trading Challenges | WinnerPip",
    description: "Browse active and past forex trading challenges. Join competitions with real prizes and compete on live leaderboards.",
  },
};

export default function ChallengesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
