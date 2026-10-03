import {getPublicCompetitions} from "@/lib/publicCompetitions";
import { MetadataRoute } from "next";

export const revalidate=60;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 const challenges=await getPublicCompetitions();
  return [
 {url:"https://winnerpip.com/competitions",changeFrequency:"daily",priority:0.9},
 ...challenges.map(c=>({url:`https://winnerpip.com/competitions/${c.id}`,changeFrequency:"daily" as const,priority:0.8})),
    {
      url: "https://winnerpip.com",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://winnerpip.com/challenges",
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://winnerpip.com/host",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://winnerpip.com/about",
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://winnerpip.com/terms",
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://winnerpip.com/privacy",
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
