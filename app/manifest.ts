// PWA manifest so people can "Add to Home Screen".
// TODO(Frontend): add icons (192px and 512px PNGs in public/).
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PullUp",
    short_name: "PullUp",
    description: "Weekly AI side quests for your crew",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [],
  };
}
