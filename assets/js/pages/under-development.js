// Under Development Page - League Standings (Alternative IDs)

const UnderDevelopmentPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-a') || 
      document.getElementById('league-b');
    
    if (!hasLeagueContainers) return;
    
    try {
      var params = { action: 'getStandings' };
      if (typeof CurrentCompetition !== 'undefined') {
        Object.assign(params, CurrentCompetition.apiParams());
      } else {
        params.competitionType = 'league';
      }
      const result = await ApiClient.get(params);
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
