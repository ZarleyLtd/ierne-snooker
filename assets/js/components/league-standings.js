// League Standings Renderer Component
// Handles both league-one/league-two and league-a/league-b variants

const LeagueStandings = {
  /**
   * Process raw CSV data into league arrays
   * @param {Array} data - Raw CSV data
   * @param {number} startRow - Row index to start from (default: 3)
   * @returns {Object} { leagueOne, leagueTwo }
   */
  processData: function(data, startRow = 3) {
    const rows = data.slice(startRow);
    const leagueOne = [];
    const leagueTwo = [];
    
    rows.forEach(row => {
      if (row[0] && row[0].trim()) {
        leagueOne.push({
          'Player Name': row[0].trim(),
          P: row[1] || '',
          W: row[2] || '',
          L: row[3] || '',
          '+/-': row[4] || '',
          Pts: row[5] || ''
        });
      }
      if (row[7] && row[7].trim()) {
        leagueTwo.push({
          'Player Name': row[7].trim(),
          P: row[8] || '',
          W: row[9] || '',
          L: row[10] || '',
          '+/-': row[11] || '',
          Pts: row[12] || ''
        });
      }
    });
    
    return { leagueOne, leagueTwo };
  },
  
  /**
   * Sort leagues by points, then plus/minus, then name
   * @param {Array} league - League array
   * @returns {Array} Sorted league array
   */
  sort: function(league) {
    return league.sort((a, b) => {
      const ptsDiff = Formatters.toInt(b.Pts) - Formatters.toInt(a.Pts);
      if (ptsDiff !== 0) return ptsDiff;
      
      const pmDiff = Formatters.toInt(b['+/-']) - Formatters.toInt(a['+/-']);
      if (pmDiff !== 0) return pmDiff;
      
      return a['Player Name'].localeCompare(b['Player Name']);
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
    
    if (league.length === 0) {
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