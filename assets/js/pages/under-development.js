// Under Development Page - League Standings (Alternative IDs)

const UnderDevelopmentPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-a') || 
      document.getElementById('league-b');
    
    if (!hasLeagueContainers) return;
    
    try {
      const result = await ApiClient.get({ action: 'getStandings' });
      const leagueOne = result.leagueA || [];
      const leagueTwo = result.leagueB || [];
      
      const sortedOne = LeagueStandings.sort(leagueOne);
      const sortedTwo = LeagueStandings.sort(leagueTwo);
      
      LeagueStandings.render('league-a', sortedOne);
      LeagueStandings.render('league-b', sortedTwo);
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  }
};
