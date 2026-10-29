# Supabase Backend - Setup & Operations

The site reads its data from a Supabase Postgres database (project `Apps`,
ref `yzyipxvlsoxfphwobfkb`) via a single Edge Function called `ierne-api`.

## Architecture

```
Browser (static HTML)
   |  GET ?action=...&comp=...&competitionType=...
   v
Edge Function: ierne-api  (supabase/functions/ierne-api/index.ts)
   |  direct Postgres connection (SUPABASE_DB_URL)
   v
schema: ierne_snooker
   ├─ competitions        (league or knockout comp; optional parent_competition_id)
   ├─ competition_groups  (groups within a league comp)
   ├─ competition_players (roster per comp + group)
   ├─ players             (identity only)
   ├─ accounts            (handle, password, one claimed player)
   ├─ invites             (one-time register or reset codes; hash only)
   ├─ sessions            (hashed player session tokens)
   ├─ fixtures            (comp + group + round + stage + scores + result_posted_at)
   ├─ handicaps           (full history per player)
   └─ breaks              (big breaks per fixture per player)

   views:
   ├─ fixture_results_v   (group-stage completed fixtures)
   ├─ league_standings_v  (P/W/L/D/+-/Pts per comp + group + player)
   └─ head_to_head_v      (record between every ordered pair, used for tiebreaks)
```

The schema is **not** added to the project's "Exposed schemas" list, so it
can't be queried directly via PostgREST. The Edge Function uses a direct
Postgres connection via `SUPABASE_DB_URL`, keeping all data inside the
`ierne_snooker` namespace and away from anonymous clients.

## Data model

```mermaid
erDiagram
    competitions ||--o{ competition_groups : has
    competitions ||--o{ competition_players : has
    competitions ||--o{ fixtures : contains
    competitions ||--o| competitions : "parent KO comp"
    competition_groups ||--o{ competition_players : roster
    competition_groups ||--o{ fixtures : "group stage"
    players ||--o{ competition_players : joins
    players ||--o{ fixtures : "plays as A"
    players ||--o{ fixtures : "plays as B"
    players ||--o{ handicaps : has
    fixtures ||--o{ breaks : logs
    players ||--o{ breaks : "made by"
```

### Standings calculation

`league_standings_v` is computed live from `fixtures` whenever it's read.
Rules baked into the view:

- Only `stage = 'group'` fixtures with both `score_a` and `score_b` set count.
- **Win** (frames_for > frames_against) = 2 points.
- **Draw** (frames_for == frames_against, e.g. 0-0 double-walkover) = 0 points.
- **Loss** (frames_for < frames_against) = 0 points.
- `frame_diff = sum(frames_for) - sum(frames_against)`.

Walkovers are recorded as 2-0; double-walkovers as 0-0 (zero points to both),
matching how the league has historically scored them.

### Standings ordering

The Edge Function applies the tiebreaker chain:

1. `points` desc
2. `frame_diff` desc
3. **head-to-head**, applied as a mini-league among players tied on points
   and frame diff: re-rank within the tied group by sum of H2H points
   against the other tied players, then by H2H frame diff.
4. Otherwise alphabetical (stable).

Players in `competition_players` who haven't played a group-stage fixture yet show up
with all-zero rows.

## File map

| Where                                            | What it does                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `supabase/migrations/*.sql`                      | DDL applied via `supabase db push` or the apply_migration MCP.   |
| `supabase/functions/ierne-api/index.ts`          | Edge Function source.                                            |
| `supabase/config.toml`                           | Pins the function to the project and disables JWT.               |
| `assets/js/config/app-config.js`                 | The function URL the frontend uses.                              |
| `assets/js/utils/api-client.js`                  | Browser-side wrapper around `fetch` for the function.            |
| `scripts/migrate-sheets-to-supabase.mjs`         | One-shot data migration from the legacy Google Sheets.           |
| `scripts/verify-migration.mjs`                   | Smoke test for each Edge Function action.                        |
| `docs/plans/`                                    | Architectural plans (versioned alongside the code).              |

## API contract

### GET actions

Read-only GETs require no custom headers. Default comp is the current row in
`competitions` for the requested `competitionType` (`league` or `knockout`).
Override with `?comp=<id>`.

| Action          | Query params                          | Returns                                                                                                               |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `getFixtures`   | `comp`, `competitionType`             | `{ success, compId, fixtures: [{ fixtureId, "Game Week", "Group", "Stage" (`group`\|`knockout`), ... }] }` |
| `getStandings`  | `comp`, `competitionType`             | `{ success, compId, groups: [{ groupId, name, rows: [...] }] }` |
| `getHandicaps`  | -                                     | `{ success, handicaps: [...], latest: [...] }` |
| `getPlayers`    | `comp`, `group`                       | `{ success, compId?, players: [{ playerId, playerName, group?, active, compCount?, matchCount? }] }` |
| `getPlayerComps`| `playerId`                            | `{ success, competitions: [{ compId, name, isCurrent, competitionType, parentCompId }] }` |
| `getTopBreaks`  | `comp`, `group`, `limit` (def 20), `competitionType` | `{ success, compId, breaks: [...] }` |
| `getCompetitions` | -                                   | `{ success, competitions: [{ compId, name, competitionType, parentCompId, startsOn, endsOn, isCurrent }] }` |
| `getCompetitionGroups` | `compId`                       | `{ success, compId, groups: [{ groupId, name, displayOrder, playerCount? }] }` |
| `getBreaksForFixture` | `fixtureId` (uuid)              | `{ success, fixtureId, breaks: [{ breakId, playerId, value }] }` |

### POST actions (admin writes)

Mutations use `POST` with `Content-Type: application/x-www-form-urlencoded`
and a single field `data` whose value is JSON:

`{ "action": "<name>", "data": { ... }, "adminToken": "<optional>", "sessionToken": "<optional>" }`

CORS stays “simple” (no preflight), matching the public site rules.

1. Call **`adminLogin`** with `{ "pin": "<same value as secret>" }` (no
   `adminToken`). On success the response includes `token` and `expiresAt`.
2. Send `adminToken` on subsequent admin POSTs (stored in `sessionStorage` after you use **Unlock Admin Mode** in the site menu).
3. Player actions send `sessionToken` (stored in `localStorage` after **Connect** or **Register**). `register`, `connect`, and `resetPassword` do not send a token.

Set **`IERNE_ADMIN_SECRET`** on the Edge Function (Dashboard → Edge Functions
→ `ierne-api` → Secrets). Use a long random string or a club PIN; rotating it
invalidates existing tokens. If the secret is unset, `adminLogin` returns an
error and admin mutations return `401 Unauthorized`.

| Action                 | `data` fields (summary) |
| ---------------------- | ----------------------- |
| `register`             | `inviteCode`, `handle`, `password`, `playerId` — no admin token |
| `connect`              | `handle`, `password` — returns `sessionToken` and `account` |
| `resetPassword`        | `handle`, `resetCode`, `newPassword` |
| `signOut` / `whoAmI`   | session token on the envelope, not in `data` |
| `issueInvite`          | admin; `purpose` (`register`\|`reset`), optional `label`, `accountId` required for reset. Returns `code` once |
| `listInvites`          | admin; pending unused codes (the code itself is not stored) |
| `revokeInvite`         | admin; `inviteId` |
| `listAccounts`         | admin |
| `disableAccount`       | admin; `accountId` — revokes that account's sessions |
| `adminLogin`           | `pin` or `secret` |
| `upsertPlayer`         | `playerId`, `playerName`, `active` (optional, default true) |
| `upsertCompetitionPlayer` | `compId`, `playerId`, `groupId`; or `remove: true` |
| `upsertHandicap`       | `playerId`, `handicap`, `effectiveDate`; optional `handicapId` |
| `upsertCompetition`    | `compId`, `name`, `competitionType` (`league`\|`knockout`), optional `parentCompId`, `startsOn`, `endsOn`, `isCurrent` |
| `upsertCompetitionGroup` | `compId`, `groupId`, `name`, `displayOrder`; or `remove: true` |
| `upsertFixture`        | optional `fixtureId`; `compId`, `stage` (`group`\|`knockout`), `roundLabel`, `playerAId`, `playerBId`; `groupId` required when `stage` is `group` |
| `updateFixtureResult`  | `fixtureId`, `scoreA`, `scoreB`; optional `matchDate`. Admin, or a player in the match within 24 hours of `result_posted_at` |
| `upsertBreak`          | optional `breakId`; `fixtureId`, `playerId`, `value` (1–155). Same 24-hour rule as results |
| `deleteBreak`          | `breakId`. Same 24-hour rule as results |
| `deleteFixture`        | `fixtureId` (uuid) |
| `deleteHandicap`       | `handicapId` (uuid) |
| `deletePlayer`         | `playerId` — rejected with `409` if referenced |
| `deleteCompetition`    | `compId` — rejected with `409` if fixtures or child comps exist |
| `deleteCompetitionGroup` | `compId`, `groupId` |

Errors return `{ success: false, error: "..." }` with HTTP 4xx/5xx.

## Setup from scratch

If you ever need to recreate this from a fresh Supabase project:

1. **Apply migrations** (idempotent):
   - `supabase link --project-ref yzyipxvlsoxfphwobfkb` (once per machine)
   - If remote history diverges from git (MCP-applied versions), run:
     `.\scripts\reconcile-supabase-migrations.ps1`
   - Otherwise: `supabase db push`
   - or use the apply_migration MCP tool with the SQL in `supabase/migrations/`.

2. **Deploy the function** (required after any change to `index.ts`, including new GET actions such as `getBreaksForFixture`; otherwise the Enter result dialog cannot load breaks):
   - `supabase functions deploy ierne-api --no-verify-jwt`
   - or use the deploy_edge_function MCP tool. `SUPABASE_DB_URL` is provided
     automatically by the platform. For write APIs from the site (**Unlock Admin Mode**), add secret **`IERNE_ADMIN_SECRET`** (see API contract above).

3. **Update `assets/js/config/app-config.js`** with the new function URL.

4. **Migrate data** from the legacy Google Sheets:
   ```
   npm install
   cp .env.example .env       # then edit values
   npm run migrate:dry-run    # check counts and warnings
   npm run migrate            # live load
   ```

5. **Verify** the function returns the expected data:
   ```
   IERNE_API_URL=https://<ref>.functions.supabase.co/ierne-api npm run verify
   ```

6. **Smoke test the site** by opening each page and confirming data renders:
   - `index.html` (knockout rounds from current knockout comp)
   - `leagues.html` and `under-development.html` (standings by group)
   - `fixtures.html`, `results.html`, `handicaps.html`, `top-breaks.html`
   - Admin pages (after unlocking): `admin-fixtures.html`, `admin-bulk-fixtures.html`, `admin-players.html`, `admin-bulk-players.html`, `admin-competitions.html`, `admin-accounts.html`

## Editing data

Three options:

- **Unlock Admin Mode** (menu): enter the same value as `IERNE_ADMIN_SECRET`, then use admin-only UI on fixtures/results and the manage pages, including **Accounts** (`admin-accounts.html`) where one-time registration and password-reset codes are issued.
- **Player accounts**: a person with a registration code chooses a handle, a password, and which existing player they are. They can post or edit a result (scores, date, and breaks) only for a match they are in, and only for 24 hours after that result is first saved. After that, only an admin can change it. The public link does not require a sign-in.
- **Via the Supabase dashboard** Table Editor on the `ierne_snooker` schema.
  Useful for entering match results, breaks, and adjusting handicaps.
- **Re-run the migration script** after the source Google Sheets are
  updated. Inserts are upserts keyed on stable identifiers (player slug,
  `(season_id, stage, round_label, player_a_id, player_b_id)`,
  `(player_id, effective_date)`, `(season_id, player_id)`), so re-runs are
  safe.

### Adding a new season

1. Insert a new `seasons` row, set `is_current = true` (the partial unique
   index will reject more than one current season).
2. Set the previous season's `is_current` to `false` first.
3. Insert `season_players` rows for the players in each league for the
   season.
4. New fixtures get `season_id = '<new>'`. Standings views automatically
   only consider that season's fixtures when filtered.

### Adding a new league group

Insert a row in `leagues` with the desired `league_id` and `display_order`.
The `getStandings` action returns leagues in `display_order`. The
backwards-compat `leagueA` / `leagueB` aliases only emit for those two IDs;
new leagues live exclusively under the `leagues` array.

## Known gaps / follow-ups

- **Seasonal handicaps**. `handicaps` is global (player + effective date),
  not scoped per season. Add a `season_id` column if season-specific
  handicaps become a requirement.
- **Archive table for closed seasons**. The views handle historical reads
  fine as long as fixtures stay in place; an explicit archive (frozen
  end-of-season standings) would only be needed if you're worried about
  ever deleting old fixtures.
