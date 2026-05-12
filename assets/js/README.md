# JavaScript Module Structure

This directory contains the modular, component-based JavaScript that powers the Snooker League website.

## Directory Structure

```
assets/js/
├── config/
│   └── app-config.js          # Edge Function URL (single source of truth)
├── utils/
│   ├── api-client.js          # Fetch wrapper for the ierne-api Edge Function
│   ├── formatters.js          # Data formatting helpers
│   └── image-loader.js        # Image loading utility
├── components/
│   ├── knockout-renderer.js   # Reusable knockout tournament display component
│   └── league-standings.js    # Reusable league standings display component
├── pages/
│   ├── index.js               # Home page (knockout display)
│   ├── fixtures.js            # Fixtures page
│   ├── results.js             # Results page
│   ├── leagues.js             # Leagues page
│   ├── handicaps.js           # Handicaps page
│   ├── top-breaks.js          # Top Breaks leaderboard for the current season
│   ├── under-development.js   # Under development page
│   └── league-leaders.js      # League leaders placeholder replacement
└── main.js                    # Main entry point & page router
```

## How to Change the Backend

1. Open `config/app-config.js`.
2. Update `apiUrl` with the new Edge Function URL.
3. That's it — all pages automatically pick up the new endpoint.

For schema or endpoint changes, see `../../docs/SUPABASE_SETUP.md`.

## Script Loading Order (in HTML)

Scripts must be loaded in this order:

1. Configuration (`config/app-config.js`)
2. Utilities (`utils/*.js`)
3. Components (`components/*.js`)
4. Page modules (`pages/*.js`)
5. Main entry point (`main.js`)

## API Access Pattern

Pages fetch data through the shared `ApiClient`:

```js
ApiClient.get({ action: 'getFixtures' })
  .then((result) => { /* result.fixtures, result.success */ });
```

The Edge Function is responsible for shaping the data into the column names
the page modules already expect (`'Game Week'`, `'Player A'`, `'Player B'`,
`'Player Name'`, etc.), so most page logic stayed unchanged when we moved
off Google Sheets.

## Benefits

- **Single Source of Truth**: Each component/utility exists in one place
- **No Duplication**: Common code is extracted to reusable modules
- **Easy Debugging**: Smaller, focused files make issues easier to find
- **Better AI Efficiency**: Smaller context windows for code changes
- **Scalable**: Easy to add new pages or components
- **Maintainable**: Clear separation of concerns

## Adding a New Page

1. Create a new file in `pages/` (e.g., `pages/my-new-page.js`).
2. Export a module with an `init()` method.
3. Add page detection logic in `main.js`.
4. Add the script tag to your HTML file in the order shown above.

## Module Dependencies

- All modules depend on utilities and config.
- Page modules depend on components and utilities.
- `main.js` depends on all page modules.
