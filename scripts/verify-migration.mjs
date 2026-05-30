#!/usr/bin/env node
/**
 * Hit each `ierne-api` Edge Function action and print counts + a sample
 * so you can sanity-check the migration without opening a browser.
 *
 * Required env:
 * - IERNE_API_URL  (e.g. https://yzyipxvlsoxfphwobfkb.functions.supabase.co/ierne-api)
 *
 * Usage:
 *   IERNE_API_URL=https://...supabase.co/ierne-api node scripts/verify-migration.mjs
 */

const API_URL = (process.env.IERNE_API_URL || "").replace(/\/$/, "");
if (!API_URL) {
  console.error("Missing required env: IERNE_API_URL");
  process.exit(1);
}

async function call(action, extraParams = {}) {
  const u = new URL(API_URL);
  u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  const res = await fetch(u.toString());
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${action}: invalid JSON (status ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!parsed.success) {
    throw new Error(`${action} returned error: ${parsed.error || "unknown"}`);
  }
  return parsed;
}

function printSample(label, arr) {
  console.log(`\n${label}: ${arr.length} rows`);
  arr.slice(0, 3).forEach((r, i) => console.log(`  [${i}]`, r));
}

const players = await call("getPlayers");
printSample("getPlayers", players.players || []);

const fixtures = await call("getFixtures", { competitionType: "league" });
printSample("getFixtures (league comp)", fixtures.fixtures || []);

const standings = await call("getStandings", { competitionType: "league" });
const groups = standings.groups || [];
console.log(`\ngetStandings: ${groups.length} group(s)`);
groups.forEach((g) => {
  console.log(`  ${g.groupId} (${g.name}): ${(g.rows || []).length} rows`);
  (g.rows || []).slice(0, 2).forEach((r, i) => console.log(`    [${i}]`, r));
});

const handicaps = await call("getHandicaps");
console.log(`\ngetHandicaps: total=${(handicaps.handicaps || []).length}, latest=${(handicaps.latest || []).length}`);
(handicaps.latest || []).slice(0, 3).forEach((r, i) => console.log(`  latest[${i}]`, r));

const topBreaks = await call("getTopBreaks", { competitionType: "league" });
printSample("getTopBreaks", topBreaks.breaks || []);

const comps = await call("getCompetitions");
printSample("getCompetitions", comps.competitions || []);

const leagueComp = (comps.competitions || []).find((c) => c.competitionType === "league" && c.isCurrent)
  || (comps.competitions || []).find((c) => c.competitionType === "league");
if (leagueComp) {
  const compGroups = await call("getCompetitionGroups", { compId: leagueComp.compId });
  printSample(`getCompetitionGroups (${leagueComp.compId})`, compGroups.groups || []);
} else {
  console.log("\ngetCompetitionGroups: skipped (no league comp)");
}

const firstFixtureId = fixtures.fixtures?.[0]?.fixtureId;
if (firstFixtureId) {
  const brfx = await call("getBreaksForFixture", { fixtureId: firstFixtureId });
  console.log(`\ngetBreaksForFixture (${firstFixtureId}): ${(brfx.breaks || []).length} breaks`);
} else {
  console.log("\ngetBreaksForFixture: skipped (no fixtures)");
}

console.log("\nVerification complete.");
