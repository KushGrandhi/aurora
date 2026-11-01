import { z } from "zod";
import type { ComponentDef } from "../registry.ts";

export const MediaSchema = z.object({
  type: z.literal("media"),
  items: z.array(z.object({ src: z.string().min(1), kind: z.enum(["image", "video"]).optional(), caption: z.string().optional(), alt: z.string().optional() })).min(1).max(60),
  layout: z.enum(["single", "gallery"]).optional(),
});
export type Media = z.infer<typeof MediaSchema>;

export const media: ComponentDef<Media> = {
  type: "media",
  schema: MediaSchema,
  doc: {
    summary: "Images and videos that already exist — one large, or a gallery with a lightbox.",
    example: { type: "media", layout: "gallery", items: [{ src: "/abs/path/screenshot.png", caption: "Home screen", alt: "The home screen" }, { src: "https://example.com/demo.mp4", caption: "Demo" }] },
    guidance: "Media is displayed, never generated. `src` is an absolute local path or an http(s) URL; local files are served only because this view references them. Supported: png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v, ogg. A missing file comes back as a warning.",
  },
  media: (c) => c.items.map((i) => i.src),
};
