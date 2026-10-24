// Quest + voting functions. Owner: Data + AI.
//
// Vote closing (no cron): call resolveVoting(crewId) whenever the crew page loads
// or someone votes. Winner is chosen when more than half the crew has voted,
// or VOTE_WINDOW_MS after the proposals were created. Ties: earliest vote wins.

/** TODO: check no active/proposed quest this week, run quest agent, save 3 proposed quests. */
export async function generateQuests(crewId: string) {
  void crewId;
  throw new Error("generateQuests not implemented");
}

/** TODO: insert into quest_votes (unique index blocks a second vote), log "voted", resolveVoting. */
export async function castVote(questId: string, userId: string) {
  void questId;
  void userId;
  throw new Error("castVote not implemented");
}

/** TODO: promote the winner to "active", mark others "expired". */
export async function resolveVoting(crewId: string) {
  void crewId;
  throw new Error("resolveVoting not implemented");
}
