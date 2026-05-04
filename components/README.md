# Components Directory

This directory contains reusable HTML components for the Snooker League website. Since this is a static site without a build system, components must be manually copied into each HTML page.

## Available Components

### `header.html`
**Location in pages:** After the opening `<body class="page-template">` tag

Contains the site header with logo and navigation menu. The active navigation item is set dynamically by `nav-active.js`, so no `active` class should be hardcoded in navigation items.

### `footer.html`
**Location in pages:** Before the scripts section (after closing `</main>` tag or before closing `</body>` tag if no main)

Contains the site footer with navigation links, copyright, and back-to-top button.

### `scripts.html`
**Location in pages:** Before the closing `</body>` tag

Contains all shared JavaScript includes:
- `scripts.min.js` - Main site scripts
- `window.themeMenuConfig` - Menu configuration object
- `nav-active.js` - Navigation active state management
- `nav-debug.js` - Debug utility (commented out by default, only enable when debugging)

### `nav.html`
**Note:** This component is embedded within `header.html`. It's kept separate for potential future use or if you need to use navigation independently.

## Usage Instructions

1. **To update a component:**
   - Edit the component file in this directory
   - Copy the updated content (everything below the comment block) to all HTML pages that use it
   - Ensure you replace the exact same section in each page

2. **To add a new page:**
   - Copy the header from `header.html` (content below comments) after `<body class="page-template">`
   - Copy the footer from `footer.html` (content below comments) before scripts
   - Copy the scripts from `scripts.html` (content below comments) before `</body>`

3. **Best Practices:**
   - Always keep component files up to date
   - When making changes, update the component file first, then propagate to all pages
   - Update the "Last updated" date in component file comments when making changes
   - Test changes on multiple pages to ensure consistency

## Component Status

All pages should use identical versions of:
- ✅ Header component (currently used across all pages)
- ✅ Footer component (currently used across all pages)  
- ✅ Scripts component (currently standardized across all pages)

## Future Improvements

Consider implementing a simple build script to automate component inclusion:
- Node.js script using file system operations
- Template engine like Handlebars or Mustache
- Static site generator (11ty, Jekyll, etc.)

This would eliminate manual copying and reduce errors.
