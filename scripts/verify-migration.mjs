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

const fixtures = await call("getFixtures");
printSample("getFixtures", fixtures.fixtures || []);

const standings = await call("getStandings");
console.log(`\ngetStandings: leagueA=${(standings.leagueA || []).length}, leagueB=${(standings.leagueB || []).length}`);
(standings.leagueA || []).slice(0, 3).forEach((r, i) => console.log(`  A[${i}]`, r));
(standings.leagueB || []).slice(0, 3).forEach((r, i) => console.log(`  B[${i}]`, r));

const handicaps = await call("getHandicaps");
console.log(`\ngetHandicaps: total=${(handicaps.handicaps || []).length}, latest=${(handicaps.latest || []).length}`);
(handicaps.latest || []).slice(0, 3).forEach((r, i) => console.log(`  latest[${i}]`, r));

const topBreaks = await call("getTopBreaks");
printSample("getTopBreaks", topBreaks.breaks || []);

const seasons = await call("getSeasons");
printSample("getSeasons", seasons.seasons || []);

const leaguesList = await call("getLeagues");
printSample("getLeagues", leaguesList.leagues || []);

const firstFixtureId = fixtures.fixtures?.[0]?.fixtureId;
if (firstFixtureId) {
  const brfx = await call("getBreaksForFixture", { fixtureId: firstFixtureId });
  console.log(`\ngetBreaksForFixture (${firstFixtureId}): ${(brfx.breaks || []).length} breaks`);
} else {
  console.log("\ngetBreaksForFixture: skipped (no fixtures)");
}

console.log("\nVerification complete.");
