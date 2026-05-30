// Top Breaks Page - leaderboard of biggest breaks in the current season

const TopBreaksPage = {
  init: async function() {
    const list = document.getElementById('topBreaksList');
    if (!list) return;
    const seasonLabel = document.getElementById('topBreaksSeason');

    try {
      const [compsResult, result] = await Promise.all([
        ApiClient.get({ action: 'getCompetitions' }),
        ApiClient.get({ action: 'getTopBreaks', competitionType: 'league' }),
      ]);
      const breaks = Array.isArray(result.breaks) ? result.breaks : [];

      const currentLeague = (compsResult.competitions || []).find(function (c) {
        return c.isCurrent && c.competitionType === 'league';
      });
      if (seasonLabel && currentLeague) {
        seasonLabel.textContent = currentLeague.name || currentLeague.compId;
      }

      list.innerHTML = '';

      if (breaks.length === 0) {
        const li = document.createElement('li');
        li.className = 'top-breaks-list__empty';
        li.textContent = 'No breaks recorded yet this season.';
        list.appendChild(li);
        return;
      }

      breaks.forEach(function(b) {
        const li = document.createElement('li');
        li.className = 'top-breaks-list__item';
        const value = document.createElement('span');
        value.className = 'top-breaks-list__value';
        value.textContent = b['Break'];
        const meta = document.createElement('span');
        meta.className = 'top-breaks-list__meta';
        const parts = [b['Player Name']];
        const ctx = [];
        if (b['Group']) ctx.push('Group ' + b['Group']);
        if (b['Round']) ctx.push('Round ' + b['Round']);
        if (b['Opponent']) ctx.push('vs ' + b['Opponent']);
        if (ctx.length) parts.push('(' + ctx.join(', ') + ')');
        meta.textContent = parts.join(' ');
        li.appendChild(value);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(meta);
        list.appendChild(li);
      });
    } catch (error) {
      console.error('Failed to load top breaks:', error);
      list.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'top-breaks-list__empty';
      li.textContent = 'Could not load top breaks. Please try again later.';
      list.appendChild(li);
    }
  }
};
