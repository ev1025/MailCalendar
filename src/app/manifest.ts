import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "매일 캘린더",
    short_name: "매일",
    description: "캘린더, 가계부, 메모, 영양제 비교",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F172A",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
