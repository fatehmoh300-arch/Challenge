import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تحدّي | CHALLENGE",
    short_name: "تحدّي",
    description: "خطوات صغيرة، أثر كبير.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f8fc",
    theme_color: "#f5f8fc",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
