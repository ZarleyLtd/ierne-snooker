# Snooker League Project Map

## Goal
A lightweight, static HTML website for the local snooker league.
No heavy frameworks. Focus on speed, clean SEO, and simple updates.

## Folder Structure
- `/` (Root): Main pages (`index.html`, `rules.html`, `leagues.html`, `fixtures.html`, `results.html`, etc.).
- `/components/`: Reusable HTML fragments (Header, Nav, Footer).
- `/assets/css/`: Main stylesheet (`style.css`).
- `/assets/js/`: Modular JavaScript architecture:
  - `/config/`: Configuration files (`app-config.js` - single source of truth for the Edge Function URL).
  - `/utils/`: Utility functions (`api-client.js`, `formatters.js`, `image-loader.js`).
  - `/components/`: Reusable JavaScript components (`knockout-renderer.js`, `league-standings.js`).
  - `/pages/`: Page-specific modules (`index.js`, `fixtures.js`, `results.js`, `leagues.js`, `handicaps.js`, etc.).
  - `main.js`: Main entry point and page router.
- `/assets/images/`: Logos and league photos.
- `/supabase/`: Database migrations (`migrations/`) and the Edge Function source (`functions/ierne-api/`).
- `/scripts/`: Node scripts to migrate data from the legacy Google Sheets and verify the Edge Function. See `scripts/README.md`.
- `/docs/`: Operational docs — `SUPABASE_SETUP.md` for the backend runbook, `plans/` for architectural plans.

## Tech Stack & Key Features
- **HTML5/CSS3**: Pure and semantic.
- **Component Strategy**: AI-managed "Sync" (Rules in `.cursorrules`).
- **JavaScript Architecture**: Modular, component-based structure with clear separation of concerns:
  - Configuration centralized in `/config/`
  - Utilities for common operations in `/utils/`
  - Reusable components in `/components/`
  - Page-specific logic in `/pages/`
  - No code duplication — single source of truth for shared logic
- **Backend**: Supabase Postgres, schema `ierne_snooker` on project `Apps` (`yzyipxvlsoxfphwobfkb`). Pages read via the `ierne-api` Edge Function (JSON, GET-only from the browser, no preflight). Standings are computed live via the `league_standings_v` view; the Edge Function applies head-to-head as a mini-league among players tied on points + frame diff. All read endpoints accept `?season=<id>` (default: the row in `seasons` with `is_current = true`).
- **Responsive**: Mobile-first design (Snooker players check scores on phones).

## Page Navigation
- **Home (`index.html`)**: Latest news and knockout tournament results.
- **Leagues (`leagues.html`)**: League standings for League A and League B.
- **Fixtures (`fixtures.html`)**: Upcoming match fixtures.
- **Results (`results.html`)**: Match results.
- **Top Breaks (`top-breaks.html`)**: Leaderboard of the highest breaks recorded in the current season (data lives in `ierne_snooker.breaks`).
- **Handicaps (`handicaps.html`)**: Player handicap information.
- **Rules (`rules.html`)**: Static text explaining league laws.

## Out of Bounds (Publii Hangover)
- DO NOT create `authors/`, `tags/`, or root-level `page/` folders (but `/assets/js/pages/` is correct).
- DO NOT use absolute file paths like `C:/Users/...`.
- DO NOT use complex JavaScript frameworks (React/Vue). Keep it simple.
- DO NOT duplicate JavaScript code — extract to utilities or components.

## Changing the Backend
To point the site at a different Supabase project or environment:
1. Open `/assets/js/config/app-config.js`.
2. Update `apiUrl` with the new Edge Function URL.
3. All pages will automatically use the new backend — no other changes needed.

To change the database schema or add new endpoints, see `docs/SUPABASE_SETUP.md`.