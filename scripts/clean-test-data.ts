// Deletes test data: every crew except the demo crew (invite code "demo"), with its
// quests, votes, photos, recaps and activity, plus users left in no crew, plus storage
// files of crews that no longer exist. Keeps the demo crew and the SerpApi cache.
//
// Run: `npm run db:clean` to see what would go, then `npm run db:clean -- --yes` to delete.
import "dotenv/config";
import { inArray, ne, sql } from "drizzle-orm";

const KEEP_INVITE_CODE = "demo";

async function main() {
  const { db, schema } = await import("@/lib/db");
  const { listKeys, deleteKeys } = await import("@/lib/storage");
  const apply = process.argv.includes("--yes");

  const doomed = await db
    .select({ id: schema.crews.id, name: schema.crews.name })
    .from(schema.crews)
    .where(ne(schema.crews.inviteCode, KEEP_INVITE_CODE));
  const doomedIds = doomed.map((c) => c.id);
  console.log(`Crews to delete (${doomed.length}): ${doomed.map((c) => c.name).join(", ") || "none"}`);

  if (apply && doomedIds.length) {
    // Activity has no foreign key, so it goes first by hand. Members, quests, votes,
    // proofs and recaps cascade with the crew.
    await db.delete(schema.activity).where(inArray(schema.activity.crewId, doomedIds));
    await db.delete(schema.crews).where(inArray(schema.crews.id, doomedIds));
  }

  // Users in no crew (after the delete above when applying).
  const lonely = await db.execute<{ id: string }>(sql`
    SELECT u.id FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM crew_members m
      WHERE m.user_id = u.id ${apply ? sql`` : sql`AND m.crew_id NOT IN (SELECT id FROM crews WHERE invite_code <> ${KEEP_INVITE_CODE})`}
    )`);
  console.log(`Users in no crew to delete: ${lonely.length}`);
  if (apply && lonely.length) {
    await db.delete(schema.users).where(inArray(schema.users.id, lonely.map((u) => u.id)));
  }

  // Storage: photo and recap files whose crew (second path segment) is gone.
  const kept = new Set(
    (await db.select({ id: schema.crews.id }).from(schema.crews)).map((c) => c.id).filter((id) => apply || !doomedIds.includes(id)),
  );
  const keys = [...(await listKeys("proofs/")), ...(await listKeys("recaps/"))];
  const orphans = keys.filter((key) => !kept.has(key.split("/")[1]));
  console.log(`Storage files of deleted crews: ${orphans.length} (of ${keys.length})`);
  if (apply && orphans.length) await deleteKeys(orphans);

  console.log(apply ? "Done." : "Nothing deleted. Run again with --yes to delete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
