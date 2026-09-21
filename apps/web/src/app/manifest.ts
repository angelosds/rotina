import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rotina",
    short_name: "Rotina",
    description: "Sua rotina, em um só lugar.",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#141414",
  };
}
