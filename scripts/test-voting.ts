// Checks quest generation and voting against the real database, using a
// throwaway crew that is deleted at the end.
// Run: `npx tsx scripts/test-voting.ts`. Add `--agent` to also run the real
// quest agent once (uses AI + up to 3 SerpApi searches).
import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const { db, schema } = await import("@/lib/db");
  const { createCrew, joinCrew } = await import("@/lib/services/crews");
  const { castVote, resolveVoting, generateQuests } = await import("@/lib/services/quests");
  const { ServiceError } = await import("@/lib/services/errors");
  const { weekStart } = await import("@/lib/time");

  const week = weekStart();
  const crew = await createCrew({ name: "test-voting", homeLabel: "UT Austin", homeLat: 30.2849, homeLng: -97.7341 });
  const users = [
    await joinCrew(crew.id, "Ana", ["food", "music"]),
    await joinCrew(crew.id, "Ben", ["games"]),
    await joinCrew(crew.id, "Cy", []),
  ];

  async function propose(createdAt = Date.now(), weekStartValue = week) {
    return db
      .insert(schema.quests)
      .values(
        [0, 1, 2].map((i) => ({
          crewId: crew.id,
          weekStart: weekStartValue,
          title: `Quest ${i}`,
          task: "do it",
          placeName: `Place ${i}`,
          source: "google_maps" as const,
          sourceRef: `ref-${i}`,
          proofHint: "photo",
          createdAt: new Date(createdAt + i),
        })),
      )
      .returning();
  }
  async function statuses() {
    const rows = await db
      .select({ title: schema.quests.title, status: schema.quests.status })
      .from(schema.quests)
      .where(eq(schema.quests.crewId, crew.id))
      .orderBy(schema.quests.title);
    return rows.map((r) => `${r.title}:${r.status}`).join(" ");
  }
  async function reset() {
    await db.delete(schema.quests).where(eq(schema.quests.crewId, crew.id));
  }
  async function expectError(fn: () => Promise<unknown>, status: number) {
    await assert.rejects(fn, (e) => e instanceof ServiceError && e.status === status);
  }

  try {
    assert.equal(await resolveVoting(crew.id), null, "no proposals yet");

    // Majority closes the vote; tie goes to the earliest first vote.
    let q = await propose();
    assert.equal(await castVote(q[1].id, users[0].id), null, "1 of 3 votes keeps voting open");
    await expectError(() => castVote(q[2].id, users[0].id), 409); // second vote same week
    const won = await castVote(q[2].id, users[1].id);
    assert.equal(won?.id, q[1].id, "tie 1-1: earliest first vote wins");
    assert.equal(await statuses(), "Quest 0:expired Quest 1:active Quest 2:expired");
    await expectError(() => castVote(q[0].id, users[2].id), 409); // voting closed
    console.log("OK majority + tie-break");

    // 24h window with no votes: agent's first pick wins.
    await reset();
    q = await propose(Date.now() - 25 * 60 * 60 * 1000);
    assert.equal((await resolveVoting(crew.id))?.id, q[0].id);
    console.log("OK 24h window, no votes");

    // Last week's unfinished quest expires; this week's stays open.
    await reset();
    const lastWeek = weekStart(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    await propose(Date.now() - 8 * 24 * 60 * 60 * 1000, lastWeek);
    assert.equal(await resolveVoting(crew.id), null);
    assert.equal(await statuses(), "Quest 0:expired Quest 1:expired Quest 2:expired");
    console.log("OK last week's quests expire");

    // Outsiders can't vote.
    await reset();
    q = await propose();
    const [outsider] = await db.insert(schema.users).values({ name: "Out" }).returning();
    await expectError(() => castVote(q[0].id, outsider.id), 403);
    await db.delete(schema.users).where(eq(schema.users.id, outsider.id));
    console.log("OK outsider rejected");

    // Pull up is refused once this week has quests.
    await expectError(() => generateQuests(crew.id), 409);
    console.log("OK no second set of quests this week");

    if (process.argv.includes("--agent")) {
      await reset();
      // Two taps at once share one agent run.
      const [a, b] = await Promise.all([generateQuests(crew.id), generateQuests(crew.id)]);
      assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
      for (const x of a) console.log(`  ${x.status} | ${x.title} @ ${x.placeName} (${x.source}, ${x.estCost})`);
      console.log(`OK agent made ${a.length} quest(s)`);
    }
  } finally {
    await db.delete(schema.activity).where(eq(schema.activity.crewId, crew.id));
    await db.delete(schema.crews).where(eq(schema.crews.id, crew.id));
    await db.delete(schema.users).where(inArray(schema.users.id, users.map((u) => u.id)));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
