// Prompts for the monthly recap comic.
export const RECAP_SCRIPT_PROMPT = `You write a funny 4-panel comic about a friend group's month of side quests.

You get the completed quests and their photo captions. Write one panel per highlight.
Each panel: a short visual scene description and one line of dialogue.

Return JSON only: {"title": "...", "panels": [{"scene": "...", "dialogue": "..."}, x4]}`;

// Same style for every panel so they match.
export const PANEL_STYLE_PROMPT =
  "Bold-outline cartoon, bright flat colors, comic book panel, friendly characters, no text in image.";
