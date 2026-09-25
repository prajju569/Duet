import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duet",
    short_name: "Duet",
    description: "Chat and listen to the same song, in sync.",
    start_url: "/",
    display: "standalone",
    background_color: "#120c10",
    theme_color: "#120c10",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
