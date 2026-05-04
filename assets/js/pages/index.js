// Home Page - Knockout Tournament Display

const IndexPage = {
  init: async function() {
    const hasKnockoutContainers = 
      document.getElementById('champ-semis') ||
      document.getElementById('champ-final') ||
      document.getElementById('plate-qf') ||
      document.getElementById('plate-sf') ||
      document.getElementById('plate-final');
    
    if (!hasKnockoutContainers) return;
    
    try {
      const url = SheetsConfig.getSheetUrl('fixtures');
      if (!url) {
        console.error('Invalid fixtures sheet URL');
        return;
      }
      
      const fixtures = await CsvLoader.load(url);
      
      const gameWeekMap = {
        'champ-semis': 'CS',
        'champ-final': 'CF',
        'plate-qf': 'PQ',
        'plate-sf': 'PS',
        'plate-final': 'PF'
      };
      
      Object.entries(gameWeekMap).forEach(([containerId, code]) => {
        const matches = KnockoutRenderer.filterByGameWeek(fixtures, code);
        KnockoutRenderer.render(containerId, matches);
      });
    } catch (error) {
      console.error('Failed to load knockout data:', error);
    }
  }
};