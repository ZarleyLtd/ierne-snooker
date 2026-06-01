// Main Entry Point & Page Router
// Determines which page module to initialize based on DOM elements

document.addEventListener('DOMContentLoaded', function() {
  // Initialize image loading
  ImageLoader.init();

  // Shared current-competition context (public pages)
  if (typeof CurrentCompetition !== 'undefined') {
    CurrentCompetition.init().catch(function (err) {
      console.error('CurrentCompetition init failed:', err);
    });
  }
  if (typeof NavCompetition !== 'undefined') {
    NavCompetition.init();
  }

  // Admin pages (require Admin Mode for actions)
  if (document.getElementById('adminFixturesRoot') && typeof AdminFixturesPage !== 'undefined') {
    AdminFixturesPage.init();
  }
  if (document.getElementById('adminBulkFixturesRoot') && typeof AdminBulkFixturesPage !== 'undefined') {
    AdminBulkFixturesPage.init();
  }
  if (document.getElementById('adminPlayersRoot') && typeof AdminPlayersPage !== 'undefined') {
    AdminPlayersPage.init();
  }
  if (document.getElementById('adminPlayerRoot') && typeof AdminPlayerPage !== 'undefined') {
    AdminPlayerPage.init();
  }
  if (document.getElementById('adminBulkPlayersRoot') && typeof AdminBulkPlayersPage !== 'undefined') {
    AdminBulkPlayersPage.init();
  }
  if (document.getElementById('adminCompetitionsRoot') && typeof AdminCompetitionsPage !== 'undefined') {
    AdminCompetitionsPage.init();
  }

  // Page detection and initialization
  // Home page — swipeable current competitions
  if (document.getElementById('home-carousel') && typeof IndexPage !== 'undefined') {
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

  // Knockout bracket page
  if (document.getElementById('knockout-bracket') && typeof KnockoutPage !== 'undefined') {
    KnockoutPage.init();
  }

  // Handicaps page
  if (document.getElementById('handicaps')) {
    HandicapsPage.init();
  }

  // Top Breaks page
  if (document.getElementById('topBreaksList')) {
    TopBreaksPage.init();
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
