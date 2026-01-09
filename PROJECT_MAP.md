# Snooker League Project Map

## 🎯 Goal
A lightweight, static HTML website for the local snooker league. 
No heavy frameworks. Focus on speed, clean SEO, and simple updates.

## 📂 Folder Structure
- `/` (Root): Main pages (`index.html`, `rules.html`, `leagues.html`, `fixtures.html`, `results.html`, etc.).
- `/components/`: Reusable HTML fragments (Header, Nav, Footer).
- `/assets/css/`: Main stylesheet (`style.css`).
- `/assets/js/`: Modular JavaScript architecture:
  - `/config/`: Configuration files (e.g., `sheets-config.js` - single source of truth for Google Sheets).
  - `/utils/`: Utility functions (e.g., `csv-loader.js`, `formatters.js`, `image-loader.js`).
  - `/components/`: Reusable JavaScript components (e.g., `knockout-renderer.js`, `league-standings.js`).
  - `/pages/`: Page-specific modules (e.g., `index.js`, `fixtures.js`, `results.js`, `leagues.js`, `handicaps.js`).
  - `main.js`: Main entry point and page router.
- `/assets/images/`: Logos and league photos.

## 🛠️ Tech Stack & Key Features
- **HTML5/CSS3**: Pure and semantic.
- **Component Strategy**: AI-managed "Sync" (Rules in .cursorrules).
- **JavaScript Architecture**: Modular, component-based structure with clear separation of concerns:
  - Configuration centralized in `/config/`
  - Utilities for common operations in `/utils/`
  - Reusable components in `/components/`
  - Page-specific logic in `/pages/`
  - No code duplication - single source of truth for shared logic
- **External Data**: Google Sheets CSV export used for live league data (configured in `config/sheets-config.js`).
- **Responsive**: Mobile-first design (Snooker players check scores on phones).

## 🧭 Page Navigation
- **Home (`index.html`)**: Latest news and knockout tournament results.
- **Leagues (`leagues.html`)**: League standings for League A and League B.
- **Fixtures (`fixtures.html`)**: Upcoming match fixtures.
- **Results (`results.html`)**: Match results.
- **Top Breaks (`top-breaks.html`)**: Highest break scores.
- **Handicaps (`handicaps.html`)**: Player handicap information.
- **Rules (`rules.html`)**: Static text explaining league laws.

## 🚫 Out of Bounds (Publii Hangover)
- DO NOT create `authors/`, `tags/`, or root-level `page/` folders (but `/assets/js/pages/` is correct).
- DO NOT use absolute file paths like `C:/Users/...`.
- DO NOT use complex JavaScript frameworks (React/Vue). Keep it simple.
- DO NOT duplicate JavaScript code - extract to utilities or components.

## 🔧 Changing Google Sheet Configuration
To switch to a different Google Sheet:
1. Open `/assets/js/config/sheets-config.js`
2. Update `baseSheetId` with your new sheet ID
3. Update `sheetTabs` object with correct tab IDs (gid values)
4. All pages will automatically use the new sheet - no other changes needed!