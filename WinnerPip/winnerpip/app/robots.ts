import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/host/dashboard", "/host/login", "/host/register", "/settings"],
      },
    ],
    sitemap: "https://winnerpip.com/sitemap.xml",
  };
}
