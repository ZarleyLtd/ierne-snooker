// League Standings Renderer Component
// Operates on already-shaped league data (objects with keys
// 'Player Name', P, W, L, '+/-', Pts) returned by ApiClient.

const LeagueStandings = {
  /**
   * Sort leagues by points, then plus/minus, then name
   * @param {Array} league - League array
   * @returns {Array} Sorted league array
   */
  sort: function(league) {
    return (league || []).slice().sort((a, b) => {
      const ptsDiff = Formatters.toInt(b.Pts) - Formatters.toInt(a.Pts);
      if (ptsDiff !== 0) return ptsDiff;
      
      const pmDiff = Formatters.toInt(b['+/-']) - Formatters.toInt(a['+/-']);
      if (pmDiff !== 0) return pmDiff;
      
      return String(a['Player Name'] || '').localeCompare(String(b['Player Name'] || ''));
    });
  },
  
  /**
   * Render league standings as formatted text
   * @param {string} containerId - Element ID (e.g., 'league-one', 'league-a')
   * @param {Array} league - Sorted league array
   */
  render: function(containerId, league) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!league || league.length === 0) {
      container.textContent = 'No players.';
      return;
    }
    
    const header = [
      Formatters.padLeft('#', 2),
      Formatters.padRight('Player Name', 16),
      Formatters.padLeft('P', 2),
      Formatters.padLeft('W', 2),
      Formatters.padLeft('L', 2),
      Formatters.padLeft('+/-', 3),
      Formatters.padLeft('Pts', 3)
    ].join(' ');
    
    const sep = '-'.repeat(header.length);
    const lines = [header, sep];
    
    let lastPts = null, lastPM = null, lastRank = 0;
    
    league.forEach((player, idx) => {
      const pts = Formatters.toInt(player.Pts);
      const pm = Formatters.toInt(player['+/-']);
      
      let rank = (pts === lastPts && pm === lastPM) ? lastRank : (idx + 1);
      lastPts = pts;
      lastPM = pm;
      lastRank = rank;
      
      lines.push([
        Formatters.padLeft(rank, 2),
        Formatters.padRight(Formatters.truncateName(player['Player Name']), 16),
        Formatters.padLeft(player.P, 2),
        Formatters.padLeft(player.W, 2),
        Formatters.padLeft(player.L, 2),
        Formatters.padLeft(player['+/-'], 3),
        Formatters.padLeft(player.Pts, 3)
      ].join(' '));
    });
    
    container.textContent = lines.join('\n');
  }
};
