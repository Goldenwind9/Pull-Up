// Recap writer: month of quests -> 4-panel comic script -> images -> 1080x1920 card.
// Owner: AI (script + images), Frontend helps with the card layout.
import { z } from "zod";

export const ComicScript = z.object({
  title: z.string(),
  panels: z
    .array(z.object({ scene: z.string(), dialogue: z.string() }))
    .length(4),
});
export type ComicScript = z.infer<typeof ComicScript>;

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/**
 * TODO(AI):
 * 1. Muse Spark writes ComicScript from the month's completed quests + captions
 *    (lib/prompts/recap.ts). Fewer than 4 quests: fill with "crew hanging out" scenes.
 * 2. Draw each panel with IMAGE_PROVIDER using the fixed style prompt.
 * 3. sharp: 2x2 grid on a CARD_WIDTH x CARD_HEIGHT card + crew name + stats from crew_weekly.
 * 4. Upload with lib/storage.putObject and return the key.
 */
export async function buildRecap(crewId: string, periodStart: string, periodEnd: string) {
  void crewId;
  void periodStart;
  void periodEnd;
  throw new Error("buildRecap not implemented");
}
