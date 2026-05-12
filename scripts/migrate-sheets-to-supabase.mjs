#!/usr/bin/env node
/**
 * Migrate Ierne Snooker League data from public Google Sheets CSVs into the
 * Supabase `ierne_snooker` schema.
 *
 * Required env (load via .env or shell):
 * - SUPABASE_DB_URL  (postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres)
 *
 * Optional env (defaults match the original sheet ids):
 * - SHEET_BASE_ID
 * - SHEET_GID_FIXTURES
 * - SHEET_GID_LEAGUES
 * - SHEET_GID_HANDICAPS
 * - SEASON_ID            (default: '2025-26')
 * - SEASON_NAME          (default: '2025/26 Season')
 * - SEASON_STARTS_ON     (default: <SEASON_ID first half>-09-01)
 * - SEASON_ENDS_ON       (default: <SEASON_ID second half>-05-31)
 *
 * Usage:
 *   npm install                                                 # one-time, installs `pg`
 *   node scripts/migrate-sheets-to-supabase.mjs --dry-run
 *   node scripts/migrate-sheets-to-supabase.mjs
 *
 * Notes:
 * - Talks directly to Postgres (not PostgREST) so the `ierne_snooker` schema
 *   does not need to be added to the project's Exposed Schemas list.
 * - The fixtures sheet has no league column. League membership is derived
 *   from the leagues sheet (cols 0-5 = League A, cols 7-12 = League B) and
 *   stored in `ierne_snooker.season_players`.
 * - Player IDs are deterministic slugs of the player name so reruns are
 *   idempotent.
 * - Knockout fixtures (round_label in 'CS','CF','PQ','PS','PF') are
 *   tagged with stage = 'knockout' and league_id = NULL.
 * - The `league_standings` table no longer exists; standings are computed
 *   live by the `league_standings_v` view from `fixtures`. So this script
 *   no longer touches them.
 */

import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || "";
const SHEET_BASE_ID = process.env.SHEET_BASE_ID
  || "2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z";
const SHEET_GID_FIXTURES = process.env.SHEET_GID_FIXTURES || "2003970244";
const SHEET_GID_LEAGUES = process.env.SHEET_GID_LEAGUES || "902750162";
const SHEET_GID_HANDICAPS = process.env.SHEET_GID_HANDICAPS || "0";
const SEASON_ID = process.env.SEASON_ID || "2025-26";
const SEASON_NAME = process.env.SEASON_NAME || `${SEASON_ID.replace("-", "/")} Season`;
function defaultDateBounds(seasonId) {
  const m = seasonId.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { startsOn: null, endsOn: null };
  const startYear = parseInt(m[1], 10);
  const endYear = startYear + 1;
  return { startsOn: `${startYear}-09-01`, endsOn: `${endYear}-05-31` };
}
const { startsOn: defaultStart, endsOn: defaultEnd } = defaultDateBounds(SEASON_ID);
const SEASON_STARTS_ON = process.env.SEASON_STARTS_ON || defaultStart;
const SEASON_ENDS_ON = process.env.SEASON_ENDS_ON || defaultEnd;
const KNOCKOUT_LABELS = new Set(["CS", "CF", "PQ", "PS", "PF"]);
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_DB_URL) {
  console.error("Missing required env: SUPABASE_DB_URL");
  process.exit(1);
}

const reportDir = path.resolve(process.cwd(), "scripts", "migration-reports");
await fs.mkdir(reportDir, { recursive: true });

function sheetUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/e/${SHEET_BASE_ID}/pub?gid=${gid}&single=true&output=csv`;
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

/** Minimal CSV parser handling double-quoted fields with embedded commas/quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "player";
}

function toInt(v, fallback = 0) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  // Use local components so a date like "26-Oct-2025" stays Oct 26, not
  // shifted by the local TZ when serialised through UTC.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseResult(raw) {
  const s = String(raw || "").trim();
  if (!s) return { scoreA: null, scoreB: null };
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return { scoreA: null, scoreB: null };
  return { scoreA: parseInt(m[1], 10), scoreB: parseInt(m[2], 10) };
}

const report = {
  dryRun: DRY_RUN,
  seasonId: SEASON_ID,
  startedAt: new Date().toISOString(),
  counts: {},
  warnings: [],
};

console.log(`Fetching CSVs (dryRun=${DRY_RUN}, season=${SEASON_ID})...`);

const [fixturesCsv, leaguesCsv, handicapsCsv] = await Promise.all([
  fetchCsv(sheetUrl(SHEET_GID_FIXTURES)),
  fetchCsv(sheetUrl(SHEET_GID_LEAGUES)),
  fetchCsv(sheetUrl(SHEET_GID_HANDICAPS)),
]);

const fixturesRows = rowsToObjects(parseCsv(fixturesCsv));
const leaguesRowsRaw = parseCsv(leaguesCsv);
const handicapsRows = rowsToObjects(parseCsv(handicapsCsv));

// ---- Build players + per-season league membership from leagues sheet ----
// Leagues sheet has 3 leading rows (blank/blank/header) then player data
// in two side-by-side blocks: cols 0-5 = League A, cols 7-12 = League B.

const playersByName = new Map();
const seasonMembership = []; // [{ league_id, player_id }]

function addPlayer(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const existing = playersByName.get(trimmed);
  if (existing) return existing;
  const player = { player_id: slugify(trimmed), player_name: trimmed };
  playersByName.set(trimmed, player);
  return player;
}

const leaguesDataRows = leaguesRowsRaw.slice(3);
for (const row of leaguesDataRows) {
  const aName = (row[0] || "").trim();
  if (aName) {
    const p = addPlayer(aName);
    seasonMembership.push({ league_id: "A", player_id: p.player_id });
  }
  const bName = (row[7] || "").trim();
  if (bName) {
    const p = addPlayer(bName);
    seasonMembership.push({ league_id: "B", player_id: p.player_id });
  }
}

// Also create player rows for fixture players and handicap players who
// might not appear in the leagues sheet (e.g. handicap-only or historical).
for (const f of fixturesRows) {
  const a = (f["Player A"] || "").trim();
  const b = (f["Player B"] || "").trim();
  if (a) addPlayer(a);
  if (b) addPlayer(b);
}
for (const h of handicapsRows) {
  const name = (h["Player Name"] || "").trim();
  if (name) addPlayer(name);
}

// Build a quick lookup of season memberships keyed by player_id so we can
// derive league_id for fixtures.
const memberLeagueByPlayer = new Map();
for (const m of seasonMembership) memberLeagueByPlayer.set(m.player_id, m.league_id);

const fixtureRows = [];
fixturesRows.forEach((f, idx) => {
  const a = (f["Player A"] || "").trim();
  const b = (f["Player B"] || "").trim();
  const round = (f["Game Week"] || "").trim();
  if (!a || !b || !round) return;
  const playerA = playersByName.get(a);
  const playerB = playersByName.get(b);
  if (!playerA || !playerB) {
    report.warnings.push(`Skipping fixture (missing player): "${a}" vs "${b}"`);
    return;
  }
  const stage = KNOCKOUT_LABELS.has(round) ? "knockout" : "league";
  const derivedLeague = memberLeagueByPlayer.get(playerA.player_id)
    || memberLeagueByPlayer.get(playerB.player_id)
    || null;
  // Knockout fixtures may legitimately have no league.
  const leagueId = stage === "knockout" ? derivedLeague : derivedLeague;
  if (stage === "league" && !leagueId) {
    report.warnings.push(`League fixture has no derivable league: "${a}" vs "${b}" round ${round}`);
  }
  const { scoreA, scoreB } = parseResult(f["Result"]);
  fixtureRows.push({
    season_id: SEASON_ID,
    league_id: leagueId,
    stage,
    round_label: round,
    player_a_id: playerA.player_id,
    player_b_id: playerB.player_id,
    match_date: normDate(f["Match Date"]),
    score_a: scoreA,
    score_b: scoreB,
    sort_order: idx,
  });
});

const handicapInputs = [];
for (const h of handicapsRows) {
  const name = (h["Player Name"] || "").trim();
  if (!name) continue;
  const player = playersByName.get(name);
  if (!player) continue;
  const date = normDate(h["Handicap Date"]);
  const handicap = h["Handicap"];
  if (!date || handicap === "" || handicap == null) {
    report.warnings.push(`Skipping handicap row (bad date or value): ${JSON.stringify(h)}`);
    continue;
  }
  handicapInputs.push({
    player_id: player.player_id,
    handicap: toInt(handicap, 0),
    effective_date: date,
  });
}

// Deduplicate handicaps by (player_id, effective_date) -- last write wins.
const handicapMap = new Map();
for (const row of handicapInputs) {
  handicapMap.set(`${row.player_id}|${row.effective_date}`, row);
}
const handicapRows = Array.from(handicapMap.values());

// Deduplicate season membership too -- last write wins.
const memberMap = new Map();
for (const m of seasonMembership) memberMap.set(m.player_id, m);
const memberRows = Array.from(memberMap.values());

const playerRows = Array.from(playersByName.values());

console.log(`Players: ${playerRows.length}`);
console.log(`Season members: ${memberRows.length}`);
console.log(`Fixtures: ${fixtureRows.length}`);
console.log(`Handicaps: ${handicapRows.length}`);
if (report.warnings.length) console.warn(`Warnings: ${report.warnings.length}`);

if (!DRY_RUN) {
  const client = new pg.Client({ connectionString: SUPABASE_DB_URL });
  await client.connect();
  try {
    await client.query("begin");

    // Make sure the season exists. Leagues are seeded by the schema
    // migration -- we don't touch them here.
    await client.query(
      `insert into ierne_snooker.seasons
         (season_id, name, starts_on, ends_on, is_current)
       values ($1, $2, $3, $4, true)
       on conflict (season_id) do update
         set name = excluded.name,
             starts_on = excluded.starts_on,
             ends_on = excluded.ends_on,
             updated_at = now()`,
      [SEASON_ID, SEASON_NAME, SEASON_STARTS_ON, SEASON_ENDS_ON],
    );

    for (const p of playerRows) {
      await client.query(
        `insert into ierne_snooker.players (player_id, player_name)
         values ($1, $2)
         on conflict (player_id) do update
           set player_name = excluded.player_name,
               updated_at = now()`,
        [p.player_id, p.player_name],
      );
    }

    for (const m of memberRows) {
      await client.query(
        `insert into ierne_snooker.season_players
           (season_id, league_id, player_id)
         values ($1, $2, $3)
         on conflict (season_id, player_id) do update
           set league_id = excluded.league_id,
               updated_at = now()`,
        [SEASON_ID, m.league_id, m.player_id],
      );
    }

    for (const f of fixtureRows) {
      await client.query(
        `insert into ierne_snooker.fixtures
           (season_id, league_id, stage, round_label,
            player_a_id, player_b_id, match_date,
            score_a, score_b, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (season_id, stage, round_label, player_a_id, player_b_id) do update
           set league_id = excluded.league_id,
               match_date = excluded.match_date,
               score_a = excluded.score_a,
               score_b = excluded.score_b,
               sort_order = excluded.sort_order,
               updated_at = now()`,
        [f.season_id, f.league_id, f.stage, f.round_label,
         f.player_a_id, f.player_b_id, f.match_date,
         f.score_a, f.score_b, f.sort_order],
      );
    }

    for (const h of handicapRows) {
      await client.query(
        `insert into ierne_snooker.handicaps (player_id, handicap, effective_date)
         values ($1,$2,$3)
         on conflict (player_id, effective_date) do update
           set handicap = excluded.handicap,
               updated_at = now()`,
        [h.player_id, h.handicap, h.effective_date],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

report.counts = {
  players: playerRows.length,
  members: memberRows.length,
  fixtures: fixtureRows.length,
  handicaps: handicapRows.length,
};
report.completedAt = new Date().toISOString();

const reportFile = path.join(reportDir, `migration-report-${Date.now()}.json`);
await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
console.log(`Migration ${DRY_RUN ? "dry-run " : ""}complete. Report: ${reportFile}`);
