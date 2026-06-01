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
//   upsertFixture, updateFixtureResult, upsertBreak, deleteBreak,
//   deleteFixture, deleteHandicap, deletePlayer
//
// Standings ordering (Ierne tiebreak chain):
//   1. points desc
//   2. frame_diff desc
//   3. head-to-head among tied players (h2h_points, then h2h_frame_diff)
//   4. alphabetical (stable)

import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

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

// ---------- Types -----------------------------------------------------------

type PlayerRow = { player_id: string; player_name: string; active: boolean };

type CompetitionRow = {
  competition_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_current: boolean;
  competition_type: "league" | "knockout";
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
  player_a_id: string;
  player_b_id: string;
  match_date: string | null;
  score_a: number | null;
  score_b: number | null;
  sort_order: number;
};

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

function normalizeCompetitionType(raw: string | null): "league" | "knockout" {
  const t = String(raw ?? "league").trim().toLowerCase();
  return t === "knockout" ? "knockout" : "league";
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

const KNOCKOUT_ROUND_LABELS: Record<string, string> = {
  PO1: "Play-off 1",
  PO2: "Play-off 2",
  PO3: "Play-off 3",
  PO4: "Play-off 4",
  QF1: "Quarter-final 1",
  QF2: "Quarter-final 2",
  QF3: "Quarter-final 3",
  QF4: "Quarter-final 4",
  SF1: "Semi-final 1",
  SF2: "Semi-final 2",
  F: "Final",
  PQ: "Plate Quarters",
  PS: "Plate Semis",
  PF: "Plate Final",
  CS: "Championship Semis",
  CF: "Championship Final",
};

function knockoutRoundLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  if (KNOCKOUT_ROUND_LABELS[c]) return KNOCKOUT_ROUND_LABELS[c];
  const koLast = c.match(/^KO Last (\d+)$/i);
  if (koLast) {
    const n = parseInt(koLast[1], 10);
    if (n === 2) return "Final";
    if (n === 4) return "Semi-finals";
    if (n === 8) return "Quarter-finals";
    if (n === 16) return "Last 16";
    return `Last ${n}`;
  }
  if (/^KO Pre-/i.test(c)) return "Preliminary";
  return c;
}

function winnerOfPlayerName(roundCode: string): string {
  const label = knockoutRoundLabel(roundCode);
  const base = label || roundCode.trim();
  return base ? `${base} Winner` : "Winner";
}

function isWinnerOfPlayerId(playerId: string): boolean {
  return playerId.startsWith(WINNER_OF_PREFIX);
}

async function ensureWinnerOfPlayers(
  sql: ReturnType<typeof postgres>,
  ...playerIds: string[]
): Promise<void> {
  for (const playerId of playerIds) {
    if (!isWinnerOfPlayerId(playerId)) continue;
    const roundCode = playerId.slice(WINNER_OF_PREFIX.length);
    if (!roundCode) continue;
    const playerName = winnerOfPlayerName(roundCode);
    await sql`
      insert into ierne_snooker.players (player_id, player_name, active, updated_at)
      values (${playerId}, ${playerName}, false, now())
      on conflict (player_id) do update set
        player_name = excluded.player_name,
        updated_at = now()
    `;
  }
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

  if (comp.competition_type === "knockout") {
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
         ${comp.competition_type} = 'knockout'
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
    }[]>`
      select p.player_id,
             p.player_name,
             p.active,
             coalesce(cc.comp_count, 0)::int as comp_count,
             coalesce(mc.match_count, 0)::int as match_count
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
      })),
    });
  }

  const compId = await resolveCompId(compParam, url.searchParams.get("competitionType"));
  const sql = db();
  const rows = await sql<(CompetitionPlayerRow & { player_name: string; active: boolean })[]>`
    select cp.competition_id, cp.group_id, cp.player_id, p.player_name, p.active
    from ierne_snooker.competition_players cp
    join ierne_snooker.players p on p.player_id = cp.player_id
    where cp.competition_id = ${compId}
      and (${groupParam}::text is null or cp.group_id = ${groupParam})
    order by p.player_name asc
  `;
  return jsonResponse({
    success: true,
    compId,
    players: (rows as unknown as Array<CompetitionPlayerRow & { player_name: string; active: boolean }>).map((r) => ({
      playerId: r.player_id,
      playerName: r.player_name,
      groupId: r.group_id,
      active: r.active,
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
      select fixture_id, competition_id, group_id, stage, round_label,
             player_a_id, player_b_id,
             to_char(match_date, 'YYYY-MM-DD') as match_date,
             score_a, score_b, sort_order
      from ierne_snooker.fixtures
      where competition_id = ${compId}
      order by sort_order asc, round_label asc
    `,
  ]);
  const playerMap = buildPlayerMap(players);

  const fixtures = (fixtureRows as unknown as FixtureRow[]).map((r) => {
    const a = playerMap.get(r.player_a_id);
    const b = playerMap.get(r.player_b_id);
    const nameA = isWinnerOfPlayerId(r.player_a_id)
      ? winnerOfPlayerName(r.player_a_id.slice(WINNER_OF_PREFIX.length))
      : (a?.player_name ?? "");
    const nameB = isWinnerOfPlayerId(r.player_b_id)
      ? winnerOfPlayerName(r.player_b_id.slice(WINNER_OF_PREFIX.length))
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
      playerAId: r.player_a_id,
      playerBId: r.player_b_id,
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
  const [players, groups, members, standings, h2h] = await Promise.all([
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
  "updateFixtureResult",
  "upsertBreak",
  "deleteBreak",
  "deleteFixture",
  "deleteHandicap",
  "deletePlayer",
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
    return { action, data, adminToken };
  } catch {
    return null;
  }
}

async function requireAdmin(envelope: PostEnvelope): Promise<Response | null> {
  const raw = envelope.adminToken;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    return unauthorizedResponse(
      "Missing admin token. Unlock Admin Mode from the site menu, then try again.",
    );
  }
  if (await verifyAdminToken(token)) return null;
  return unauthorizedResponse(
    "Invalid or expired admin session. Unlock Admin Mode again from the menu.",
  );
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
    if (isCurrent) {
      await tx`
        update ierne_snooker.competitions
        set is_current = false, updated_at = now()
        where competition_type = ${competitionType}
          and competition_id <> ${compId}
      `;
    }
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

  if (competitionType === "knockout") {
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
  const [fx, children] = await Promise.all([
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.fixtures where competition_id = ${compId}
      ) as ok
    `,
    sql<{ ok: boolean }[]>`
      select exists(
        select 1 from ierne_snooker.competitions
         where parent_competition_id = ${compId}
      ) as ok
    `,
  ]);
  if (Boolean((fx[0] as { ok: boolean }).ok)) {
    return errorResponse(
      "Cannot delete competition: fixtures still exist. Delete or move those fixtures first.",
      409,
    );
  }
  if (Boolean((children[0] as { ok: boolean }).ok)) {
    return errorResponse(
      "Cannot delete competition: child competitions still reference it.",
      409,
    );
  }
  await sql`delete from ierne_snooker.competitions where competition_id = ${compId}`;
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

async function handleUpsertFixture(data: Record<string, unknown>): Promise<Response> {
  const fixtureId = data.fixtureId ? String(data.fixtureId).trim() : "";
  const compId = String(data.compId ?? "").trim();
  const stage = String(data.stage ?? "").trim();
  const roundLabel = String(data.roundLabel ?? "").trim();
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

  const sql = db();
  await ensureWinnerOfPlayers(sql, playerAId, playerBId);
  const sa = scoreA === null ? null : Math.trunc(scoreA);
  const sb = scoreB === null ? null : Math.trunc(scoreB);
  const so = Math.trunc(sortOrder);

  if (fixtureId) {
    await sql`
      update ierne_snooker.fixtures set
        competition_id = ${compId},
        group_id = ${groupId},
        stage = ${stage},
        round_label = ${roundLabel},
        player_a_id = ${playerAId},
        player_b_id = ${playerBId},
        match_date = ${matchDate},
        score_a = ${sa},
        score_b = ${sb},
        sort_order = ${so},
        updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
    return jsonResponse({ success: true });
  }

  await sql`
    insert into ierne_snooker.fixtures (
      competition_id, group_id, stage, round_label,
      player_a_id, player_b_id, match_date, score_a, score_b, sort_order
    ) values (
      ${compId}, ${groupId}, ${stage}, ${roundLabel},
      ${playerAId}, ${playerBId}, ${matchDate}, ${sa}, ${sb}, ${so}
    )
  `;
  return jsonResponse({ success: true });
}

async function handleUpdateFixtureResult(data: Record<string, unknown>): Promise<Response> {
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
  const hasMatchDate = Object.prototype.hasOwnProperty.call(data, "matchDate");
  let matchDateVal: string | null | undefined;
  if (hasMatchDate) {
    const md = data.matchDate;
    if (md === null || md === "") matchDateVal = null;
    else matchDateVal = String(md).trim();
  }

  const sql = db();
  if (hasMatchDate) {
    await sql`
      update ierne_snooker.fixtures
      set score_a = ${scoreA === null ? null : Math.trunc(scoreA)},
          score_b = ${scoreB === null ? null : Math.trunc(scoreB)},
          match_date = ${matchDateVal},
          updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
  } else {
    await sql`
      update ierne_snooker.fixtures
      set score_a = ${scoreA === null ? null : Math.trunc(scoreA)},
          score_b = ${scoreB === null ? null : Math.trunc(scoreB)},
          updated_at = now()
      where fixture_id = ${fixtureId}::uuid
    `;
  }
  return jsonResponse({ success: true });
}

async function handleUpsertBreak(data: Record<string, unknown>): Promise<Response> {
  const breakId = data.breakId ? String(data.breakId).trim() : "";
  const fixtureId = String(data.fixtureId ?? "").trim();
  const playerId = String(data.playerId ?? "").trim();
  const value = Number(data.value);
  if (!fixtureId || !playerId) return errorResponse("fixtureId and playerId required");
  if (!Number.isFinite(value)) return errorResponse("value must be a number");
  const vInt = Math.trunc(value);
  if (vInt < 1 || vInt > 155) return errorResponse("value must be 1..155");
  const sql = db();
  if (breakId) {
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

async function handleDeleteBreak(data: Record<string, unknown>): Promise<Response> {
  const breakId = String(data.breakId ?? "").trim();
  if (!breakId) return errorResponse("breakId required");
  const sql = db();
  await sql`delete from ierne_snooker.breaks where break_id = ${breakId}::uuid`;
  return jsonResponse({ success: true });
}

async function handleDeleteFixture(data: Record<string, unknown>): Promise<Response> {
  const fixtureId = String(data.fixtureId ?? "").trim();
  if (!fixtureId) return errorResponse("fixtureId required");
  const sql = db();
  await sql`delete from ierne_snooker.fixtures where fixture_id = ${fixtureId}::uuid`;
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

async function dispatchPost(envelope: PostEnvelope): Promise<Response> {
  if (!ADMIN_POST_ACTIONS.has(envelope.action)) {
    return errorResponse(`Unknown action: ${envelope.action}`, 400);
  }
  if (envelope.action !== "adminLogin") {
    const denied = await requireAdmin(envelope);
    if (denied) return denied;
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
    case "updateFixtureResult": return handleUpdateFixtureResult(envelope.data);
    case "upsertBreak": return handleUpsertBreak(envelope.data);
    case "deleteBreak": return handleDeleteBreak(envelope.data);
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
      return await dispatchPost(env);
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
