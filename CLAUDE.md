# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ierne Snooker League website: a static HTML/CSS/vanilla-JS site (no framework, no build step) backed by a single Supabase Edge Function over Postgres. `PROJECT_MAP.md`, `assets/js/README.md`, `components/README.md` and `docs/SUPABASE_SETUP.md` are the project's own docs; keep them in sync when changing what they describe.

## Commands

There is no build, lint, or test suite.

**Dev server:** none is configured in the repo (no npm script, no port). Any static file server pointed at the repo root works. Serve over HTTP rather than opening files via `file://`, because `main.js` skips service-worker registration on `file:`. All pages call the live Edge Function in `app-config.js`; there is no local backend.

- `npm install` — only needed for the Node scripts (`pg` dependency).
- `npm run migrate:dry-run` / `npm run migrate` — legacy Google Sheets → Supabase import (idempotent). Needs `SUPABASE_DB_URL` from `.env` (see `scripts/README.md` for loading `.env` in PowerShell).
- `npm run verify` — smoke-tests Edge Function GET actions; needs `IERNE_API_URL`.
- `supabase functions deploy ierne-api --no-verify-jwt` — required after **any** change to `supabase/functions/ierne-api/*.ts`; frontend changes that rely on new/changed actions won't work until deployed.
- `supabase db push` — apply migrations (project ref `yzyipxvlsoxfphwobfkb`). If remote migration history has diverged (MCP-applied versions), run `scripts/reconcile-supabase-migrations.ps1` first. The Supabase MCP `apply_migration` / `deploy_edge_function` tools are an accepted alternative.

## Architecture

**Request flow:** browser page → `ApiClient` (`assets/js/utils/api-client.js`) → Edge Function `ierne-api` (`supabase/functions/ierne-api/index.ts`, account logic in `accounts.ts`) → direct Postgres connection to schema `ierne_snooker`. The schema is deliberately *not* exposed via PostgREST; never call supabase-js/PostgREST from the browser. The function URL lives only in `assets/js/config/app-config.js`.

**CORS constraint:** the function does not handle preflight. Reads are `ApiClient.get({ action, ... })` (GET, no custom headers). Writes are `ApiClient.post(action, data)` which sends `application/x-www-form-urlencoded` with one `data` field containing JSON `{ action, data, adminToken?, sessionToken? }`. Don't add custom headers or JSON bodies.

**Auth tiers in the Edge Function** (see `dispatchPost` in `index.ts`):
- `PUBLIC_POST_ACTIONS` — register/connect/resetPassword etc. (player accounts, `sessionToken` kept in `localStorage`).
- `PLAYER_RESULT_ACTIONS` — result entry, breaks, result-slip photos; allowed for admins or a player in the match within the time window. Player-entered scores stay pending until approved.
- `ADMIN_POST_ACTIONS` — require an HMAC `adminToken` from `adminLogin` (secret `IERNE_ADMIN_SECRET`; token kept in `sessionStorage` via "Unlock Admin Mode"). `approveFixtureResult` also accepts the Approver role.
New read endpoints go in the GET switch in `index.ts`. New POST actions must be added to the right set *and* the switch. Document both kinds in `docs/SUPABASE_SETUP.md`.

**Data model:** `competitions` (`competition_type`: `league` | `knockout` | `double-eliminator`, optional `parent_competition_id` linking a KO to its league, multiple may be `is_current`) → `competition_groups`, `competition_players`, `fixtures` (`stage` `group`|`knockout`, round codes, optional `round_name`), plus `players`, `handicaps`, `breaks`, `accounts`/`invites`/`sessions`. Standings are computed live by `league_standings_v` (group-stage only; win = 2 pts); the Edge Function applies the tiebreak chain (points → frame diff → head-to-head mini-league via `head_to_head_v` → alphabetical). The function reshapes rows into legacy sheet-style keys (`'Game Week'`, `'Player A'`, …) that page modules expect. Knockout/double-elim round codes and bracket layout live in `assets/js/utils/knockout-rounds.js` and `knockout-bracket.js`; the DE scheme is specified in `docs/plans/double-eliminator.md`.

**Frontend JS:** plain scripts that define globals (e.g. `const FixturesPage = {...}`), not ES modules. Every page includes `<script>` tags in strict order: config → utils → components → pages → `main.js`. `main.js` is the router: it calls each page's `init()` based on which root element ID exists in the DOM. Adding a page = new `pages/*.js` with `init()`, a DOM-detection branch in `main.js`, and script tags in the HTML. Shared logic goes in `utils/` or `components/`, never duplicated across pages.

**HTML components:** there is no templating. Header/footer/scripts in `components/*.html` are copied verbatim into every root `.html` page. Edit the component file first, then propagate the same change to all pages.

**PWA:** `sw.js` precaches a shell list of pages/CSS/JS under a versioned cache name (`ierne-shell-vN`). When adding/renaming shell assets or shipping changes to them, update the list and bump the version.

**Contextual help:** the "?" button system (`components/contextual-help.js`, catalog in `utils/help-catalog.js`, topics via `data-help` attributes, fallback via `body[data-page]`). New user-facing controls should get a `data-help` key and catalog entry; help text explains the feature generically, never a specific player/match. See `docs/UI_CONTEXTUAL_HELP.md`.

## Conventions

(Moved here from the former `.cursorrules` and `.cursor/rules/edison.mdc`.)

- When asked to update the "Header" or "Footer", update `components/` first, then propagate to every `.html` page.
- JS changes: update shared `utils/` first, then reusable `components/`, then page modules in `pages/`.
- To change the backend endpoint, edit only `assets/js/config/app-config.js`.
- Relative paths only (`assets/css/style.css`, not `/assets/...`); no `localhost` URLs or drive-letter paths.
- Schema changes: new timestamp-prefixed file in `supabase/migrations/`; all objects in the `ierne_snooker` schema.
- Architectural plans in `docs/plans/` are kept in sync with the code.
- UI/layout reference: the sibling project `C:\CursorSites\PubliiCrossguns` is the canonical model for nav, fixture rows, admin dialogs, etc. Compare with its `assets/css/style.css` and matching page JS before inventing new patterns.
- Don't create Publii-leftover folders (`authors/`, `tags/`, root `page/`) and don't introduce JS frameworks.
- Edison tickets (GitHub issues labeled `edison`, filed in the Edison tracker): read the issue body, comments and linked screenshots; act on every note since the last round, oldest first; work on a new branch (or continue the existing PR's branch), open a PR referencing the issue without merging, comment a short summary, and swap label `stage:working` → `stage:review` (or `stage:needs-input` with a question when blocked).
