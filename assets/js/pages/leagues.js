// Leagues Page - League Standings

const LeaguesPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-one') || 
      document.getElementById('league-two');
    
    if (!hasLeagueContainers) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('leagues');
      if (!url) {
        console.error('Invalid leagues sheet URL');
        return;
      }
      
      const data = await CsvLoader.load(url, { header: false, skipEmptyLines: true });
      
      const { leagueOne, leagueTwo } = LeagueStandings.processData(data);
      
      const sortedOne = LeagueStandings.sort(leagueOne);
      const sortedTwo = LeagueStandings.sort(leagueTwo);
      
      LeagueStandings.render('league-one', sortedOne);
      LeagueStandings.render('league-two', sortedTwo);
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  }
};