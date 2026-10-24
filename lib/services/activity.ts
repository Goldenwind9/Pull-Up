// Every core flow calls logActivity when it finishes. This feeds crew_weekly.
import { db, schema } from "@/lib/db";
import type { ActivityKind } from "@/lib/db/schema";

export async function logActivity(input: {
  crewId: string;
  kind: ActivityKind;
  userId?: string;
  questId?: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(schema.activity).values(input);
}
