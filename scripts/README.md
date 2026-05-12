# Scripts

One-shot Node scripts for setting up and verifying the Supabase backend.
Requires Node 18+ and the `pg` npm dep declared in `package.json`.

## Setup

```
npm install
cp .env.example .env
```

Then edit `.env`:

- `SUPABASE_DB_URL` — Project Settings → Database → Connection string (URI form)
- `IERNE_API_URL` — your Edge Function URL (used by verify only)

Load the env into PowerShell before running scripts:

```
Get-Content .env | ForEach-Object { if ($_ -and $_ -notmatch '^#') { $k,$v = $_ -split '=',2; [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim()) } }
```

## Migrate Google Sheets -> Supabase

```
npm run migrate:dry-run   # parse + report only
npm run migrate           # live upsert
```

The script:

1. Pulls the published-CSV exports of the fixtures, leagues and handicaps
   tabs (overridable via `SHEET_GID_*` env vars).
2. Builds the player roster from the leagues sheet (cols 0-5 = League A,
   cols 7-12 = League B). League membership is derived from there because
   the fixtures sheet has no league column.
3. Upserts `players`, `fixtures` (with parsed `score_a`/`score_b`),
   `handicaps` (full history) and `league_standings` against the
   `ierne_snooker` schema via a direct Postgres connection.
4. Writes a JSON report to `scripts/migration-reports/`.

Idempotent — safe to re-run after fixing source data.

## Verify

```
npm run verify
```

Hits each Edge Function action (`getFixtures`, `getStandings`,
`getHandicaps`, `getPlayers`) and prints counts + a small sample so you can
confirm the function is up and the data looks right.
