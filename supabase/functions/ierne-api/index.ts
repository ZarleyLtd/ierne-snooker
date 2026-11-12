// Ierne Snooker League API
// Single Edge Function exposing JSON read endpoints backed by the
// `ierne_snooker` schema, plus authenticated POST writes.
//
// We connect directly to Postgres (not PostgREST / supabase-js .schema)
// because the `ierne_snooker` schema is not on the project's Exposed Schemas
// list, so it stays private to this app.
//
// Read actions (GET):
//   ?action=getCompetitions
//   ?action=getCompetitionGroups  &compId=<id>
//   ?action=getFixtures           [&comp=<id>] [&competitionType=<type>]
//   ?action=getStandings          [&comp=<id>] [&competitionType=<type>]
//   ?action=getHandicaps
//   ?action=getPlayers            [&comp=<id>] [&group=<id>]
//   ?action=getPlayerComps        &playerId=<id>
//   ?action=getTopBreaks          [&comp=<id>] [&group=<id>] [&limit=<n>]
//   ?action=getBreaksForFixture   &fixtureId=<uuid>
//
// Default competition: the row in `competitions` with `is_current = true` for
// the requested or default `competitionType` (default: league).
//
// Authenticated POST (Content-Type: application/x-www-form-urlencoded,
// body field `data` JSON):
//   { "action": "...", "data": { ... }, "adminToken": "<HMAC token>" }
// Env IERNE_ADMIN_SECRET required for admin. Actions:
//   adminLogin, upsertCompetition, deleteCompetition,
//   upsertCompetitionGroup, deleteCompetitionGroup,
//   upsertCompetitionPlayer, upsertPlayer, upsertHandicap,
//   upsertFixture, generateFixtures, updateFixtureResult, upsertBreak, deleteBreak,
//   deleteFixture, deleteHandicap, deletePlayer,
//   getResultSlip, uploadResultSlip, commitResultSlip,
//   discardResultSlipSession, removeResultSlip, approveFixtureResult,
//   issueInvite, listInvites, revokeInvite, listAccounts, disableAccount,
//   setAccountAdmin, setAccountApprover
// An approver account may enter or edit any match score, and may approve one.
// Those saves are approved immediately, as are scores entered or edited by an
// admin. Other admin actions stay admin-only.
// Player session (no admin PIN): register, connect, resetPassword, signOut, whoAmI.
// updateFixtureResult, breaks, and result-slip actions also accept a player session
// for that player's own match, until 24 hours after the result is first posted.
// result_entered_by is "Admin" or the player's name.
// result_approved is true for admin- and approver-entered scores, and false until
// an admin or approver approves a player-entered score. Unapproved scores still
// count in standings.
// result_approved_by / result_approved_at record that later approval.
//
// Standings ordering (Ierne tiebreak chain):
//   1. points desc
//   2. frame_diff desc
//   3. head-to-head among tied players (h2h_points, then h2h_frame_diff)
//   4. alphabetical (stable)

import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  ApiError,
  connectAccount,
  disableAccount,
  issueInvite,
  listAccounts,
  listInvites,
  setAccountAdmin,
  setAccountApprover,
  readPlayerSession,
  registerAccount,
  resetAccountPassword,
  revokeInvite,
  signOutAccount,
  whoAmIAccount,
  withinResultWindow,
} from "./accounts.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

function unauthorizedResponse(message = "Unauthorized"): Response {
  return jsonResponse({ success: false, error: message }, 401);
}

let _sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (_sql) return _sql;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")
    || Deno.env.get("DB_URL")
    || Deno.env.get("POSTGRES_URL");
  if (!dbUrl) throw new Error("Missing required env: SUPABASE_DB_URL");
  _sql = postgres(dbUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return _sql;
}

/** Private Storage bucket for result-slip photos (signed URLs only). */
const RESULT_SLIP_BUCKET = "ierne-result-slips";
/** Seconds a signed slip URL stays valid (1 hour). */
const RESULT_SLIP_SIGNED_URL_TTL = 3600;
const RESULT_SLIP_MAX_BYTES = 1_500_000;

let _sb: ReturnType<typeof createClient> | null = null;
function storageClient() {
  if (_sb) return _sb;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  _sb = createClient(supabaseUrl, serviceRoleKey);
  return _sb;
}

function resultSlipPendingPath(fixtureId: string): string {
  return `fixtures/${fixtureId}/pending.jpg`;
}

function resultSlipCommittedPath(fixtureId: string): string {
  return `fixtures/${fixtureId}/slip.jpg`;
}

function decodeImagePayload(
  base64: unknown,
  mimeType: unknown,
): { bytes: Uint8Array; mime: string } | null {
  const raw = String(base64 || "").replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  if (!raw) return null;
  const mime = String(mimeType || "image/jpeg");
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") return null;
  let bin: string;
  try {
    bin = atob(raw);
  } catch {
    return null;
  }
  if (bin.length > RESULT_SLIP_MAX_BYTES) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function getSignedSlipUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const sb = storageClient();
  const { data, error } = await sb.storage
    .from(RESULT_SLIP_BUCKET)
    .createSignedUrl(path, RESULT_SLIP_SIGNED_URL_TTL);
  if (error) {
    console.warn("Failed to sign result-slip URL:", error.message);
    return null;
  }
  return data?.signedUrl || null;
}

async function uploadSlipBytes(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  const sb = storageClient();
  const { error } = await sb.storage.from(RESULT_SLIP_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

async function deleteSlipPaths(paths: string[]): Promise<void> {
  const clean = paths.map((p) => String(p || "").trim()).filter(Boolean);
  if (!clean.length) return;
  const sb = storageClient();
  const { error } = await sb.storage.from(RESULT_SLIP_BUCKET).remove(clean);
  if (error) console.warn("Failed to delete result-slip object(s):", error.message);
}

async function clearFixtureResultSlip(fixtureId: string): Promise<void> {
  const pending = resultSlipPendingPath(fixtureId);
  const committed = resultSlipCommittedPath(fixtureId);
  const sql = db();
  const rows = await sql<{ result_slip_path: string | null }[]>`
    select result_slip_path
      from ierne_snooker.fixtures
     where fixture_id = ${fixtureId}::uuid
  `;
  const dbPath = rows[0]?.result_slip_path || null;
  const toRemove = [pending, committed];
  if (dbPath && dbPath !== pending && dbPath !== committed) toRemove.push(dbPath);
  await deleteSlipPaths(toRemove);
  await sql`
    update ierne_snooker.fixtures
       set result_slip_path = null,
           result_slip_mime = null,
           updated_at = now()
     where fixture_id = ${fixtureId}::uuid
  `;
}

// ---------- Types -----------------------------------------------------------

type PlayerRow = { player_id: string; player_name: string; active: boolean };

type CompetitionRow = {
  competition_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
  competition_type: "league" | "knockout" | "double-eliminator";
  parent_competition_id: string | null;
};

type GroupRow = {
  competition_id: string;
  group_id: string;
  name: string;
  display_order: number;
};

type CompetitionPlayerRow = {
  competition_id: string;
  group_id: string;
  player_id: string;
};

type FixtureRow = {
  fixture_id: string;
  competition_id: string;
  group_id: string | null;
  stage: "group" | "knockout";
  round_label: string;
  round_name: string | null;
  player_a_id: string;
  player_b_id: string;
  match_date: string | null;
  score_a: number | null;
  score_b: number | null;
  sort_order: number;
  best_of: number;
  result_entered_by: string | null;
  result_approved: boolean;
  result_approved_by?: string | null;
  result_approved_at?: string | Date | null;
  result_posted_at?: string | Date | null;
};

type CompetitionType = "league" | "knockout" | "double-eliminator";

type StandingRow = {
  competition_id: string;
  group_id: string;
  player_id: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  frame_diff: number;
  points: number;
};

type HeadToHeadRow = {
  competition_id: string;
  group_id: string;
  player_id: string;
  opponent_id: string;
  played: number;
  h2h_wins: number;
  h2h_losses: number;
  h2h_frame_diff: number;
  h2h_points: number;
};

type HandicapRow = {
  handicap_id: string;
  player_id: string;
  handicap: number;
  effective_date: string;
};

type BreakLeaderRow = {
  break_id: string;
  fixture_id: string;
  value: number;
  player_id: string;
  player_name: string;
  group_id: string | null;
  round_label: string;
  stage: string;
  match_date: string | null;
  player_a_id: string;
  player_b_id: string;
  player_a_name: string;
  player_b_name: string;
};

// ---------- Helpers ---------------------------------------------------------

function buildPlayerMap(players: PlayerRow[]): Map<string, PlayerRow> {
  const map = new Map<string, PlayerRow>();
  for (const p of players) map.set(p.player_id, p);
  return map;
}

function normalizeCompetitionType(raw: string | null): CompetitionType {
  const t = String(raw ?? "league").trim().toLowerCase();
  if (t === "knockout") return "knockout";
  if (t === "double-eliminator" || t === "double_eliminator" || t === "doubleelim") {
    return "double-eliminator";
  }
  return "league";
}

function isBracketCompetitionType(t: CompetitionType | string | null | undefined): boolean {
  const n = normalizeCompetitionType(t == null ? null : String(t));
  return n === "knockout" || n === "double-eliminator";
}

async function loadAllPlayers(): Promise<PlayerRow[]> {
  const sql = db();
  const rows = await sql<PlayerRow[]>`
    select player_id, player_name, active
    from ierne_snooker.players
    order by player_name asc
  `;
  return rows as unknown as PlayerRow[];
}

async function resolveCompId(
  requested: string | null,
  competitionTypeParam: string | null,
): Promise<string> {
  const sql = db();
  const competitionType = normalizeCompetitionType(competitionTypeParam);

  if (requested) {
    const found = await sql<CompetitionRow[]>`
      select competition_id, name, starts_on, ends_on, is_current,
             competition_type, parent_competition_id
      from ierne_snooker.competitions
      where competition_id = ${requested}
    `;
    if (!found.length) throw new Error(`Unknown competition: ${requested}`);
    return (found[0] as unknown as CompetitionRow).competition_id;
  }

  const current = await sql<CompetitionRow[]>`
    select competition_id, name, starts_on, ends_on, is_current,
           competition_type, parent_competition_id
    from ierne_snooker.competitions
    where is_current = true
      and competition_type = ${competitionType}
    order by starts_on desc nulls last, competition_id asc
    limit 1
  `;
  if (!current.length) {
    throw new Error(`No current ${competitionType} competition is set`);
  }
  return (current[0] as unknown as CompetitionRow).competition_id;
}

async function loadCompetitionGroups(compId: string): Promise<GroupRow[]> {
  const sql = db();
  const rows = await sql<GroupRow[]>`
    select competition_id, group_id, name, display_order
    from ierne_snooker.competition_groups
    where competition_id = ${compId}
    order by display_order asc, group_id asc
  `;
  return rows as unknown as GroupRow[];
}

const KNOCKOUT_GROUP_ID = "ko";
const WINNER_OF_PREFIX = "wo:";
const LOSER_OF_PREFIX = "lo:";
const BYE_PLAYER_ID = "bye";
const BYE_PLAYER_NAME = "Bye";

const KNOCKOUT_ROUND_LABELS: Record<string, string> = {
  QF1: "Quarter-final 1",
  QF2: "Quarter-final 2",
  QF3: "Quarter-final 3",
  QF4: "Quarter-final 4",
  SF1: "Semi-final 1",
  SF2: "Semi-final 2",
  F: "Final",
  "F-P": "Plate Final",
  "F-C": "Championship Final",
  WF: "Winners Final",
  LF: "Losers Final",
  GF: "Grand Final",
  "GF-R": "Grand Final Reset",
};

function knockoutRoundLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  if (KNOCKOUT_ROUND_LABELS[c]) return KNOCKOUT_ROUND_LABELS[c];

  const l32 = c.match(/^L32-(\d+)$/i);
  if (l32) return `Round 1 — match ${l32[1]}`;

  const l16 = c.match(/^L16-(\d+)$/i);
  if (l16) return `Round 2 — match ${l16[1]}`;

  const cp = c.match(/^CP-(\d+)$/i);
  if (cp) return `Custom Playoff — match ${cp[1]}`;

  const wr = c.match(/^W(\d+)-(\d+)$/i);
  if (wr) return `Round ${wr[1]} — match ${wr[2]}`;

  const lr = c.match(/^L(\d+)-(\d+)$/i);
  if (lr) return `Losers Round ${lr[1]} — match ${lr[2]}`;

  const qf = c.match(/^QF(\d+)$/i);
  if (qf) return `Quarter-final ${qf[1]}`;

  const sf = c.match(/^SF(\d+)$/i);
  if (sf) return `Semi-final ${sf[1]}`;

  const koLast = c.match(/^KO Last (\d+)$/i);
  if (koLast) {
    const n = parseInt(koLast[1], 10);
    if (n === 2) return "Final";
    if (n === 4) return "Semi-finals";
    if (n === 8) return "Quarter-finals";
    if (n === 16 || n === 32) return "Round 1";
    return `Round`;
  }
  if (/^KO Pre-/i.test(c)) return "Preliminary";
  return c;
}

/**
 * DB display name for wo:/lo: placeholder players.
 * Must be unique per round code — friendly labels like "Round 1 — match 1"
 * collide across KO (L32-1) and DE (W1-1) under players_player_name_key.
 * UI resolves wo:/lo: via KnockoutRounds; these names are fallbacks only.
 */
function winnerOfPlayerName(roundCode: string): string {
  const code = roundCode.trim();
  return code ? `Winner of ${code}` : "Winner";
}

function loserOfPlayerName(roundCode: string): string {
  const code = roundCode.trim();
  return code ? `Loser of ${code}` : "Loser";
}

function isWinnerOfPlayerId(playerId: string): boolean {
  return playerId.startsWith(WINNER_OF_PREFIX);
}

function isLoserOfPlayerId(playerId: string): boolean {
  return playerId.startsWith(LOSER_OF_PREFIX);
}

function isBracketPlaceholderPlayerId(playerId: string): boolean {
  return isWinnerOfPlayerId(playerId) || isLoserOfPlayerId(playerId);
}

function placeholderPlayerName(playerId: string): string {
  if (isWinnerOfPlayerId(playerId)) {
    return winnerOfPlayerName(playerId.slice(WINNER_OF_PREFIX.length));
  }
  if (isLoserOfPlayerId(playerId)) {
    return loserOfPlayerName(playerId.slice(LOSER_OF_PREFIX.length));
  }
  return "";
}

async function ensureBracketPlaceholderPlayers(
  sql: ReturnType<typeof postgres>,
  ...playerIds: string[]
): Promise<void> {
  const seen = new Set<string>();
  for (const playerId of playerIds) {
    if (!isBracketPlaceholderPlayerId(playerId)) continue;
    if (seen.has(playerId)) continue;
    seen.add(playerId);
    const playerName = placeholderPlayerName(playerId);
    if (!playerName) continue;
    await sql`
      insert into ierne_snooker.players (player_id, player_name, active, updated_at)
      values (${playerId}, ${playerName}, false, now())
      on conflict (player_id) do update set
        player_name = excluded.player_name,
        updated_at = now()
    `;
  }
}

/** @deprecated use ensureBracketPlaceholderPlayers */
async function ensureWinnerOfPlayers(
  sql: ReturnType<typeof postgres>,
  ...playerIds: string[]
): Promise<void> {
  await ensureBracketPlaceholderPlayers(sql, ...playerIds);
}

function isInternalPlayerId(playerId: string | null | undefined): boolean {
  const id = String(playerId || "").trim();
  return isBracketPlaceholderPlayerId(id) || isByePlayerId(id);
}

/** Delete wo:/lo:/bye player rows that nothing references anymore. */
async function pruneUnusedInternalPlayers(
  sql: ReturnType<typeof postgres>,
  candidateIds?: string[],
): Promise<number> {
  const candidates = (candidateIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => isInternalPlayerId(id));
  const rows = candidates.length
    ? await sql<{ player_id: string }[]>`
        delete from ierne_snooker.players p
         where p.player_id = any(${candidates}::text[])
           and not exists (
             select 1 from ierne_snooker.fixtures f
              where f.player_a_id = p.player_id or f.player_b_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.competition_players cp
              where cp.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.handicaps h
              where h.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.breaks b
              where b.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.accounts a
              where a.player_id = p.player_id
           )
        returning p.player_id
      `
    : await sql<{ player_id: string }[]>`
        delete from ierne_snooker.players p
         where (
              p.player_id like ${WINNER_OF_PREFIX + "%"}
           or p.player_id like ${LOSER_OF_PREFIX + "%"}
           or p.player_id = ${BYE_PLAYER_ID}
         )
           and not exists (
             select 1 from ierne_snooker.fixtures f
              where f.player_a_id = p.player_id or f.player_b_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.competition_players cp
              where cp.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.handicaps h
              where h.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.breaks b
              where b.player_id = p.player_id
           )
           and not exists (
             select 1 from ierne_snooker.accounts a
              where a.player_id = p.player_id
           )
        returning p.player_id
      `;
  return rows.length;
}

function matchWinnerLoser(
  playerAId: string,
  playerBId: string,
  scoreA: number,
  scoreB: number,
): { winnerId: string; loserId: string } | null {
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA === scoreB) {
    return null;
  }
  if (isInternalPlayerId(playerAId) || isInternalPlayerId(playerBId)) {
    return null;
  }
  if (scoreA > scoreB) return { winnerId: playerAId, loserId: playerBId };
  return { winnerId: playerBId, loserId: playerAId };
}

/**
 * After a knockout/DE result is set, replace wo:/lo: slots in later fixtures
 * with the real winner/loser, then drop unused placeholder player rows.
 */
async function materializeBracketOutcome(
  sql: ReturnType<typeof postgres>,
  opts: {
    competitionId: string;
    sourceFixtureId: string;
    roundLabel: string;
    winnerId: string;
    loserId: string;
  },
): Promise<void> {
  const code = String(opts.roundLabel || "").trim();
  if (!code || !opts.competitionId || !opts.sourceFixtureId) return;
  if (isInternalPlayerId(opts.winnerId) || isInternalPlayerId(opts.loserId)) return;

  const wo = winnerOfId(code);
  const lo = loserOfId(code);

  await sql`
    update ierne_snooker.fixtures
       set player_a_id = ${opts.winnerId}, updated_at = now()
     where competition_id = ${opts.competitionId}
       and fixture_id <> ${opts.sourceFixtureId}::uuid
       and player_a_id = ${wo}
  `;
  await sql`
    update ierne_snooker.fixtures
       set player_b_id = ${opts.winnerId}, updated_at = now()
     where competition_id = ${opts.competitionId}
       and fixture_id <> ${opts.sourceFixtureId}::uuid
       and player_b_id = ${wo}
  `;
  await sql`
    update ierne_snooker.fixtures
       set player_a_id = ${opts.loserId}, updated_at = now()
     where competition_id = ${opts.competitionId}
       and fixture_id <> ${opts.sourceFixtureId}::uuid
       and player_a_id = ${lo}
  `;
  await sql`
    update ierne_snooker.fixtures
       set player_b_id = ${opts.loserId}, updated_at = now()
     where competition_id = ${opts.competitionId}
       and fixture_id <> ${opts.sourceFixtureId}::uuid
       and player_b_id = ${lo}
  `;

  await pruneUnusedInternalPlayers(sql, [wo, lo]);
}

/**
 * When a result is cleared, put wo:/lo: back into unplayed later fixtures that
 * still hold the materialized winner/loser (skip if that player has already
 * advanced into a scored later match).
 */
async function restoreBracketPlaceholders(
  sql: ReturnType<typeof postgres>,
  opts: {
    competitionId: string;
    sourceFixtureId: string;
    roundLabel: string;
    winnerId: string;
    loserId: string;
  },
): Promise<void> {
  const code = String(opts.roundLabel || "").trim();
  if (!code || !opts.competitionId || !opts.sourceFixtureId) return;
  if (isInternalPlayerId(opts.winnerId) || isInternalPlayerId(opts.loserId)) return;

  const wo = winnerOfId(code);
  const lo = loserOfId(code);
  await ensureBracketPlaceholderPlayers(sql, wo, lo);

  const winnerAdvanced = await sql<{ ok: boolean }[]>`
    select exists(
      select 1 from ierne_snooker.fixtures f
       where f.competition_id = ${opts.competitionId}
         and f.fixture_id <> ${opts.sourceFixtureId}::uuid
         and (f.player_a_id = ${opts.winnerId} or f.player_b_id = ${opts.winnerId})
         and f.score_a is not null
         and f.score_b is not null
    ) as ok
  `;
  const loserAdvanced = await sql<{ ok: boolean }[]>`
    select exists(
      select 1 from ierne_snooker.fixtures f
       where f.competition_id = ${opts.competitionId}
         and f.fixture_id <> ${opts.sourceFixtureId}::uuid
         and (f.player_a_id = ${opts.loserId} or f.player_b_id = ${opts.loserId})
         and f.score_a is not null
         and f.score_b is not null
    ) as ok
  `;

  if (!Boolean(winnerAdvanced[0]?.ok)) {
    await sql`
      update ierne_snooker.fixtures
         set player_a_id = ${wo}, updated_at = now()
       where competition_id = ${opts.competitionId}
         and fixture_id <> ${opts.sourceFixtureId}::uuid
         and player_a_id = ${opts.winnerId}
         and score_a is null
         and score_b is null
    `;
    await sql`
      update ierne_snooker.fixtures
         set player_b_id = ${wo}, updated_at = now()
       where competition_id = ${opts.competitionId}
         and fixture_id <> ${opts.sourceFixtureId}::uuid
         and player_b_id = ${opts.winnerId}
         and score_a is null
         and score_b is null
    `;
  }

  if (!Boolean(loserAdvanced[0]?.ok)) {
    await sql`
      update ierne_snooker.fixtures
         set player_a_id = ${lo}, updated_at = now()
       where competition_id = ${opts.competitionId}
         and fixture_id <> ${opts.sourceFixtureId}::uuid
         and player_a_id = ${opts.loserId}
         and score_a is null
         and score_b is null
    `;
    await sql`
      update ierne_snooker.fixtures
         set player_b_id = ${lo}, updated_at = now()
       where competition_id = ${opts.competitionId}
         and fixture_id <> ${opts.sourceFixtureId}::uuid
         and player_b_id = ${opts.loserId}
         and score_a is null
         and score_b is null
    `;
  }
}

async function syncBracketPlaceholdersForResult(
  sql: ReturnType<typeof postgres>,
  fixture: {
    fixture_id: string;
    competition_id: string;
    stage: string;
    round_label: string;
    player_a_id: string;
    player_b_id: string;
    score_a: number | null;
    score_b: number | null;
  },
  nextScoreA: number | null,
  nextScoreB: number | null,
): Promise<void> {
  if (fixture.stage !== "knockout") return;
  const code = String(fixture.round_label || "").trim();
  if (!code) return;

  const prev = fixture.score_a != null && fixture.score_b != null
    ? matchWinnerLoser(
      fixture.player_a_id,
      fixture.player_b_id,
      Number(fixture.score_a),
      Number(fixture.score_b),
    )
    : null;
  const next = nextScoreA != null && nextScoreB != null
    ? matchWinnerLoser(
      fixture.player_a_id,
      fixture.player_b_id,
      nextScoreA,
      nextScoreB,
    )
    : null;

  if (prev && (!next || prev.winnerId !== next.winnerId || prev.loserId !== next.loserId)) {
    await restoreBracketPlaceholders(sql, {
      competitionId: fixture.competition_id,
      sourceFixtureId: fixture.fixture_id,
      roundLabel: code,
      winnerId: prev.winnerId,
      loserId: prev.loserId,
    });
  }
  if (next) {
    await materializeBracketOutcome(sql, {
      competitionId: fixture.competition_id,
      sourceFixtureId: fixture.fixture_id,
      roundLabel: code,
      winnerId: next.winnerId,
      loserId: next.loserId,
    });
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Standard single-elim seed order for a power-of-2 bracket (slot → seed number).
 * e.g. 8 → [1,8,4,5,2,7,3,6]. Byes occupy seeds N+1..n so they never cluster
 * on one side (avoids a player receiving byes in consecutive rounds).
 */
function bracketSeedOrder(n: number): number[] {
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error("bracketSeedOrder requires a power of 2");
  }
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

/** Shuffle players, pad to next power of 2, place byes on high seed slots. */
function placePlayersWithBalancedByes(playerIds: string[]): (string | null)[] {
  const real = playerIds.filter(Boolean);
  const n = nextPow2(Math.max(2, real.length));
  const shuffled = shuffleInPlace(real.slice());
  const order = bracketSeedOrder(n);
  return order.map((seed) => (seed <= shuffled.length ? shuffled[seed - 1]! : null));
}

function winnerOfId(roundCode: string): string {
  return WINNER_OF_PREFIX + roundCode;
}

function loserOfId(roundCode: string): string {
  return LOSER_OF_PREFIX + roundCode;
}

type GeneratedFixture = {
  groupId: string | null;
  stage: "group" | "knockout";
  roundLabel: string;
  roundName: string | null;
  playerAId: string;
  playerBId: string;
  sortOrder: number;
  scoreA?: number | null;
  scoreB?: number | null;
};

function isByePlayerId(playerId: string | null | undefined): boolean {
  return String(playerId || "").trim().toLowerCase() === BYE_PLAYER_ID;
}

async function ensureByePlayer(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`
    insert into ierne_snooker.players (player_id, player_name, active, updated_at)
    values (${BYE_PLAYER_ID}, ${BYE_PLAYER_NAME}, false, now())
    on conflict (player_id) do update set
      player_name = excluded.player_name,
      updated_at = now()
  `;
}

/**
 * Real player vs Bye indicator fixture (bracket padding).
 * Left unscored so it does not appear in Results or contribute to frame/W–L stats;
 * generate already advances the real player into the next round.
 */
function byeFixture(
  base: Omit<GeneratedFixture, "playerAId" | "playerBId" | "scoreA" | "scoreB">,
  realPlayerId: string,
): GeneratedFixture {
  return {
    ...base,
    playerAId: realPlayerId,
    playerBId: BYE_PLAYER_ID,
    scoreA: null,
    scoreB: null,
  };
}

function koStagePlanForSize(n: number): { id: string; matchCount: number; codes: (m: number) => string }[] {
  // n is power of 2 >= 2
  const plan: { id: string; matchCount: number; codes: (m: number) => string }[] = [];
  if (n >= 32) {
    plan.push({ id: "L32", matchCount: 16, codes: (m) => `L32-${m}` });
  }
  if (n >= 16) {
    plan.push({ id: "L16", matchCount: 8, codes: (m) => `L16-${m}` });
  }
  if (n >= 8) {
    plan.push({ id: "QF", matchCount: 4, codes: (m) => `QF${m}` });
  }
  if (n >= 4) {
    plan.push({ id: "SF", matchCount: 2, codes: (m) => `SF${m}` });
  }
  plan.push({ id: "F", matchCount: 1, codes: () => "F" });
  // Trim leading rounds until first round matchCount == n/2
  const firstMatches = n / 2;
  while (plan.length > 1 && plan[0]!.matchCount > firstMatches) {
    plan.shift();
  }
  return plan;
}

function generateKnockoutFixtures(playerIds: string[]): GeneratedFixture[] {
  const real = playerIds.filter(Boolean);
  if (real.length < 2) throw new Error("Need at least 2 players to generate knockout fixtures");
  const slots = placePlayersWithBalancedByes(real);
  const n = slots.length;
  const plan = koStagePlanForSize(n);
  const out: GeneratedFixture[] = [];
  let sortOrder = 1;
  let current: (string | null)[] = slots;

  for (let r = 0; r < plan.length; r++) {
    const stage = plan[r]!;
    const next: (string | null)[] = [];
    for (let m = 0; m < stage.matchCount; m++) {
      const a = current[m * 2] ?? null;
      const b = current[m * 2 + 1] ?? null;
      const code = stage.codes(m + 1);
      if (a && b) {
        out.push({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          playerAId: a,
          playerBId: b,
          sortOrder: sortOrder++,
        });
        next.push(winnerOfId(code));
      } else if (a || b) {
        const real = (a || b)!;
        out.push(byeFixture({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          sortOrder: sortOrder++,
        }, real));
        next.push(real);
      } else {
        next.push(null);
      }
    }
    current = next;
  }
  return out;
}

function generateDoubleElimFixtures(playerIds: string[]): GeneratedFixture[] {
  const real = playerIds.filter(Boolean);
  if (real.length < 2) {
    throw new Error("Need at least 2 players to generate double-eliminator fixtures");
  }
  const slots = placePlayersWithBalancedByes(real);
  const n = slots.length;
  const roundsWb = Math.log2(n); // e.g. 8 → 3
  const out: GeneratedFixture[] = [];
  let sortOrder = 1;

  // Winners bracket: W1-*, W2-*, ... WF
  type WbMatch = { code: string; played: boolean };
  const wbByRound: WbMatch[][] = [];
  let current: (string | null)[] = slots;

  for (let r = 1; r <= roundsWb; r++) {
    const matchCount = current.length / 2;
    const isFinal = r === roundsWb;
    const roundMatches: WbMatch[] = [];
    const next: (string | null)[] = [];
    for (let m = 0; m < matchCount; m++) {
      const a = current[m * 2] ?? null;
      const b = current[m * 2 + 1] ?? null;
      const code = isFinal ? "WF" : `W${r}-${m + 1}`;
      if (a && b) {
        out.push({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          playerAId: a,
          playerBId: b,
          sortOrder: sortOrder++,
        });
        roundMatches.push({ code, played: true });
        next.push(winnerOfId(code));
      } else if (a || b) {
        const real = (a || b)!;
        out.push(byeFixture({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          sortOrder: sortOrder++,
        }, real));
        // Bye match is an indicator only; no loser drops to the losers bracket.
        roundMatches.push({ code, played: false });
        next.push(real);
      } else {
        roundMatches.push({ code, played: false });
        next.push(null);
      }
    }
    wbByRound.push(roundMatches);
    current = next;
  }

  // Losers bracket. For 2 players there is only WF — grand final is winner vs loser of WF.
  if (roundsWb === 1) {
    out.push({
      groupId: KNOCKOUT_GROUP_ID,
      stage: "knockout",
      roundLabel: "GF",
      roundName: null,
      playerAId: winnerOfId("WF"),
      playerBId: loserOfId("WF"),
      sortOrder: sortOrder++,
    });
    out.push({
      groupId: KNOCKOUT_GROUP_ID,
      stage: "knockout",
      roundLabel: "GF-R",
      roundName: null,
      playerAId: winnerOfId("GF"),
      playerBId: loserOfId("GF"),
      sortOrder: sortOrder++,
    });
    return out;
  }

  // L1: pair actual WB round-1 losers only (W1 byes do not drop anyone).
  // Later absorb rounds use full-slot DE shape: one LB match per WB dropper,
  // with LB survivors filling early slots and remaining droppers getting byes
  // (e.g. 18 players → L1×1, then L2×8 with 7 byes, then L3×4, …).
  let lbEntrants: (string | null)[] = [];
  const wbR1 = wbByRound[0] || [];
  for (const m of wbR1) {
    if (m.played) lbEntrants.push(loserOfId(m.code));
  }
  let lbRoundNum = 1;
  let lbCurrent: (string | null)[] = lbEntrants;

  function pairRound(
    entrants: (string | null)[],
    codeFor: (m: number) => string,
  ): { fixtures: GeneratedFixture[]; winners: (string | null)[] } {
    const fixtures: GeneratedFixture[] = [];
    const winners: (string | null)[] = [];
    // Ensure even length
    const list = entrants.slice();
    if (list.length % 2 === 1) list.push(null);
    for (let m = 0; m < list.length / 2; m++) {
      const a = list[m * 2] ?? null;
      const b = list[m * 2 + 1] ?? null;
      const code = codeFor(m + 1);
      if (a && b) {
        fixtures.push({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          playerAId: a,
          playerBId: b,
          sortOrder: 0, // filled below
        });
        winners.push(winnerOfId(code));
      } else if (a || b) {
        const real = (a || b)!;
        fixtures.push(byeFixture({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          sortOrder: 0,
        }, real));
        winners.push(real);
      } else {
        winners.push(null);
      }
    }
    return { fixtures, winners };
  }

  /** Full-slot absorb: one match per WB dropper; spare droppers get byes. */
  function absorbRound(
    lbWinners: (string | null)[],
    droppers: (string | null)[],
    codeFor: (m: number) => string,
  ): { fixtures: GeneratedFixture[]; winners: (string | null)[] } {
    const lbs = lbWinners.filter(Boolean) as string[];
    const drops = droppers.filter(Boolean) as string[];
    if (drops.length === 0) {
      return { fixtures: [], winners: lbs.slice() };
    }
    // Nobody waiting in LB yet — pair the droppers among themselves.
    if (lbs.length === 0) {
      return pairRound(drops, codeFor);
    }

    const fixtures: GeneratedFixture[] = [];
    const winners: (string | null)[] = [];
    for (let i = 0; i < drops.length; i++) {
      const dropper = drops[i]!;
      const lb = i < lbs.length ? lbs[i]! : null;
      const code = codeFor(i + 1);
      if (lb) {
        fixtures.push({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          playerAId: lb,
          playerBId: dropper,
          sortOrder: 0,
        });
        winners.push(winnerOfId(code));
      } else {
        fixtures.push(byeFixture({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: code,
          roundName: null,
          sortOrder: 0,
        }, dropper));
        winners.push(dropper);
      }
    }

    // Excess LB survivors (should be rare after consolidation) keep playing.
    if (lbs.length > drops.length) {
      const excess = lbs.slice(drops.length);
      if (excess.length === 1) {
        winners.push(excess[0]!);
      } else if (excess.length > 1) {
        const extra = pairRound(excess, (m) => codeFor(drops.length + m));
        for (const f of extra.fixtures) fixtures.push(f);
        for (const w of extra.winners) winners.push(w);
      }
    }
    return { fixtures, winners };
  }

  if (lbCurrent.length >= 2) {
    const { fixtures, winners } = pairRound(lbCurrent, (m) => `L${lbRoundNum}-${m}`);
    for (const f of fixtures) {
      f.sortOrder = sortOrder++;
      out.push(f);
    }
    lbCurrent = winners;
    lbRoundNum++;
  }

  for (let wr = 1; wr < roundsWb; wr++) {
    const droppers: (string | null)[] = [];
    for (const m of wbByRound[wr] || []) {
      if (m.played) droppers.push(loserOfId(m.code));
    }
    const isLastWb = wr === roundsWb - 1;

    // Special-case losers final: when absorbing WF loser into last LB winner
    if (isLastWb) {
      const lbWinner = lbCurrent.find(Boolean) || null;
      const wfLoser = droppers.find(Boolean) || null;
      if (lbWinner && wfLoser) {
        out.push({
          groupId: KNOCKOUT_GROUP_ID,
          stage: "knockout",
          roundLabel: "LF",
          roundName: null,
          playerAId: lbWinner,
          playerBId: wfLoser,
          sortOrder: sortOrder++,
        });
        lbCurrent = [winnerOfId("LF")];
      } else if (lbWinner || wfLoser) {
        lbCurrent = [lbWinner || wfLoser];
      }
      break;
    }

    const { fixtures, winners } = absorbRound(lbCurrent, droppers, (m) => `L${lbRoundNum}-${m}`);
    for (const f of fixtures) {
      f.sortOrder = sortOrder++;
      out.push(f);
    }
    lbCurrent = winners;
    lbRoundNum++;

    // Consolidation when LB still has more survivors than the next WB drop.
    if (lbCurrent.filter(Boolean).length > 1 && wr < roundsWb - 1) {
      const nextDropCount = (wbByRound[wr + 1] || []).filter((m) => m.played).length;
      if (lbCurrent.filter(Boolean).length > nextDropCount) {
        const cons = pairRound(lbCurrent, (m) => `L${lbRoundNum}-${m}`);
        for (const f of cons.fixtures) {
          f.sortOrder = sortOrder++;
          out.push(f);
        }
        lbCurrent = cons.winners;
        lbRoundNum++;
      }
    }
  }

  // Grand final + reset
  out.push({
    groupId: KNOCKOUT_GROUP_ID,
    stage: "knockout",
    roundLabel: "GF",
    roundName: null,
    playerAId: winnerOfId("WF"),
    playerBId: winnerOfId("LF"),
    sortOrder: sortOrder++,
  });
  out.push({
    groupId: KNOCKOUT_GROUP_ID,
    stage: "knockout",
    roundLabel: "GF-R",
    roundName: null,
    playerAId: winnerOfId("GF"),
    playerBId: loserOfId("GF"),
    sortOrder: sortOrder++,
  });

  return out;
}

/** Circle method single round-robin. Returns fixtures with week numbers as roundLabel. */
function generateLeagueRoundRobin(
  groupId: string,
  playerIds: string[],
  sortOrderStart: number,
): GeneratedFixture[] {
  const players = playerIds.filter(Boolean).slice();
  if (players.length < 2) return [];
  const bye = "__BYE__";
  if (players.length % 2 === 1) players.push(bye);
  const n = players.length;
  const rounds = n - 1;
  const half = n / 2;
  const out: GeneratedFixture[] = [];
  let sortOrder = sortOrderStart;
  // Copy rotating list (fix player 0)
  const arr = players.slice();
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === bye || b === bye) {
        const real = a === bye ? b : a;
        if (real === bye) continue;
        out.push(byeFixture({
          groupId,
          stage: "group",
          roundLabel: String(round + 1),
          roundName: null,
          sortOrder: sortOrder++,
        }, real));
        continue;
      }
      out.push({
        groupId,
        stage: "group",
        roundLabel: String(round + 1),
        roundName: null,
        playerAId: a,
        playerBId: b,
        sortOrder: sortOrder++,
      });
    }
    // Rotate all but first
    const fixed = arr[0]!;
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return out;
}

async function ensureKnockoutCompGroup(compId: string): Promise<void> {
  const sql = db();
  await sql`
    insert into ierne_snooker.competition_groups (
      competition_id, group_id, name, display_order
    ) values (${compId}, ${KNOCKOUT_GROUP_ID}, 'Knockout pool', 0)
    on conflict (competition_id, group_id) do nothing
  `;
}

async function removeKnockoutCompGroupIfSafe(compId: string): Promise<void> {
  const sql = db();
  const [fx, cp] = await Promise.all([
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.fixtures
         where competition_id = ${compId} and group_id = ${KNOCKOUT_GROUP_ID}
      ) as ok
    `,
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.competition_players
         where competition_id = ${compId} and group_id = ${KNOCKOUT_GROUP_ID}
      ) as ok
    `,
  ]);
  if (Boolean((fx[0] as { ok: boolean }).ok) || Boolean((cp[0] as { ok: boolean }).ok)) {
    return;
  }
  await sql`
    delete from ierne_snooker.competition_groups
     where competition_id = ${compId} and group_id = ${KNOCKOUT_GROUP_ID}
  `;
}

// ---------- Ierne tiebreaker ------------------------------------------------

type ShapedRow = {
  playerId: string;
  playerName: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  frameDiff: number;
  points: number;
};

function applyHeadToHead(
  rows: ShapedRow[],
  h2h: HeadToHeadRow[],
): ShapedRow[] {
  if (rows.length < 2) return rows;

  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.frameDiff !== a.frameDiff) return b.frameDiff - a.frameDiff;
    return a.playerName.localeCompare(b.playerName);
  });

  const h2hKey = (a: string, b: string) => `${a}|${b}`;
  const h2hMap = new Map<string, HeadToHeadRow>();
  for (const r of h2h) h2hMap.set(h2hKey(r.player_id, r.opponent_id), r);

  const result: ShapedRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length
      && sorted[j].points === sorted[i].points
      && sorted[j].frameDiff === sorted[i].frameDiff
    ) {
      j++;
    }
    const group = sorted.slice(i, j);
    if (group.length === 1) {
      result.push(group[0]);
      i = j;
      continue;
    }

    const tiedIds = group.map((g) => g.playerId);
    const tiedSet = new Set(tiedIds);
    const miniStats = new Map<string, { miniPoints: number; miniFrameDiff: number }>();
    for (const id of tiedIds) miniStats.set(id, { miniPoints: 0, miniFrameDiff: 0 });
    for (const a of tiedIds) {
      for (const b of tiedIds) {
        if (a === b) continue;
        if (!tiedSet.has(b)) continue;
        const row = h2hMap.get(h2hKey(a, b));
        if (!row) continue;
        const stats = miniStats.get(a)!;
        stats.miniPoints += Number(row.h2h_points) || 0;
        stats.miniFrameDiff += Number(row.h2h_frame_diff) || 0;
      }
    }

    group.sort((a, b) => {
      const sa = miniStats.get(a.playerId)!;
      const sb = miniStats.get(b.playerId)!;
      if (sb.miniPoints !== sa.miniPoints) return sb.miniPoints - sa.miniPoints;
      if (sb.miniFrameDiff !== sa.miniFrameDiff) return sb.miniFrameDiff - sa.miniFrameDiff;
      return a.playerName.localeCompare(b.playerName);
    });
    result.push(...group);
    i = j;
  }
  return result;
}

// ---------- GET handlers ----------------------------------------------------

async function handleGetCompetitions(): Promise<Response> {
  const sql = db();
  const rows = await sql<CompetitionRow[]>`
    select competition_id, name,
           to_char(starts_on, 'YYYY-MM-DD') as starts_on,
           to_char(ends_on, 'YYYY-MM-DD') as ends_on,
           is_current, competition_type, parent_competition_id
      from ierne_snooker.competitions
      order by starts_on desc nulls last, competition_id desc
  `;
  return jsonResponse({
    success: true,
    competitions: (rows as unknown as CompetitionRow[]).map((r) => ({
      compId: r.competition_id,
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      isCurrent: r.is_current,
      competitionType: r.competition_type,
      parentCompId: r.parent_competition_id,
    })),
  });
}

async function handleGetCompetitionGroups(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const compId = String(url.searchParams.get("compId") ?? "").trim();
  if (!compId) return errorResponse("compId required");

  const sql = db();
  const compRows = await sql<CompetitionRow[]>`
    select competition_id, name, competition_type, is_current, parent_competition_id
      from ierne_snooker.competitions
     where competition_id = ${compId}
  `;
  if (!compRows.length) return errorResponse("Competition not found", 404);
  const comp = compRows[0] as unknown as CompetitionRow;

  if (isBracketCompetitionType(comp.competition_type)) {
    await ensureKnockoutCompGroup(compId);
  }

  const rows = await sql<{
    group_id: string;
    name: string;
    display_order: number;
    player_count: number;
  }[]>`
    select cg.group_id,
           cg.name,
           cg.display_order,
           coalesce(pc.cnt, 0)::int as player_count
      from ierne_snooker.competition_groups cg
      left join lateral (
        select count(*)::int as cnt
          from ierne_snooker.competition_players cp
         where cp.competition_id = cg.competition_id
           and cp.group_id = cg.group_id
      ) pc on true
     where cg.competition_id = ${compId}
       and (
         ${comp.competition_type} in ('knockout', 'double-eliminator')
         or cg.group_id <> ${KNOCKOUT_GROUP_ID}
       )
     order by cg.display_order asc, cg.group_id asc
  `;

  return jsonResponse({
    success: true,
    competition: {
      compId: comp.competition_id,
      name: comp.name,
      competitionType: comp.competition_type,
      isCurrent: comp.is_current,
      parentCompId: comp.parent_competition_id,
    },
    groups: rows.map((r) => ({
      groupId: r.group_id,
      name: r.name,
      displayOrder: r.display_order,
      playerCount: r.player_count,
    })),
  });
}

async function handleGetPlayers(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const compParam = url.searchParams.get("comp");
  const groupParam = url.searchParams.get("group");

  if (!compParam && !groupParam) {
    const sql = db();
    const rows = await sql<{
      player_id: string;
      player_name: string;
      active: boolean;
      comp_count: number;
      match_count: number;
      claimed: boolean;
    }[]>`
      select p.player_id,
             p.player_name,
             p.active,
             coalesce(cc.comp_count, 0)::int as comp_count,
             coalesce(mc.match_count, 0)::int as match_count,
             exists(
               select 1 from ierne_snooker.accounts a where a.player_id = p.player_id
             ) as claimed
        from ierne_snooker.players p
        left join lateral (
          select count(*)::int as comp_count
            from (
              select cp.competition_id
                from ierne_snooker.competition_players cp
               where cp.player_id = p.player_id
              union
              select f.competition_id
                from ierne_snooker.fixtures f
               where f.player_a_id = p.player_id or f.player_b_id = p.player_id
            ) combined
        ) cc on true
        left join lateral (
          select count(*)::int as match_count
            from ierne_snooker.fixtures f
           where (f.player_a_id = p.player_id or f.player_b_id = p.player_id)
             and f.score_a is not null
             and f.score_b is not null
        ) mc on true
       where p.player_id not like ${WINNER_OF_PREFIX + "%"}
         and p.player_id not like ${LOSER_OF_PREFIX + "%"}
         and p.player_id <> ${BYE_PLAYER_ID}
       order by p.player_name asc
    `;
    return jsonResponse({
      success: true,
      players: rows.map((p) => ({
        playerId: p.player_id,
        playerName: p.player_name,
        active: p.active,
        compCount: p.comp_count,
        matchCount: p.match_count,
        claimed: Boolean(p.claimed),
      })),
    });
  }

  const compId = await resolveCompId(compParam, url.searchParams.get("competitionType"));
  const sql = db();
  const rows = await sql<(CompetitionPlayerRow & { player_name: string; active: boolean; claimed: boolean })[]>`
    select cp.competition_id, cp.group_id, cp.player_id, p.player_name, p.active,
           exists(
             select 1 from ierne_snooker.accounts a where a.player_id = p.player_id
           ) as claimed
    from ierne_snooker.competition_players cp
    join ierne_snooker.players p on p.player_id = cp.player_id
    where cp.competition_id = ${compId}
      and (${groupParam}::text is null or cp.group_id = ${groupParam})
      and p.player_id not like ${WINNER_OF_PREFIX + "%"}
      and p.player_id not like ${LOSER_OF_PREFIX + "%"}
      and p.player_id <> ${BYE_PLAYER_ID}
    order by p.player_name asc
  `;
  return jsonResponse({
    success: true,
    compId,
    players: (rows as unknown as Array<CompetitionPlayerRow & { player_name: string; active: boolean; claimed: boolean }>).map((r) => ({
      playerId: r.player_id,
      playerName: r.player_name,
      groupId: r.group_id,
      active: r.active,
      claimed: Boolean(r.claimed),
    })),
  });
}

async function handleGetPlayerComps(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const playerId = String(url.searchParams.get("playerId") ?? "").trim();
  if (!playerId) return errorResponse("playerId required");

  const sql = db();
  const rows = await sql<{
    competition_id: string;
    name: string;
    is_current: boolean;
    competition_type: string;
    parent_competition_id: string | null;
  }[]>`
    select competition_id, name, is_current, competition_type, parent_competition_id
    from (
      select c.competition_id, c.name, c.is_current, c.competition_type,
             c.parent_competition_id, c.starts_on
        from ierne_snooker.competition_players cp
        join ierne_snooker.competitions c on c.competition_id = cp.competition_id
       where cp.player_id = ${playerId}
      union
      select c.competition_id, c.name, c.is_current, c.competition_type,
             c.parent_competition_id, c.starts_on
        from ierne_snooker.fixtures f
        join ierne_snooker.competitions c on c.competition_id = f.competition_id
       where f.player_a_id = ${playerId} or f.player_b_id = ${playerId}
    ) combined
    order by starts_on desc nulls last, competition_id desc
  `;
  return jsonResponse({
    success: true,
    playerId,
    competitions: rows.map((r) => ({
      compId: r.competition_id,
      name: r.name,
      isCurrent: r.is_current,
      competitionType: r.competition_type,
      parentCompId: r.parent_competition_id,
    })),
  });
}

async function handleGetFixtures(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const compId = await resolveCompId(
    url.searchParams.get("comp"),
    url.searchParams.get("competitionType"),
  );

  const sql = db();
  const [players, fixtureRows] = await Promise.all([
    loadAllPlayers(),
    sql<FixtureRow[]>`
      select fixture_id, competition_id, group_id, stage, round_label, round_name,
             player_a_id, player_b_id,
             to_char(match_date, 'YYYY-MM-DD') as match_date,
             score_a, score_b, sort_order, best_of, result_entered_by,
             result_approved, result_approved_by, result_approved_at, result_posted_at
      from ierne_snooker.fixtures
      where competition_id = ${compId}
      order by sort_order asc, round_label asc
    `,
  ]);
  const playerMap = buildPlayerMap(players);

  const fixtures = (fixtureRows as unknown as FixtureRow[]).map((r) => {
    const a = playerMap.get(r.player_a_id);
    const b = playerMap.get(r.player_b_id);
    const nameA = isBracketPlaceholderPlayerId(r.player_a_id)
      ? placeholderPlayerName(r.player_a_id)
      : (a?.player_name ?? "");
    const nameB = isBracketPlaceholderPlayerId(r.player_b_id)
      ? placeholderPlayerName(r.player_b_id)
      : (b?.player_name ?? "");
    const result = r.score_a != null && r.score_b != null
      ? `${r.score_a}-${r.score_b}`
      : "";
    return {
      fixtureId: r.fixture_id,
      "Game Week": r.round_label,
      "Group": r.group_id,
      "Stage": r.stage,
      "Player A": nameA,
      "Player B": nameB,
      "Match Date": r.match_date ?? "",
      "Result": result,
      scoreA: r.score_a,
      scoreB: r.score_b,
      sortOrder: r.sort_order,
      bestOf: r.best_of ?? 3,
      roundName: r.round_name ?? "",
      resultEnteredBy: r.result_entered_by ?? "",
      resultApproved: r.score_a == null || r.score_b == null ? true : r.result_approved !== false,
      resultApprovedBy: r.result_approved && r.result_approved_by ? r.result_approved_by : "",
      resultApprovedAt: r.result_approved && r.result_approved_at
        ? (() => {
          const approvedAt = new Date(r.result_approved_at as string | Date);
          return Number.isFinite(approvedAt.getTime()) ? approvedAt.toISOString() : null;
        })()
        : null,
      playerAId: r.player_a_id,
      playerBId: r.player_b_id,
      resultPostedAt: r.result_posted_at
        ? (() => {
          const posted = new Date(r.result_posted_at as string | Date);
          return Number.isFinite(posted.getTime()) ? posted.toISOString() : null;
        })()
        : null,
    };
  });

  return jsonResponse({ success: true, compId, fixtures });
}

async function handleGetStandings(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const compId = await resolveCompId(
    url.searchParams.get("comp"),
    url.searchParams.get("competitionType"),
  );

  const sql = db();
  const [players, groups, members, standings, h2h, unapproved] = await Promise.all([
    loadAllPlayers(),
    loadCompetitionGroups(compId),
    sql<CompetitionPlayerRow[]>`
      select competition_id, group_id, player_id
      from ierne_snooker.competition_players
      where competition_id = ${compId}
    `,
    sql<StandingRow[]>`
      select competition_id, group_id, player_id, played, won, lost, drawn,
             frame_diff, points
      from ierne_snooker.league_standings_v
      where competition_id = ${compId}
    `,
    sql<HeadToHeadRow[]>`
      select competition_id, group_id, player_id, opponent_id,
             played, h2h_wins, h2h_losses, h2h_frame_diff, h2h_points
      from ierne_snooker.head_to_head_v
      where competition_id = ${compId}
    `,
    sql<{ group_id: string; player_a_id: string; player_b_id: string }[]>`
      select group_id, player_a_id, player_b_id
      from ierne_snooker.fixtures
      where competition_id = ${compId}
        and stage = 'group'
        and result_approved = false
        and score_a is not null
        and score_b is not null
    `,
  ]);

  const playerMap = buildPlayerMap(players);
  const standingsMap = new Map<string, StandingRow>();
  for (const s of (standings as unknown as StandingRow[])) {
    standingsMap.set(`${s.group_id}|${s.player_id}`, s);
  }

  const membersByGroup = new Map<string, CompetitionPlayerRow[]>();
  for (const m of (members as unknown as CompetitionPlayerRow[])) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m);
    membersByGroup.set(m.group_id, list);
  }

  const h2hAll = h2h as unknown as HeadToHeadRow[];
  const unapprovedPlayers = new Set<string>();
  for (const fx of unapproved as unknown as { group_id: string; player_a_id: string; player_b_id: string }[]) {
    const gid = fx.group_id ?? "";
    if (fx.player_a_id) unapprovedPlayers.add(`${gid}|${fx.player_a_id}`);
    if (fx.player_b_id) unapprovedPlayers.add(`${gid}|${fx.player_b_id}`);
  }

  const groupsOut = (groups as GroupRow[])
    .filter((g) => g.group_id !== KNOCKOUT_GROUP_ID)
    .map((grp) => {
      const memberRows = membersByGroup.get(grp.group_id) ?? [];
      const shaped: ShapedRow[] = memberRows.map((m) => {
        const s = standingsMap.get(`${grp.group_id}|${m.player_id}`);
        const player = playerMap.get(m.player_id);
        return {
          playerId: m.player_id,
          playerName: player?.player_name ?? m.player_id,
          played: Number(s?.played ?? 0),
          won: Number(s?.won ?? 0),
          lost: Number(s?.lost ?? 0),
          drawn: Number(s?.drawn ?? 0),
          frameDiff: Number(s?.frame_diff ?? 0),
          points: Number(s?.points ?? 0),
        };
      });
      const groupH2h = h2hAll.filter((r) => r.group_id === grp.group_id);
      const ordered = applyHeadToHead(shaped, groupH2h);
      const rows = ordered.map((r) => ({
        "Player Name": r.playerName,
        P: r.played,
        W: r.won,
        L: r.lost,
        D: r.drawn,
        "+/-": r.frameDiff,
        Pts: r.points,
        unapproved: unapprovedPlayers.has(`${grp.group_id}|${r.playerId}`),
      }));
      return { groupId: grp.group_id, name: grp.name, rows };
    });

  return jsonResponse({
    success: true,
    compId,
    groups: groupsOut,
  });
}

async function handleGetHandicaps(): Promise<Response> {
  const sql = db();
  const [players, handicapRows] = await Promise.all([
    loadAllPlayers(),
    sql<HandicapRow[]>`
      select handicap_id, player_id, handicap,
             to_char(effective_date, 'YYYY-MM-DD') as effective_date
      from ierne_snooker.handicaps
      order by effective_date desc
    `,
  ]);
  const playerMap = buildPlayerMap(players);
  const rows = handicapRows as unknown as HandicapRow[];

  const all = rows.map((r) => ({
    handicapId: r.handicap_id,
    playerId: r.player_id,
    "Player Name": playerMap.get(r.player_id)?.player_name ?? "",
    "Handicap": r.handicap,
    "Handicap Date": r.effective_date,
  }));

  const seen = new Set<string>();
  const latest: typeof all = [];
  for (const r of rows) {
    if (seen.has(r.player_id)) continue;
    seen.add(r.player_id);
    latest.push({
      handicapId: r.handicap_id,
      playerId: r.player_id,
      "Player Name": playerMap.get(r.player_id)?.player_name ?? "",
      "Handicap": r.handicap,
      "Handicap Date": r.effective_date,
    });
  }
  latest.sort((a, b) => String(a["Player Name"]).localeCompare(String(b["Player Name"])));

  return jsonResponse({ success: true, handicaps: all, latest });
}

async function handleGetTopBreaks(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const groupParam = url.searchParams.get("group");
  const limitParam = url.searchParams.get("limit");

  const limitRaw = limitParam ? parseInt(limitParam, 10) : 20;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200
    ? limitRaw
    : 20;
  const compId = await resolveCompId(
    url.searchParams.get("comp"),
    url.searchParams.get("competitionType"),
  );

  const sql = db();
  const rows = await sql<BreakLeaderRow[]>`
    select b.break_id,
           b.fixture_id,
           b.value,
           b.player_id,
           p.player_name,
           f.group_id,
           f.round_label,
           f.stage,
           to_char(f.match_date, 'YYYY-MM-DD') as match_date,
           f.player_a_id,
           f.player_b_id,
           pa.player_name as player_a_name,
           pb.player_name as player_b_name
      from ierne_snooker.breaks b
      join ierne_snooker.fixtures f on f.fixture_id = b.fixture_id
      join ierne_snooker.players  p on p.player_id  = b.player_id
      join ierne_snooker.players  pa on pa.player_id = f.player_a_id
      join ierne_snooker.players  pb on pb.player_id = f.player_b_id
     where f.competition_id = ${compId}
       and (${groupParam}::text is null or f.group_id = ${groupParam})
     order by b.value desc, f.match_date asc nulls last, p.player_name asc
     limit ${limit}
  `;

  const breaks = (rows as unknown as BreakLeaderRow[]).map((r) => {
    const opponentName = r.player_id === r.player_a_id
      ? r.player_b_name
      : r.player_a_name;
    return {
      breakId: r.break_id,
      playerId: r.player_id,
      fixtureId: r.fixture_id,
      "Player Name": r.player_name,
      "Break": r.value,
      "Group": r.group_id,
      "Stage": r.stage,
      "Round": r.round_label,
      "Match Date": r.match_date ?? "",
      "Opponent": opponentName,
    };
  });

  return jsonResponse({ success: true, compId, breaks });
}

async function handleGetBreaksForFixture(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fixtureId = url.searchParams.get("fixtureId")?.trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const sql = db();
  const rows = await sql<{ break_id: string; player_id: string; value: number }[]>`
    select break_id, player_id, value
      from ierne_snooker.breaks
     where fixture_id = ${fixtureId}::uuid
     order by value desc, break_id asc
  `;
  return jsonResponse({
    success: true,
    fixtureId,
    breaks: rows.map((r) => ({
      breakId: r.break_id,
      playerId: r.player_id,
      value: Number(r.value),
    })),
  });
}

// ---------- Admin auth & POST payloads ------------------------------------

type PostEnvelope = {
  action: string;
  data: Record<string, unknown>;
  adminToken?: string;
  sessionToken?: string;
};

const ADMIN_TOKEN_TTL_SEC = 24 * 60 * 60;

const ADMIN_POST_ACTIONS = new Set([
  "adminLogin",
  "upsertCompetition",
  "deleteCompetition",
  "upsertCompetitionGroup",
  "deleteCompetitionGroup",
  "upsertCompetitionPlayer",
  "upsertPlayer",
  "upsertHandicap",
  "upsertFixture",
  "generateFixtures",
  "updateFixtureResult",
  "upsertBreak",
  "deleteBreak",
  "deleteFixture",
  "deleteHandicap",
  "deletePlayer",
  "approveFixtureResult",
  "issueInvite",
  "listInvites",
  "revokeInvite",
  "listAccounts",
  "disableAccount",
  "setAccountAdmin",
  "setAccountApprover",
]);

const PUBLIC_POST_ACTIONS = new Set([
  "register",
  "connect",
  "resetPassword",
  "signOut",
  "whoAmI",
]);

const PLAYER_RESULT_ACTIONS = new Set([
  "updateFixtureResult",
  "upsertBreak",
  "deleteBreak",
  "getResultSlip",
  "uploadResultSlip",
  "commitResultSlip",
  "discardResultSlipSession",
  "removeResultSlip",
]);

function getAdminSecret(): string {
  return (Deno.env.get("IERNE_ADMIN_SECRET") ?? "").trim();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return timingSafeEqualBytes(ea, eb);
}

async function signAdminPayload(secret: string, payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return base64UrlEncode(new Uint8Array(sig));
}

async function mintAdminToken(): Promise<{ token: string; expiresAt: string }> {
  const secret = getAdminSecret();
  if (!secret) throw new Error("Admin login unavailable");
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SEC;
  const payload = JSON.stringify({ exp });
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload));
  const sig = await signAdminPayload(secret, payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  const secret = getAdminSecret();
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const payloadB64 = parts[0]!;
  const sigB64 = parts[1]!;
  try {
    const expectedSigB64 = await signAdminPayload(secret, payloadB64);
    const expectedBytes = base64UrlDecode(expectedSigB64);
    const actualBytes = base64UrlDecode(sigB64);
    if (!timingSafeEqualBytes(expectedBytes, actualBytes)) return false;
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) return false;
    return exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function parsePostEnvelope(req: Request): Promise<PostEnvelope | null> {
  if (req.method !== "POST") return null;
  const form = await req.formData().catch(() => null);
  const dataStr = form?.get("data");
  if (typeof dataStr !== "string") return null;
  try {
    const parsed = JSON.parse(dataStr) as Record<string, unknown>;
    const action = String(parsed.action ?? "");
    const rawData = parsed.data;
    const data = typeof rawData === "object" && rawData !== null && !Array.isArray(rawData)
      ? rawData as Record<string, unknown>
      : {};
    const adminToken = typeof parsed.adminToken === "string" ? parsed.adminToken : undefined;
    const sessionToken = typeof parsed.sessionToken === "string" ? parsed.sessionToken : undefined;
    return { action, data, adminToken, sessionToken };
  } catch {
    return null;
  }
}

async function requireAdmin(envelope: PostEnvelope): Promise<Response | null> {
  const raw = envelope.adminToken;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (token && (await verifyAdminToken(token))) return null;
  const session = typeof envelope.sessionToken === "string" ? envelope.sessionToken.trim() : "";
  if (session) {
    const actor = await readPlayerSession(db(), session);
    if (actor?.isAdmin) return null;
  }
  if (!token && !session) {
    return unauthorizedResponse(
      "Missing admin token. Unlock Admin Mode from the site menu, then try again.",
    );
  }
  return unauthorizedResponse(
    "Invalid or expired admin session. Unlock Admin Mode again from the menu.",
  );
}

/** Admin PIN, an admin account, or an approver account. */
async function requireScoreApprover(envelope: PostEnvelope): Promise<Response | null> {
  const raw = envelope.adminToken;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (token && (await verifyAdminToken(token))) return null;
  const session = typeof envelope.sessionToken === "string" ? envelope.sessionToken.trim() : "";
  if (session) {
    const actor = await readPlayerSession(db(), session);
    if (actor?.isAdmin || actor?.isApprover) return null;
  }
  if (!token && !session) {
    return unauthorizedResponse("Sign in as an approver, or unlock Admin Mode.");
  }
  return unauthorizedResponse("This score can only be approved by an approver or an admin.");
}

async function handleAdminLogin(data: Record<string, unknown>): Promise<Response> {
  const secret = getAdminSecret();
  if (!secret) return errorResponse("Admin login not configured", 503);
  const pin = String(data.pin ?? data.secret ?? "");
  if (!timingSafeEqualStr(pin, secret)) return unauthorizedResponse("Invalid PIN");
  const { token, expiresAt } = await mintAdminToken();
  return jsonResponse({ success: true, token, expiresAt });
}

async function handleUpsertPlayer(data: Record<string, unknown>): Promise<Response> {
  const playerId = String(data.playerId ?? "").trim();
  const playerName = String(data.playerName ?? "").trim();
  if (!playerId || !playerName) return errorResponse("playerId and playerName required");
  if (isInternalPlayerId(playerId)) {
    return errorResponse("Internal bracket placeholders cannot be managed as players");
  }
  const active = data.active === undefined ? true : Boolean(data.active);
  const sql = db();
  await sql`
    insert into ierne_snooker.players (player_id, player_name, active, updated_at)
    values (${playerId}, ${playerName}, ${active}, now())
    on conflict (player_id) do update set
      player_name = excluded.player_name,
      active = excluded.active,
      updated_at = now()
  `;
  return jsonResponse({ success: true });
}

async function handleUpsertCompetitionPlayer(data: Record<string, unknown>): Promise<Response> {
  const remove = Boolean(data.remove);
  const compId = String(data.compId ?? "").trim();
  const playerId = String(data.playerId ?? "").trim();
  if (!compId || !playerId) return errorResponse("compId and playerId required");
  const sql = db();
  if (remove) {
    await sql`
      delete from ierne_snooker.competition_players
      where competition_id = ${compId} and player_id = ${playerId}
    `;
    return jsonResponse({ success: true });
  }
  const groupId = String(data.groupId ?? "").trim();
  if (!groupId) return errorResponse("groupId required when not removing");
  const [grp] = await sql<{ ok: boolean }[]>`
    select exists(
      select 1 from ierne_snooker.competition_groups
       where competition_id = ${compId} and group_id = ${groupId}
    ) as ok
  `;
  if (!Boolean((grp as { ok: boolean }).ok)) {
    return errorResponse("That group is not part of this competition. Add the group first.");
  }
  await sql`
    insert into ierne_snooker.competition_players (competition_id, group_id, player_id, updated_at)
    values (${compId}, ${groupId}, ${playerId}, now())
    on conflict (competition_id, player_id) do update set
      group_id = excluded.group_id,
      updated_at = now()
  `;
  return jsonResponse({ success: true });
}

async function handleUpsertHandicap(data: Record<string, unknown>): Promise<Response> {
  const handicapId = data.handicapId ? String(data.handicapId).trim() : "";
  const playerId = String(data.playerId ?? "").trim();
  const handicapVal = Number(data.handicap);
  const effectiveDate = String(data.effectiveDate ?? "").trim();
  if (!effectiveDate) return errorResponse("effectiveDate required");
  if (!Number.isFinite(handicapVal)) return errorResponse("handicap must be a number");
  const hInt = Math.trunc(handicapVal);
  const sql = db();
  if (handicapId) {
    if (!playerId) return errorResponse("playerId required when updating handicap");
    await sql`
      update ierne_snooker.handicaps
      set player_id = ${playerId},
          handicap = ${hInt},
          effective_date = ${effectiveDate},
          updated_at = now()
      where handicap_id = ${handicapId}::uuid
    `;
    return jsonResponse({ success: true });
  }
  if (!playerId) return errorResponse("playerId required");
  await sql`
    insert into ierne_snooker.handicaps (player_id, handicap, effective_date)
    values (${playerId}, ${hInt}, ${effectiveDate})
    on conflict (player_id, effective_date) do update set
      handicap = excluded.handicap,
      updated_at = now()
  `;
  return jsonResponse({ success: true });
}

async function handleUpsertCompetition(data: Record<string, unknown>): Promise<Response> {
  const compId = String(data.compId ?? "").trim();
  const name = String(data.name ?? "").trim();
  if (!compId || !name) return errorResponse("compId and name required");
  const startsOn = data.startsOn ? String(data.startsOn) : null;
  const endsOn = data.endsOn ? String(data.endsOn) : null;
  const isCurrent = Boolean(data.isCurrent);
  const competitionType = normalizeCompetitionType(
    String(data.competitionType ?? data.competition_type ?? "league"),
  );
  const parentCompId = data.parentCompId != null && data.parentCompId !== ""
    ? String(data.parentCompId).trim()
    : null;

  const sql = db();
  await sql.begin(async (tx) => {
    await tx`
      insert into ierne_snooker.competitions (
        competition_id, name, starts_on, ends_on, is_current,
        competition_type, parent_competition_id
      ) values (
        ${compId}, ${name}, ${startsOn}, ${endsOn}, ${isCurrent},
        ${competitionType}, ${parentCompId}
      )
      on conflict (competition_id) do update set
        name = excluded.name,
        starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        is_current = excluded.is_current,
        competition_type = excluded.competition_type,
        parent_competition_id = excluded.parent_competition_id,
        updated_at = now()
    `;
  });

  if (isBracketCompetitionType(competitionType)) {
    await ensureKnockoutCompGroup(compId);
  } else {
    await removeKnockoutCompGroupIfSafe(compId);
  }
  return jsonResponse({ success: true });
}

async function handleDeleteCompetition(data: Record<string, unknown>): Promise<Response> {
  const compId = String(data.compId ?? "").trim();
  if (!compId) return errorResponse("compId required");
  const sql = db();

  const compRows = await sql<{ competition_id: string }[]>`
    select competition_id from ierne_snooker.competitions where competition_id = ${compId}
  `;
  if (!compRows.length) return errorResponse("Competition not found", 404);

  const children = await sql<{ ok: boolean }[]>`
    select exists(
      select 1 from ierne_snooker.competitions
       where parent_competition_id = ${compId}
    ) as ok
  `;
  if (Boolean((children[0] as { ok: boolean }).ok)) {
    return errorResponse(
      "Cannot delete competition: child competitions still reference it.",
      409,
    );
  }

  // Real results block delete; bye pads and unscored fixtures do not.
  const results = await sql<{ ok: boolean }[]>`
    select exists(
      select 1 from ierne_snooker.fixtures
       where competition_id = ${compId}
         and score_a is not null
         and score_b is not null
         and player_a_id <> ${BYE_PLAYER_ID}
         and player_b_id <> ${BYE_PLAYER_ID}
    ) as ok
  `;
  if (Boolean((results[0] as { ok: boolean }).ok)) {
    return errorResponse(
      "Cannot delete this competition while it still has results. Delete the results first, then try again.",
      409,
    );
  }

  const slipRows = await sql<{ fixture_id: string; result_slip_path: string | null }[]>`
    select fixture_id, result_slip_path
      from ierne_snooker.fixtures
     where competition_id = ${compId}
  `;

  await sql`delete from ierne_snooker.breaks
    where fixture_id in (
      select fixture_id from ierne_snooker.fixtures where competition_id = ${compId}
    )`;
  await sql`delete from ierne_snooker.fixtures where competition_id = ${compId}`;
  // competition_players / competition_groups cascade from competitions.
  await sql`delete from ierne_snooker.competitions where competition_id = ${compId}`;
  await pruneUnusedInternalPlayers(sql);

  for (const row of slipRows) {
    const paths = [
      resultSlipPendingPath(row.fixture_id),
      resultSlipCommittedPath(row.fixture_id),
    ];
    if (row.result_slip_path) paths.push(row.result_slip_path);
    await deleteSlipPaths(paths);
  }

  return jsonResponse({ success: true });
}

async function handleUpsertCompetitionGroup(data: Record<string, unknown>): Promise<Response> {
  const compId = String(data.compId ?? "").trim();
  const groupId = String(data.groupId ?? "").trim();
  const name = String(data.name ?? "").trim();
  const displayOrderRaw = data.displayOrder;
  const displayOrder = displayOrderRaw !== undefined && displayOrderRaw !== ""
    ? Number(displayOrderRaw)
    : 0;
  if (!compId || !groupId || !name) {
    return errorResponse("compId, groupId and name required");
  }
  if (!Number.isFinite(displayOrder)) return errorResponse("displayOrder must be a number");

  const sql = db();
  await sql`
    insert into ierne_snooker.competition_groups (
      competition_id, group_id, name, display_order
    ) values (${compId}, ${groupId}, ${name}, ${Math.trunc(displayOrder)})
    on conflict (competition_id, group_id) do update set
      name = excluded.name,
      display_order = excluded.display_order,
      updated_at = now()
  `;
  return jsonResponse({ success: true });
}

async function handleDeleteCompetitionGroup(data: Record<string, unknown>): Promise<Response> {
  const compId = String(data.compId ?? "").trim();
  const groupId = String(data.groupId ?? "").trim();
  if (!compId || !groupId) return errorResponse("compId and groupId required");
  const sql = db();
  const [fx, cp] = await Promise.all([
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.fixtures
         where competition_id = ${compId} and group_id = ${groupId}
      ) as ok
    `,
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.competition_players
         where competition_id = ${compId} and group_id = ${groupId}
      ) as ok
    `,
  ]);
  if (Boolean((fx[0] as { ok: boolean }).ok) || Boolean((cp[0] as { ok: boolean }).ok)) {
    return errorResponse(
      "Cannot delete group: players or fixtures still reference it for this competition.",
      409,
    );
  }
  await sql`
    delete from ierne_snooker.competition_groups
     where competition_id = ${compId} and group_id = ${groupId}
  `;
  return jsonResponse({ success: true });
}

function parseNullableScore(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Odd match length 1–9. Empty means the default of 3. Invalid returns null. */
function parseBestOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return 3;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 9 || Math.trunc(n) % 2 === 0) return null;
  return Math.trunc(n);
}

async function handleUpsertFixture(data: Record<string, unknown>): Promise<Response> {
  const fixtureId = data.fixtureId ? String(data.fixtureId).trim() : "";
  const compId = String(data.compId ?? "").trim();
  const stage = String(data.stage ?? "").trim();
  const roundLabel = String(data.roundLabel ?? "").trim();
  const roundNameRaw = data.roundName ?? data.round_name;
  const roundName = roundNameRaw === undefined || roundNameRaw === null || roundNameRaw === ""
    ? null
    : String(roundNameRaw).trim();
  const playerAId = String(data.playerAId ?? "").trim();
  const playerBId = String(data.playerBId ?? "").trim();
  const groupIdRaw = data.groupId;
  const groupId = groupIdRaw === undefined || groupIdRaw === null || groupIdRaw === ""
    ? null
    : String(groupIdRaw);
  const matchDate = data.matchDate ? String(data.matchDate) : null;
  const sortOrderRaw = data.sortOrder;
  const sortOrder = sortOrderRaw !== undefined && sortOrderRaw !== ""
    ? Number(sortOrderRaw)
    : 0;
  const bestOf = parseBestOf(data.bestOf);

  const scoreA = parseNullableScore(data.scoreA);
  const scoreB = parseNullableScore(data.scoreB);
  const rawScoreA = data.scoreA;
  const rawScoreB = data.scoreB;
  if (rawScoreA !== undefined && rawScoreA !== null && rawScoreA !== "" && scoreA === null) {
    return errorResponse("Invalid scoreA");
  }
  if (rawScoreB !== undefined && rawScoreB !== null && rawScoreB !== "" && scoreB === null) {
    return errorResponse("Invalid scoreB");
  }

  if (!compId || !roundLabel || !playerAId || !playerBId) {
    return errorResponse("compId, roundLabel, playerAId, playerBId required");
  }
  if (stage !== "group" && stage !== "knockout") {
    return errorResponse("stage must be group or knockout");
  }
  if (stage === "group" && !groupId) return errorResponse("groupId required for group stage");
  if (playerAId === playerBId) return errorResponse("Players must be different");
  if (!Number.isFinite(sortOrder)) return errorResponse("sortOrder must be a number");
  if (bestOf === null) return errorResponse("bestOf must be an odd number from 1 to 9");

  const sql = db();
  await ensureBracketPlaceholderPlayers(sql, playerAId, playerBId);
  if (isByePlayerId(playerAId) || isByePlayerId(playerBId)) await ensureByePlayer(sql);
  const sa = scoreA === null ? null : Math.trunc(scoreA);
  const sb = scoreB === null ? null : Math.trunc(scoreB);
  const so = Math.trunc(sortOrder);

  if (fixtureId) {
    const priorRows = await sql<{
      fixture_id: string;
      competition_id: string;
      stage: string;
      round_label: string;
      player_a_id: string;
      player_b_id: string;
      score_a: number | null;
      score_b: number | null;
    }[]>`
      select fixture_id, competition_id, stage, round_label,
             player_a_id, player_b_id, score_a, score_b
        from ierne_snooker.fixtures
       where fixture_id = ${fixtureId}::uuid
    `;
    const prior = priorRows[0];
    await sql`
      update ierne_snooker.fixtures set
        competition_id = ${compId},
        group_id = ${groupId},
        stage = ${stage},
        round_label = ${roundLabel},
        round_name = ${roundName},
        player_a_id = ${playerAId},
        player_b_id = ${playerBId},
        match_date = ${matchDate},
        score_a = ${sa},
        score_b = ${sb},
        sort_order = ${so},
        best_of = ${bestOf},
        result_posted_at = case
          when ${sa !== null && sb !== null} then coalesce(result_posted_at, now())
          when ${sa === null && sb === null} then null
          else result_posted_at
        end,
        updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
    if (prior) {
      // Restore against the prior pairing/scores, then materialize from the saved row.
      await syncBracketPlaceholdersForResult(sql, prior, null, null);
      await syncBracketPlaceholdersForResult(sql, {
        fixture_id: fixtureId,
        competition_id: compId,
        stage,
        round_label: roundLabel,
        player_a_id: playerAId,
        player_b_id: playerBId,
        score_a: null,
        score_b: null,
      }, sa, sb);
    }
    await pruneUnusedInternalPlayers(sql);
    return jsonResponse({ success: true });
  }

  const inserted = await sql<{ fixture_id: string }[]>`
    insert into ierne_snooker.fixtures (
      competition_id, group_id, stage, round_label, round_name,
      player_a_id, player_b_id, match_date, score_a, score_b, sort_order, best_of, result_posted_at
    ) values (
      ${compId}, ${groupId}, ${stage}, ${roundLabel}, ${roundName},
      ${playerAId}, ${playerBId}, ${matchDate}, ${sa}, ${sb}, ${so}, ${bestOf},
      case
        when ${sa !== null && sb !== null} then now()
        else null
      end
    )
    returning fixture_id
  `;
  const newId = inserted[0]?.fixture_id;
  if (newId && sa != null && sb != null) {
    await syncBracketPlaceholdersForResult(sql, {
      fixture_id: newId,
      competition_id: compId,
      stage,
      round_label: roundLabel,
      player_a_id: playerAId,
      player_b_id: playerBId,
      score_a: null,
      score_b: null,
    }, sa, sb);
  }
  return jsonResponse({ success: true });
}

async function insertGeneratedFixtures(
  sql: ReturnType<typeof postgres>,
  compId: string,
  fixtures: GeneratedFixture[],
): Promise<void> {
  const needsBye = fixtures.some(
    (f) => isByePlayerId(f.playerAId) || isByePlayerId(f.playerBId),
  );
  if (needsBye) await ensureByePlayer(sql);

  for (const f of fixtures) {
    await ensureBracketPlaceholderPlayers(sql, f.playerAId, f.playerBId);
    const sa = f.scoreA == null ? null : Math.trunc(f.scoreA);
    const sb = f.scoreB == null ? null : Math.trunc(f.scoreB);
    const hasResult = sa != null && sb != null;
    await sql`
      insert into ierne_snooker.fixtures (
        competition_id, group_id, stage, round_label, round_name,
        player_a_id, player_b_id, match_date, score_a, score_b, sort_order, best_of,
        result_posted_at, result_approved, result_entered_by
      ) values (
        ${compId}, ${f.groupId}, ${f.stage}, ${f.roundLabel}, ${f.roundName},
        ${f.playerAId}, ${f.playerBId}, null, ${sa}, ${sb}, ${f.sortOrder}, 3,
        case when ${hasResult} then now() else null end,
        ${hasResult},
        ${hasResult ? "Admin" : null}
      )
    `;
  }
}

async function handleGenerateFixtures(data: Record<string, unknown>): Promise<Response> {
  const compId = String(data.compId ?? "").trim();
  if (!compId) return errorResponse("compId required");
  const regenerate = Boolean(data.regenerate);

  const sql = db();
  const compRows = await sql<CompetitionRow[]>`
    select competition_id, name, starts_on, ends_on, is_current,
           competition_type, parent_competition_id
      from ierne_snooker.competitions
     where competition_id = ${compId}
  `;
  if (!compRows.length) return errorResponse("Competition not found", 404);
  const comp = compRows[0] as unknown as CompetitionRow;

  const existingCountRows = await sql<{ cnt: number }[]>`
    select count(*)::int as cnt
      from ierne_snooker.fixtures
     where competition_id = ${compId}
  `;
  const existingCount = Number((existingCountRows[0] as { cnt: number }).cnt) || 0;

  if (existingCount > 0) {
    if (!regenerate) {
      return errorResponse(
        "Fixtures already exist for this competition. Use regenerate to replace them.",
        409,
      );
    }
    // Treat bye pads as not "played" for regenerate eligibility.
    const playedRows = await sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.fixtures
         where competition_id = ${compId}
           and score_a is not null
           and score_b is not null
           and player_a_id <> ${BYE_PLAYER_ID}
           and player_b_id <> ${BYE_PLAYER_ID}
      ) as ok
    `;
    if (Boolean((playedRows[0] as { ok: boolean }).ok)) {
      return errorResponse(
        "Cannot re-generate: one or more fixtures already have a result.",
        409,
      );
    }
    await sql`delete from ierne_snooker.breaks
      where fixture_id in (
        select fixture_id from ierne_snooker.fixtures where competition_id = ${compId}
      )`;
    await sql`delete from ierne_snooker.fixtures where competition_id = ${compId}`;
    await pruneUnusedInternalPlayers(sql);
  }

  const competitionType = normalizeCompetitionType(comp.competition_type);
  let generated: GeneratedFixture[] = [];

  if (competitionType === "league") {
    const groups = await loadCompetitionGroups(compId);
    const members = await sql<CompetitionPlayerRow[]>`
      select competition_id, group_id, player_id
        from ierne_snooker.competition_players
       where competition_id = ${compId}
    `;
    let sortStart = 1;
    for (const g of groups) {
      if (g.group_id === KNOCKOUT_GROUP_ID) continue;
      const ids = (members as unknown as CompetitionPlayerRow[])
        .filter((m) => m.group_id === g.group_id)
        .map((m) => m.player_id);
      const rr = generateLeagueRoundRobin(g.group_id, ids, sortStart);
      generated = generated.concat(rr);
      sortStart += rr.length + 1;
    }
    if (!generated.length) {
      return errorResponse("No group players found to generate league fixtures");
    }
  } else if (competitionType === "knockout" || competitionType === "double-eliminator") {
    await ensureKnockoutCompGroup(compId);
    const members = await sql<CompetitionPlayerRow[]>`
      select competition_id, group_id, player_id
        from ierne_snooker.competition_players
       where competition_id = ${compId}
         and group_id = ${KNOCKOUT_GROUP_ID}
    `;
    const ids = (members as unknown as CompetitionPlayerRow[])
      .map((m) => m.player_id)
      .filter((id) => id && !isBracketPlaceholderPlayerId(id) && !isByePlayerId(id));
    try {
      generated = competitionType === "double-eliminator"
        ? generateDoubleElimFixtures(ids)
        : generateKnockoutFixtures(ids);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(message);
    }
  } else {
    return errorResponse("Unknown competition type");
  }

  await insertGeneratedFixtures(sql, compId, generated);
  await pruneUnusedInternalPlayers(sql);
  return jsonResponse({
    success: true,
    created: generated.length,
    regenerated: regenerate && existingCount > 0,
  });
}

async function requireResultEditor(
  envelope: PostEnvelope,
  fixtureId: string,
): Promise<Response | {
  admin: boolean;
  playerAId: string;
  playerBId: string;
  editorPlayerId: string | null;
}> {
  const sql = db();
  const rows = await sql<{
    fixture_id: string;
    player_a_id: string;
    player_b_id: string;
    result_posted_at: string | Date | null;
  }[]>`
    select fixture_id, player_a_id, player_b_id, result_posted_at
    from ierne_snooker.fixtures
    where fixture_id = ${fixtureId}::uuid
  `;
  const fixture = rows[0];
  if (!fixture) return errorResponse("Fixture not found", 404);

  const adminToken = typeof envelope.adminToken === "string" ? envelope.adminToken.trim() : "";
  if (adminToken && await verifyAdminToken(adminToken)) {
    return {
      admin: true,
      playerAId: fixture.player_a_id,
      playerBId: fixture.player_b_id,
      editorPlayerId: null,
    };
  }

  const player = await readPlayerSession(sql, envelope.sessionToken);
  if (!player) {
    if (adminToken) {
      return unauthorizedResponse(
        "Invalid or expired admin session. Unlock Admin Mode again from the menu.",
      );
    }
    return unauthorizedResponse("Sign in as a player in this match, or unlock Admin Mode.");
  }
  if (player.isAdmin || player.isApprover) {
    return {
      admin: false,
      playerAId: fixture.player_a_id,
      playerBId: fixture.player_b_id,
      editorPlayerId: player.playerId,
    };
  }
  if (player.playerId !== fixture.player_a_id && player.playerId !== fixture.player_b_id) {
    return errorResponse("You can only report results for your own matches.", 403);
  }
  if (!withinResultWindow(fixture.result_posted_at)) {
    return errorResponse(
      "This result is locked. Only an admin or an approver can change it after 24 hours.",
      403,
    );
  }
  return {
    admin: false,
    playerAId: fixture.player_a_id,
    playerBId: fixture.player_b_id,
    editorPlayerId: player.playerId,
  };
}

async function resultEnteredByLabel(
  editorPlayerId: string | null,
  admin: boolean,
  sessionToken: string | undefined,
): Promise<string> {
  if (admin || !editorPlayerId) return "Admin";
  const sql = db();
  const rows = await sql<{ player_name: string }[]>`
    select player_name from ierne_snooker.players where player_id = ${editorPlayerId}
  `;
  const name = String(rows[0]?.player_name || "").trim();
  if (name) return name;
  const actor = await readPlayerSession(sql, sessionToken);
  return actor?.handle || "Player";
}

async function resultApprovedByLabel(envelope: PostEnvelope): Promise<string> {
  const session = typeof envelope.sessionToken === "string" ? envelope.sessionToken.trim() : "";
  if (session) {
    const actor = await readPlayerSession(db(), session);
    if (actor && (actor.isAdmin || actor.isApprover) && actor.playerId) {
      const rows = await db()<{ player_name: string }[]>`
        select player_name from ierne_snooker.players where player_id = ${actor.playerId}
      `;
      const name = String(rows[0]?.player_name || "").trim();
      if (name) return name;
      if (actor.handle) return actor.handle;
    }
  }
  return "Admin";
}

async function handleUpdateFixtureResult(envelope: PostEnvelope): Promise<Response> {
  const data = envelope.data;
  const fixtureId = String(data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const scoreA = parseNullableScore(data.scoreA);
  const scoreB = parseNullableScore(data.scoreB);
  const rawA = data.scoreA;
  const rawB = data.scoreB;
  if (rawA !== undefined && rawA !== null && rawA !== "" && scoreA === null) {
    return errorResponse("Invalid scoreA");
  }
  if (rawB !== undefined && rawB !== null && rawB !== "" && scoreB === null) {
    return errorResponse("Invalid scoreB");
  }
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;

  const hasMatchDate = Object.prototype.hasOwnProperty.call(data, "matchDate");
  let matchDateVal: string | null | undefined;
  if (hasMatchDate) {
    const md = data.matchDate;
    if (md === null || md === "") matchDateVal = null;
    else matchDateVal = String(md).trim();
  }

  const sa = scoreA === null ? null : Math.trunc(scoreA);
  const sb = scoreB === null ? null : Math.trunc(scoreB);
  const clearing = sa === null && sb === null;
  const enteredBy = await resultEnteredByLabel(
    gate.editorPlayerId,
    gate.admin,
    envelope.sessionToken,
  );
  const sql = db();
  const actor = gate.admin ? null : await readPlayerSession(sql, envelope.sessionToken);
  const privileged = gate.admin || !!actor?.isAdmin || !!actor?.isApprover;
  const approved = clearing || privileged;
  const priorRows = await sql<{
    fixture_id: string;
    competition_id: string;
    stage: string;
    round_label: string;
    player_a_id: string;
    player_b_id: string;
    score_a: number | null;
    score_b: number | null;
    result_entered_by: string | null;
    result_approved: boolean;
    result_approved_by: string | null;
  }[]>`
    select fixture_id, competition_id, stage, round_label,
           player_a_id, player_b_id, score_a, score_b,
           result_entered_by, result_approved, result_approved_by
    from ierne_snooker.fixtures
    where fixture_id = ${fixtureId}::uuid
  `;
  const prior = priorRows[0];
  if (!prior) return errorResponse("Fixture not found", 404);
  const priorEntered = String(prior.result_entered_by || "").trim();
  const priorByPlayer = priorEntered !== "" && priorEntered !== "Admin";
  const subsequentApproval = approved && !clearing && priorByPlayer &&
    prior.result_approved === false && privileged;
  const preservePlayerEntry = approved && !clearing && priorByPlayer &&
    prior.result_approved === true;
  const keepExistingApproval = preservePlayerEntry &&
    String(prior.result_approved_by || "").trim() !== "";
  const enteredByToStore = subsequentApproval || preservePlayerEntry ? priorEntered : enteredBy;
  const approvedBy = subsequentApproval ? await resultApprovedByLabel(envelope) : null;
  if (hasMatchDate) {
    await sql`
      update ierne_snooker.fixtures
      set score_a = ${sa},
          score_b = ${sb},
          match_date = ${matchDateVal},
          result_entered_by = ${enteredByToStore},
          result_approved = ${approved},
          result_approved_by = case
            when ${subsequentApproval} then ${approvedBy}
            when ${keepExistingApproval} then result_approved_by
            else null
          end,
          result_approved_at = case
            when ${subsequentApproval} then now()
            when ${keepExistingApproval} then result_approved_at
            else null
          end,
          result_posted_at = case
            when ${sa !== null && sb !== null} then coalesce(result_posted_at, now())
            when ${sa === null && sb === null} then null
            else result_posted_at
          end,
          updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
  } else {
    await sql`
      update ierne_snooker.fixtures
      set score_a = ${sa},
          score_b = ${sb},
          result_entered_by = ${enteredByToStore},
          result_approved = ${approved},
          result_approved_by = case
            when ${subsequentApproval} then ${approvedBy}
            when ${keepExistingApproval} then result_approved_by
            else null
          end,
          result_approved_at = case
            when ${subsequentApproval} then now()
            when ${keepExistingApproval} then result_approved_at
            else null
          end,
          result_posted_at = case
            when ${sa !== null && sb !== null} then coalesce(result_posted_at, now())
            when ${sa === null && sb === null} then null
            else result_posted_at
          end,
          updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
  }
  await syncBracketPlaceholdersForResult(sql, prior, sa, sb);
  if (clearing) await clearFixtureResultSlip(fixtureId);
  return jsonResponse({ success: true, resultApproved: approved });
}

async function handleApproveFixtureResult(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const sql = db();
  const rows = await sql<{
    score_a: number | null;
    score_b: number | null;
    result_entered_by: string | null;
  }[]>`
    select score_a, score_b, result_entered_by
    from ierne_snooker.fixtures
    where fixture_id = ${fixtureId}::uuid
  `;
  const fixture = rows[0];
  if (!fixture) return errorResponse("Fixture not found", 404);
  if (fixture.score_a == null || fixture.score_b == null) {
    return errorResponse("There is no score to approve");
  }
  const entered = String(fixture.result_entered_by || "").trim();
  const byPlayer = entered !== "" && entered !== "Admin";
  const approvedBy = byPlayer ? await resultApprovedByLabel(envelope) : null;
  await sql`
    update ierne_snooker.fixtures
    set result_approved = true,
        result_approved_by = ${approvedBy},
        result_approved_at = case when ${approvedBy !== null} then now() else result_approved_at end,
        updated_at = now()
    where fixture_id = ${fixtureId}::uuid
  `;
  return jsonResponse({ success: true, resultApproved: true });
}

async function handleUpsertBreak(envelope: PostEnvelope): Promise<Response> {
  const data = envelope.data;
  const breakId = data.breakId ? String(data.breakId).trim() : "";
  const fixtureId = String(data.fixtureId ?? "").trim();
  const playerId = String(data.playerId ?? "").trim();
  const value = Number(data.value);
  if (!fixtureId || !playerId) return errorResponse("fixtureId and playerId required");
  if (!Number.isFinite(value)) return errorResponse("value must be a number");
  const vInt = Math.trunc(value);
  if (vInt < 1 || vInt > 155) return errorResponse("value must be 1..155");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;
  if (!gate.admin && playerId !== gate.playerAId && playerId !== gate.playerBId) {
    return errorResponse("Breaks on this match can only be recorded for the two players.", 403);
  }
  const sql = db();
  if (breakId) {
    if (!gate.admin) {
      const existing = await sql<{ fixture_id: string }[]>`
        select fixture_id from ierne_snooker.breaks where break_id = ${breakId}::uuid
      `;
      if (!existing[0]) return errorResponse("Break not found", 404);
      if (String(existing[0].fixture_id).toLowerCase() !== fixtureId.toLowerCase()) {
        return errorResponse("You can only change breaks on your own match.", 403);
      }
    }
    await sql`
      update ierne_snooker.breaks
      set fixture_id = ${fixtureId}::uuid,
          player_id = ${playerId},
          value = ${vInt},
          updated_at = now()
      where break_id = ${breakId}::uuid
    `;
  } else {
    await sql`
      insert into ierne_snooker.breaks (fixture_id, player_id, value)
      values (${fixtureId}::uuid, ${playerId}, ${vInt})
    `;
  }
  return jsonResponse({ success: true });
}

async function handleDeleteBreak(envelope: PostEnvelope): Promise<Response> {
  const data = envelope.data;
  const breakId = String(data.breakId ?? "").trim();
  if (!breakId) return errorResponse("breakId required");
  const sql = db();
  const existing = await sql<{ fixture_id: string }[]>`
    select fixture_id from ierne_snooker.breaks where break_id = ${breakId}::uuid
  `;
  if (!existing[0]) return errorResponse("Break not found", 404);
  const gate = await requireResultEditor(envelope, String(existing[0].fixture_id));
  if (gate instanceof Response) return gate;
  await sql`delete from ierne_snooker.breaks where break_id = ${breakId}::uuid`;
  return jsonResponse({ success: true });
}

async function handleDeleteFixture(data: Record<string, unknown>): Promise<Response> {
  const fixtureId = String(data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const sql = db();
  const rows = await sql<{
    result_slip_path: string | null;
    competition_id: string;
    stage: string;
    round_label: string;
    player_a_id: string;
    player_b_id: string;
    score_a: number | null;
    score_b: number | null;
  }[]>`
    select result_slip_path, competition_id, stage, round_label,
           player_a_id, player_b_id, score_a, score_b
      from ierne_snooker.fixtures
     where fixture_id = ${fixtureId}::uuid
  `;
  const prior = rows[0];
  if (prior && prior.score_a != null && prior.score_b != null) {
    await syncBracketPlaceholdersForResult(sql, {
      fixture_id: fixtureId,
      competition_id: prior.competition_id,
      stage: prior.stage,
      round_label: prior.round_label,
      player_a_id: prior.player_a_id,
      player_b_id: prior.player_b_id,
      score_a: prior.score_a,
      score_b: prior.score_b,
    }, null, null);
  }
  await sql`delete from ierne_snooker.fixtures where fixture_id = ${fixtureId}::uuid`;
  await pruneUnusedInternalPlayers(sql, [
    prior?.player_a_id || "",
    prior?.player_b_id || "",
    prior ? winnerOfId(prior.round_label) : "",
    prior ? loserOfId(prior.round_label) : "",
  ]);
  const dbPath = prior?.result_slip_path || null;
  const paths = [resultSlipPendingPath(fixtureId), resultSlipCommittedPath(fixtureId)];
  if (dbPath) paths.push(dbPath);
  await deleteSlipPaths(paths);
  return jsonResponse({ success: true });
}

async function handleGetResultSlip(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) {
    const approverDenied = await requireScoreApprover(envelope);
    if (approverDenied) return gate;
  }
  const sql = db();
  const rows = await sql<{ result_slip_path: string | null; result_slip_mime: string | null }[]>`
    select result_slip_path, result_slip_mime
      from ierne_snooker.fixtures
     where fixture_id = ${fixtureId}::uuid
  `;
  if (!rows.length) return errorResponse("Fixture not found", 404);
  const path = rows[0]!.result_slip_path;
  if (!path) {
    return jsonResponse({ success: true, hasImage: false, imageUrl: null, mimeType: null });
  }
  const imageUrl = await getSignedSlipUrl(path);
  return jsonResponse({
    success: true,
    hasImage: true,
    imageUrl,
    mimeType: rows[0]!.result_slip_mime || "image/jpeg",
  });
}

async function handleUploadResultSlip(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;
  const payload = decodeImagePayload(
    envelope.data.base64 ?? envelope.data.imageBase64,
    envelope.data.mimeType ?? envelope.data.imageMimeType,
  );
  if (!payload) return errorResponse("Image payload required");
  const path = resultSlipPendingPath(fixtureId);
  await uploadSlipBytes(path, payload.bytes, payload.mime);
  const imageUrl = await getSignedSlipUrl(path);
  return jsonResponse({
    success: true,
    pending: true,
    path,
    mimeType: payload.mime,
    imageUrl,
  });
}

async function handleCommitResultSlip(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;
  const pending = resultSlipPendingPath(fixtureId);
  const committed = resultSlipCommittedPath(fixtureId);
  const sb = storageClient();
  const sql = db();
  const { data: blob, error: dlErr } = await sb.storage.from(RESULT_SLIP_BUCKET).download(pending);
  if (dlErr || !blob) {
    return jsonResponse({ success: true, committed: false });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || "image/jpeg";
  await uploadSlipBytes(committed, bytes, mime);
  await deleteSlipPaths([pending]);
  await sql`
    update ierne_snooker.fixtures
       set result_slip_path = ${committed},
           result_slip_mime = ${mime},
           updated_at = now()
     where fixture_id = ${fixtureId}::uuid
  `;
  const imageUrl = await getSignedSlipUrl(committed);
  return jsonResponse({
    success: true,
    committed: true,
    path: committed,
    mimeType: mime,
    imageUrl,
  });
}

async function handleDiscardResultSlipSession(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;
  await deleteSlipPaths([resultSlipPendingPath(fixtureId)]);
  return jsonResponse({ success: true });
}

async function handleRemoveResultSlip(envelope: PostEnvelope): Promise<Response> {
  const fixtureId = String(envelope.data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const gate = await requireResultEditor(envelope, fixtureId);
  if (gate instanceof Response) return gate;
  await clearFixtureResultSlip(fixtureId);
  return jsonResponse({ success: true });
}

async function handleDeleteHandicap(data: Record<string, unknown>): Promise<Response> {
  const handicapId = String(data.handicapId ?? "").trim();
  if (!handicapId) return errorResponse("handicapId required");
  const sql = db();
  await sql`delete from ierne_snooker.handicaps where handicap_id = ${handicapId}::uuid`;
  return jsonResponse({ success: true });
}

async function handleDeletePlayer(data: Record<string, unknown>): Promise<Response> {
  const playerId = String(data.playerId ?? "").trim();
  if (!playerId) return errorResponse("playerId required");
  if (isInternalPlayerId(playerId)) {
    return errorResponse("Internal bracket placeholders cannot be managed as players");
  }
  const sql = db();
  const [fx, br] = await Promise.all([
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.fixtures
        where player_a_id = ${playerId} or player_b_id = ${playerId}
      ) as ok
    `,
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.breaks where player_id = ${playerId}
      ) as ok
    `,
  ]);
  const inFixtures = Boolean((fx[0] as { ok: boolean }).ok);
  const inBreaks = Boolean((br[0] as { ok: boolean }).ok);
  if (inFixtures || inBreaks) {
    return errorResponse(
      "Cannot delete player: still referenced by fixtures or breaks. Remove or reassign those first.",
      409,
    );
  }
  await sql`delete from ierne_snooker.players where player_id = ${playerId}`;
  return jsonResponse({ success: true });
}

function accountResult(result: unknown): Response {
  if (result && typeof result === "object" && "sessionToken" in (result as object)) {
    const body = result as { sessionToken: string; account: unknown };
    return jsonResponse({ success: true, sessionToken: body.sessionToken, account: body.account });
  }
  if (result && typeof result === "object" && "handle" in (result as object) && "playerId" in (result as object)) {
    return jsonResponse({ success: true, account: result });
  }
  return jsonResponse({ success: true, ...(result as object) });
}

async function dispatchAccount(envelope: PostEnvelope, req: Request): Promise<Response> {
  const sql = db();
  try {
    switch (envelope.action) {
      case "register":
        return accountResult(await registerAccount(sql, req, envelope.data));
      case "connect":
        return accountResult(await connectAccount(sql, req, envelope.data));
      case "resetPassword":
        return accountResult(await resetAccountPassword(sql, req, envelope.data));
      case "signOut":
        return accountResult(await signOutAccount(sql, envelope.sessionToken));
      case "whoAmI":
        return accountResult(await whoAmIAccount(sql, envelope.sessionToken));
      default:
        return errorResponse(`Unknown action: ${envelope.action}`, 400);
    }
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

async function dispatchAdminAccount(envelope: PostEnvelope): Promise<Response> {
  const sql = db();
  try {
    switch (envelope.action) {
      case "issueInvite":
        return accountResult(await issueInvite(sql, envelope.data));
      case "listInvites":
        return jsonResponse({ success: true, invites: await listInvites(sql) });
      case "revokeInvite":
        return accountResult(await revokeInvite(sql, envelope.data));
      case "listAccounts":
        return jsonResponse({ success: true, accounts: await listAccounts(sql) });
      case "disableAccount":
        return accountResult(await disableAccount(sql, envelope.data));
      case "setAccountAdmin":
        return accountResult(await setAccountAdmin(sql, envelope.data));
      case "setAccountApprover":
        return accountResult(await setAccountApprover(sql, envelope.data));
      default:
        return errorResponse(`Unknown action: ${envelope.action}`, 400);
    }
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err.message, err.status);
    throw err;
  }
}

async function dispatchPost(envelope: PostEnvelope, req: Request): Promise<Response> {
  if (PUBLIC_POST_ACTIONS.has(envelope.action)) {
    return dispatchAccount(envelope, req);
  }
  if (PLAYER_RESULT_ACTIONS.has(envelope.action)) {
    switch (envelope.action) {
      case "updateFixtureResult": return handleUpdateFixtureResult(envelope);
      case "upsertBreak": return handleUpsertBreak(envelope);
      case "deleteBreak": return handleDeleteBreak(envelope);
      case "getResultSlip": return handleGetResultSlip(envelope);
      case "uploadResultSlip": return handleUploadResultSlip(envelope);
      case "commitResultSlip": return handleCommitResultSlip(envelope);
      case "discardResultSlipSession": return handleDiscardResultSlipSession(envelope);
      case "removeResultSlip": return handleRemoveResultSlip(envelope);
      default: return errorResponse(`Unknown action: ${envelope.action}`, 400);
    }
  }
  if (!ADMIN_POST_ACTIONS.has(envelope.action)) {
    return errorResponse(`Unknown action: ${envelope.action}`, 400);
  }
  if (envelope.action !== "adminLogin") {
    const denied = envelope.action === "approveFixtureResult"
      ? await requireScoreApprover(envelope)
      : await requireAdmin(envelope);
    if (denied) return denied;
  }
  if (
    envelope.action === "issueInvite" ||
    envelope.action === "listInvites" ||
    envelope.action === "revokeInvite" ||
    envelope.action === "listAccounts" ||
    envelope.action === "disableAccount" ||
    envelope.action === "setAccountAdmin" ||
    envelope.action === "setAccountApprover"
  ) {
    return dispatchAdminAccount(envelope);
  }
  switch (envelope.action) {
    case "adminLogin": return handleAdminLogin(envelope.data);
    case "upsertPlayer": return handleUpsertPlayer(envelope.data);
    case "upsertCompetitionPlayer": return handleUpsertCompetitionPlayer(envelope.data);
    case "upsertHandicap": return handleUpsertHandicap(envelope.data);
    case "upsertCompetition": return handleUpsertCompetition(envelope.data);
    case "deleteCompetition": return handleDeleteCompetition(envelope.data);
    case "upsertCompetitionGroup": return handleUpsertCompetitionGroup(envelope.data);
    case "deleteCompetitionGroup": return handleDeleteCompetitionGroup(envelope.data);
    case "upsertFixture": return handleUpsertFixture(envelope.data);
    case "generateFixtures": return handleGenerateFixtures(envelope.data);
    case "approveFixtureResult": return handleApproveFixtureResult(envelope);
    case "deleteFixture": return handleDeleteFixture(envelope.data);
    case "deleteHandicap": return handleDeleteHandicap(envelope.data);
    case "deletePlayer": return handleDeletePlayer(envelope.data);
    default: return errorResponse(`Unknown action: ${envelope.action}`, 400);
  }
}

// ---------- Server ---------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let action = "";
  try {
    if (req.method === "POST") {
      const env = await parsePostEnvelope(req);
      if (!env?.action) return errorResponse("Missing required parameter: action");
      action = env.action;
      return await dispatchPost(env, req);
    }

    const url = new URL(req.url);
    action = url.searchParams.get("action") ?? "";
    if (!action) return errorResponse("Missing required parameter: action");

    switch (action) {
      case "getCompetitions": return await handleGetCompetitions();
      case "getCompetitionGroups": return await handleGetCompetitionGroups(req);
      case "getFixtures": return await handleGetFixtures(req);
      case "getStandings": return await handleGetStandings(req);
      case "getHandicaps": return await handleGetHandicaps();
      case "getPlayers": return await handleGetPlayers(req);
      case "getPlayerComps": return await handleGetPlayerComps(req);
      case "getTopBreaks": return await handleGetTopBreaks(req);
      case "getBreaksForFixture": return await handleGetBreaksForFixture(req);
      default: return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ierne-api error (action=${action}):`, message);
    return errorResponse(message, 500);
  }
});
