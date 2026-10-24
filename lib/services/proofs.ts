// Photo proof functions. Owner: Data + AI.
// One "pass" (or approved "unsure") from anyone completes the quest for the crew.

/**
 * TODO: putObject(photo) -> verifyProof -> save proof row -> log "proof_submitted".
 * If pass: mark quest "done", log "quest_completed".
 */
export async function submitProof(questId: string, userId: string, photo: Buffer, contentType: string) {
  void questId;
  void userId;
  void photo;
  void contentType;
  throw new Error("submitProof not implemented");
}

/** TODO: any crew member except the uploader can approve an "unsure" proof. */
export async function approveProof(proofId: string, userId: string) {
  void proofId;
  void userId;
  throw new Error("approveProof not implemented");
}
