// Fixtures Page - Upcoming Fixtures

const FixturesPage = {
  KO_LABELS: {
    'CS': 'Championship Semis',
    'CF': 'Championship Final',
    'PQ': 'Plate Quarters',
    'PS': 'Plate Semis',
    'PF': 'Plate Final'
  },
  
  init: async function() {
    const container = document.getElementById('fixtures-list');
    if (!container) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('fixtures');
      if (!url) {
        container.innerHTML = '<p><em>Error: Invalid sheet configuration.</em></p>';
        return;
      }
      
      const data = await CsvLoader.load(url);
      
      // Filter to upcoming fixtures (no result)
      const upcoming = data.filter(r =>
        r['Game Week'] && r['Player A'] && r['Player B'] &&
        (!r['Result'] || r['Result'].trim() === '')
      );
      
      if (upcoming.length === 0) {
        container.innerHTML = '<p><em>No upcoming fixtures found.</em></p>';
        return;
      }
      
      // Group by game week
      const { grouped, orderedWeeks } = this.groupByGameWeek(upcoming);
      
      // Render
      this.renderGroups(container, grouped, orderedWeeks);
    } catch (error) {
      console.error('Failed to load fixtures:', error);
      container.innerHTML = '<p><em>Error loading fixtures.</em></p>';
    }
  },
  
  groupByGameWeek: function(fixtures) {
    const grouped = {};
    const orderedWeeks = [];
    
    fixtures.forEach(f => {
      const week = f['Game Week'].trim();
      if (!grouped[week]) {
        grouped[week] = [];
        orderedWeeks.push(week);
      }
      grouped[week].push(f);
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
      
      grouped[week].forEach(match => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.gap = '1em';
        div.style.margin = '0.3em 0';
        div.style.fontSize = '1.05em';
        
        const playerA = document.createElement('span');
        playerA.textContent = match['Player A'];
        playerA.style.flex = '1';
        playerA.style.textAlign = 'right';
        
        const vs = document.createElement('span');
        vs.textContent = 'V';
        vs.style.flex = '0 0 auto';
        vs.style.fontWeight = 'bold';
        vs.style.minWidth = '1.5em';
        vs.style.textAlign = 'center';
        
        const playerB = document.createElement('span');
        playerB.textContent = match['Player B'];
        playerB.style.flex = '1';
        playerB.style.textAlign = 'left';
        
        div.appendChild(playerA);
        div.appendChild(vs);
        div.appendChild(playerB);
        container.appendChild(div);
      });
    });
  }
};