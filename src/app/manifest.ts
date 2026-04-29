import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Our Little Ledger",
    short_name: "Little Ledger",
    description: "A warm little household spending tracker.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FFF9F2",
    theme_color: "#EFA6B8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
