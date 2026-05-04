// Under Development Page - League Standings (Alternative IDs)

const UnderDevelopmentPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-a') || 
      document.getElementById('league-b');
    
    if (!hasLeagueContainers) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('leagues');
      if (!url) {
        console.error('Invalid leagues sheet URL');
        return;
      }
      
      const data = await CsvLoader.load(url, { skipEmptyLines: true });
      
      const { leagueOne, leagueTwo } = LeagueStandings.processData(data);
      
      const sortedOne = LeagueStandings.sort(leagueOne);
      const sortedTwo = LeagueStandings.sort(leagueTwo);
      
      LeagueStandings.render('league-a', sortedOne);
      LeagueStandings.render('league-b', sortedTwo);
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  }
};