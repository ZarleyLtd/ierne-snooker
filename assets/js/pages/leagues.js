// Leagues Page - League Standings

const LeaguesPage = {
  init: async function() {
    const hasLeagueContainers = 
      document.getElementById('league-one') || 
      document.getElementById('league-two');
    
    if (!hasLeagueContainers) return;
    
    try {
      const result = await ApiClient.get({
        action: 'getStandings',
        competitionType: 'league',
      });
      const groups = result.groups || [];
      const containerIds = ['league-one', 'league-two'];
      const wrappers = document.querySelectorAll('.standings-wrapper');

      groups.forEach(function (grp, idx) {
        const containerId = containerIds[idx];
        if (!containerId) return;

        if (wrappers[idx]) {
          const heading = wrappers[idx].querySelector('.standings-heading');
          if (heading && grp.name) heading.textContent = grp.name;
        }

        const sorted = LeagueStandings.sort(grp.rows || []);
        LeagueStandings.render(containerId, sorted);
      });

      for (let i = groups.length; i < containerIds.length; i++) {
        LeagueStandings.render(containerIds[i], []);
      }
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  }
};
