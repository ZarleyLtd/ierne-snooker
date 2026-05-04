// Results Page - Match Results

const ResultsPage = {
  KO_LABELS: {
    'CS': 'Championship Semis',
    'CF': 'Championship Final',
    'PQ': 'Plate Quarters',
    'PS': 'Plate Semis',
    'PF': 'Plate Final'
  },
  
  init: async function() {
    const container = document.getElementById('results-list');
    if (!container) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('fixtures');
      if (!url) {
        container.innerHTML = '<p><em>Error: Invalid sheet configuration.</em></p>';
        return;
      }
      
      const data = await CsvLoader.load(url);
      
      // Only include rows where results exist
      const rows = data.filter(r =>
        r['Game Week'] && r['Player A'] && r['Player B'] &&
        r['Result'] && r['Result'].trim() !== ''
      );
      
      if (rows.length === 0) {
        container.innerHTML = '<p><em>No results available yet.</em></p>';
        return;
      }
      
      // Group by game week
      const { grouped, orderedWeeks } = this.groupByGameWeek(rows);
      
      // Render
      this.renderGroups(container, grouped, orderedWeeks);
    } catch (error) {
      console.error('Failed to load results:', error);
      container.innerHTML = '<p><em>Error loading results.</em></p>';
    }
  },
  
  groupByGameWeek: function(results) {
    const grouped = {};
    const orderedWeeks = [];
    
    results.forEach(r => {
      const week = r['Game Week'].trim();
      if (!grouped[week]) {
        grouped[week] = [];
        orderedWeeks.push(week);
      }
      grouped[week].push(r);
    });
    
    return { grouped, orderedWeeks };
  },
  
  renderGroups: function(container, grouped, orderedWeeks) {
    orderedWeeks.forEach(week => {
      const h3 = document.createElement('h3');
      const num = parseInt(week);
      h3.textContent = isNaN(num)
        ? (this.KO_LABELS[week] || week)
        : `Game Week ${week}`;
      h3.style.marginTop = '1.5em';
      h3.style.marginBottom = '0.5em';
      h3.style.fontWeight = 'bold';
      h3.style.textAlign = 'center';
      container.appendChild(h3);
      
      // Render each result in order
      grouped[week].forEach(match => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.gap = '0.5em';
        div.style.margin = '0.3em 0';
        div.style.fontSize = '1.05em';
        
        const resultStr = match['Result'].trim();
        const [aScore, bScore] = resultStr.split('-').map(s => parseInt(s.trim(), 10));
        
        const playerA = document.createElement('span');
        playerA.textContent = match['Player A'];
        playerA.style.flex = '1';
        playerA.style.textAlign = 'right';
        if (aScore > bScore) playerA.style.fontWeight = 'bold';
        
        const result = document.createElement('span');
        result.textContent = `[${resultStr}]`;
        result.style.flex = '0 0 auto';
        result.style.fontWeight = 'bold';
        result.style.minWidth = '3.5em';
        result.style.textAlign = 'center';
        
        const playerB = document.createElement('span');
        playerB.textContent = match['Player B'];
        playerB.style.flex = '1';
        playerB.style.textAlign = 'left';
        if (bScore > aScore) playerB.style.fontWeight = 'bold';
        
        div.appendChild(playerA);
        div.appendChild(result);
        div.appendChild(playerB);
        container.appendChild(div);
      });
    });
  }
};