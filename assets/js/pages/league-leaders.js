// League Leaders Placeholder Replacement
// Replaces [aleader] and [bleader] placeholders with current league leaders

const LeagueLeadersPlaceholder = {
  init: async function() {
    const hasPlaceholders = 
      document.body.innerHTML.includes('[aleader]') || 
      document.body.innerHTML.includes('[bleader]');
    
    if (!hasPlaceholders) return;
    
    try {
      const result = await ApiClient.get({
        action: 'getStandings',
        competitionType: 'league',
      });
      const groups = result.groups || [];
      const mapRows = function (rows) {
        return (rows || []).map(function (r) {
          return {
            name: r['Player Name'],
            Pts: Formatters.toInt(r.Pts, 0),
            pm: Formatters.toInt(r['+/-'], 0),
          };
        });
      };
      const leagueA = mapRows(groups[0] ? groups[0].rows : []);
      const leagueB = mapRows(groups[1] ? groups[1].rows : []);
      
      // Sort by points then plus/minus
      const sortFn = (a, b) => (b.Pts - a.Pts) || (b.pm - a.pm);
      leagueA.sort(sortFn);
      leagueB.sort(sortFn);
      
      // Get top players
      const aLeader = this.getTopPlayers(leagueA);
      const bLeader = this.getTopPlayers(leagueB);
      
      // Replace placeholders
      document.querySelectorAll('p, h3, div, span').forEach(el => {
        el.innerHTML = el.innerHTML
          .replace(/\[aleader\]/g, aLeader)
          .replace(/\[bleader\]/g, bLeader);
      });
    } catch (error) {
      console.error('Failed to load league leaders:', error);
    }
  },
  
  getTopPlayers: function(league) {
    if (league.length === 0) return 'N/A';
    
    const topPoints = league[0].Pts;
    const topPM = league[0].pm;
    
    // Get all players tied at the top
    const topPlayers = league
      .filter(p => p.Pts === topPoints && p.pm === topPM)
      .map(p => p.name);
    
    if (topPlayers.length === 1) {
      return topPlayers[0];
    } else {
      return topPlayers.join(' & ') + ' (tied)';
    }
  }
};
