# JavaScript Module Structure

This directory contains a modular, component-based JavaScript architecture for the Snooker League website.

## Directory Structure

```
assets/js/
├── config/
│   └── sheets-config.js       # Google Sheets configuration (single source of truth)
├── utils/
│   ├── csv-loader.js          # CSV loading utility (PapaParse wrapper)
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
│   ├── under-development.js   # Under development page
│   └── league-leaders.js      # League leaders placeholder replacement
└── main.js                    # Main entry point & page router
```

## How to Change Google Sheet

1. Open `config/sheets-config.js`
2. Update `baseSheetId` with your new Google Sheet ID
3. Update `sheetTabs` object with the correct gid values for each tab
4. That's it! All pages will automatically use the new sheet.

### Finding Sheet IDs

- **Sheet ID**: Found between `/d/e/` and `/pub` in the published URL
- **Tab ID (gid)**: Found in the `gid=` parameter of the published URL

## Script Loading Order (in HTML)

Scripts must be loaded in this order:

1. PapaParse library (external CDN)
2. Configuration (`config/sheets-config.js`)
3. Utilities (`utils/*.js`)
4. Components (`components/*.js`)
5. Page modules (`pages/*.js`)
6. Main entry point (`main.js`)

## Benefits

- **Single Source of Truth**: Each component/utility exists in one place
- **No Duplication**: Common code is extracted to reusable modules
- **Easy Debugging**: Smaller, focused files make issues easier to find
- **Better AI Efficiency**: Smaller context windows for code changes
- **Scalable**: Easy to add new pages or components
- **Maintainable**: Clear separation of concerns

## Adding a New Page

1. Create a new file in `pages/` (e.g., `pages/my-new-page.js`)
2. Export a module with an `init()` method
3. Add page detection logic in `main.js`
4. Add the script tag to your HTML file

## Module Dependencies

- All modules depend on utilities and config
- Page modules depend on components and utilities
- Main.js depends on all page modules