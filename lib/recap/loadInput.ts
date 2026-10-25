// Loads what the recap needs from the database: crew name, completed quests with
// captions, and summed stats from crew_weekly.
// TODO(Data/AI): implement with Drizzle once lib/db/schema.ts is final.
import type { RecapInput } from "@/lib/agents/recap";

export async function getRecapInput(crewId: string, periodStart: string, periodEnd: string): Promise<RecapInput> {
  void crewId;
  void periodStart;
  void periodEnd;
  throw new Error("getRecapInput is not implemented yet (waiting on the database schema)");
}