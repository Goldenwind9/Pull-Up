// Loads what the recap needs from the database. TODO(Data): implement with Drizzle.
//
// getRecapInput(crewId) returns the crew's UNUSED accepted photos:
//   photos:   proofs where recap_id IS NULL AND the proof is accepted
//             (verdict 'pass', or an 'unsure' the crew approved; check how proofs/[id]/approve records that).
//             Per proof: proofId = proofs.id, questId = quests.id, photoKey = proofs.photo_key,
//             questTitle = quests.title, placeName = quests.place_name, caption = proofs.caption,
//             takenAt = proofs.created_at as an ISO string (toISOString()), confidence = proofs.confidence.
//             Several photos per quest are fine; the recap picks the best one per quest.
//   crewName: crews.name
//   stats:    for the stretch of time since the earliest unused photo:
//             questsDone = distinct quests among the photos, photos = number of photos,
//             votes = 'voted' activity rows in that stretch (or sum the crew_weekly view).
import type { RecapInput } from "@/lib/agents/recap";

export async function getRecapInput(crewId: string): Promise<RecapInput> {
  void crewId;
  throw new Error("getRecapInput is not implemented yet (waiting on the database schema)");
}