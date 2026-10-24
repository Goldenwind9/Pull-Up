// Checks every outside service once: `npm run smoke`.
// This is the "all keys working" check at the end of Phase 1.
import "dotenv/config";
import { sql } from "drizzle-orm";

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    console.log(`OK   ${name}`, out ?? "");
  } catch (err) {
    console.log(`FAIL ${name}`, err instanceof Error ? err.message : err);
  }
}

async function main() {
  const { db } = await import("@/lib/db");
  const { ai, MODEL } = await import("@/lib/ai");
  const { searchPlaces } = await import("@/lib/serp");
  const { putObject, getObject } = await import("@/lib/storage");

  await check("Tiger Cloud", async () => {
    const rows = await db.execute(sql`SELECT hypertable_name FROM timescaledb_information.hypertables`);
    return rows.map((r) => r.hypertable_name);
  });
  await check("Muse Spark", async () => {
    const res = await ai.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Say hi in 3 words." }],
    });
    return res.choices[0]?.message.content;
  });
  await check("SerpApi", async () => {
    const places = await searchPlaces("coffee", 30.2849, -97.7341);
    return places.slice(0, 2).map((p) => p.name);
  });
  await check("Vultr storage", async () => {
    await putObject("smoke/hello.txt", Buffer.from("hello"), "text/plain");
    return (await getObject("smoke/hello.txt")).toString();
  });
  process.exit(0);
}

main();
