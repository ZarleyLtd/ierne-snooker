// Google Sheets Configuration
// Centralized configuration for all Google Sheets used by the site
// To change the Google Sheet: Update baseSheetId and sheetTabs as needed

const SheetsConfig = {
  // Base Google Sheet ID - Change this to switch to a different sheet
  // To get this ID: Open your Google Sheet -> File -> Share -> Publish to web -> Copy the ID from the URL
  baseSheetId: "2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z",
  
  // Sheet Tab IDs (gid) for different data sources
  // These are the tab/worksheet IDs within the Google Sheet
  sheetTabs: {
    fixtures: "2003970244",    // Fixtures and Results
    leagues: "902750162",      // League Standings
    handicaps: "0"             // Handicaps
  },
  
  // Base URL template for Google Sheets CSV export
  baseUrl: "https://docs.google.com/spreadsheets/d/e/{SHEET_ID}/pub?gid={GID}&single=true&output=csv",
  
  /**
   * Get the CSV export URL for a specific sheet tab
   * @param {string} tabName - The name of the sheet tab (fixtures, leagues, or handicaps)
   * @returns {string} The full URL to the CSV export, or null if tabName is invalid
   */
  getSheetUrl: function(tabName) {
    const gid = this.sheetTabs[tabName];
    if (!gid) {
      console.error(`Unknown sheet tab: ${tabName}`);
      return null;
    }
    return this.baseUrl
      .replace("{SHEET_ID}", this.baseSheetId)
      .replace("{GID}", gid);
  },
  
  /**
   * Get a sheet URL by directly specifying a gid
   * @param {string} gid - The Google Sheet tab ID
   * @returns {string} The full URL to the CSV export
   */
  getSheetUrlByGid: function(gid) {
    return this.baseUrl
      .replace("{SHEET_ID}", this.baseSheetId)
      .replace("{GID}", gid);
  }
};