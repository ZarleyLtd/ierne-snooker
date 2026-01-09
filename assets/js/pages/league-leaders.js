// League Leaders Placeholder Replacement
// Replaces [aleader] and [bleader] placeholders with current league leaders

const LeagueLeadersPlaceholder = {
  init: async function() {
    const hasPlaceholders = 
      document.body.innerHTML.includes('[aleader]') || 
      document.body.innerHTML.includes('[bleader]');
    
    if (!hasPlaceholders) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('leagues');
      if (!url) {
        console.error('Invalid leagues sheet URL');
        return;
      }
      
      const data = await CsvLoader.load(url, { skipEmptyLines: true });
      const dataRows = data.slice(3); // skip header rows
      
      const leagueA = [];
      const leagueB = [];
      
      dataRows.forEach(row => {
        if (row[0] && row[0].trim()) {
          leagueA.push({
            name: row[0].trim(),
            Pts: Formatters.toInt(row[5], 0),
            pm: Formatters.toInt(row[4], 0)
          });
        }
        if (row[7] && row[7].trim()) {
          leagueB.push({
            name: row[7].trim(),
            Pts: Formatters.toInt(row[12], 0),
            pm: Formatters.toInt(row[11], 0)
          });
        }
      });
      
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