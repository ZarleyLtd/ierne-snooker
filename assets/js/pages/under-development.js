// Under Development Page - League Standings (Alternative IDs)

const UnderDevelopmentPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-a') || 
      document.getElementById('league-b');
    
    if (!hasLeagueContainers) return;
    
    try {
      const result = await ApiClient.get({
        action: 'getStandings',
        competitionType: 'league',
      });
      const groups = result.groups || [];
      const containerIds = ['league-a', 'league-b'];

      groups.forEach(function (grp, idx) {
        const containerId = containerIds[idx];
        if (!containerId) return;
        LeagueStandings.render(containerId, LeagueStandings.sort(grp.rows || []));
      });

      for (let i = groups.length; i < containerIds.length; i++) {
        LeagueStandings.render(containerIds[i], []);
      }
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  }
};
