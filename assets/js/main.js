// Main Entry Point & Page Router
// Determines which page module to initialize based on DOM elements

document.addEventListener('DOMContentLoaded', function() {
  // Initialize image loading
  ImageLoader.init();
  
  // Page detection and initialization
  // Home page - Knockout tournament display
  if (document.getElementById('champ-semis') || 
      document.getElementById('champ-final') ||
      document.getElementById('plate-qf') ||
      document.getElementById('plate-sf') ||
      document.getElementById('plate-final')) {
    IndexPage.init();
  }
  
  // Fixtures page
  if (document.getElementById('fixtures-list')) {
    FixturesPage.init();
  }
  
  // Results page
  if (document.getElementById('results-list')) {
    ResultsPage.init();
  }
  
  // Leagues page (league-one, league-two)
  if (document.getElementById('league-one') || 
      document.getElementById('league-two')) {
    LeaguesPage.init();
  }
  
  // Handicaps page
  if (document.getElementById('handicaps')) {
    HandicapsPage.init();
  }
  
  // Under development page (league-a, league-b)
  if (document.getElementById('league-a') || 
      document.getElementById('league-b')) {
    UnderDevelopmentPage.init();
  }
  
  // Check for placeholder replacement (for old front page)
  if (document.body.innerHTML.includes('[aleader]') || 
      document.body.innerHTML.includes('[bleader]')) {
    LeagueLeadersPlaceholder.init();
  }
});