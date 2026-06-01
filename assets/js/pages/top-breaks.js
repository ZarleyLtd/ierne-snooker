// Top Breaks Page - leaderboard of biggest breaks in the current season

const TopBreaksPage = {
  load: async function () {
    const list = document.getElementById('topBreaksList');
    if (!list) return;
    const seasonLabel = document.getElementById('topBreaksSeason');

    try {
      var params = { action: 'getTopBreaks', limit: '20' };
      if (typeof CurrentCompetition !== 'undefined') {
        Object.assign(params, CurrentCompetition.apiParams());
      } else {
        params.competitionType = 'league';
      }
      const result = await ApiClient.get(params);
      const breaks = Array.isArray(result.breaks) ? result.breaks : [];

      if (seasonLabel) {
        if (typeof CurrentCompetition !== 'undefined' && CurrentCompetition.get()) {
          seasonLabel.textContent = CurrentCompetition.get().name || CurrentCompetition.get().compId;
        } else {
          seasonLabel.textContent = result.compId || 'current';
        }
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
  },

  init: async function () {
    const list = document.getElementById('topBreaksList');
    if (!list) return;

    if (typeof CurrentCompetition !== 'undefined') {
      window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
        TopBreaksPage.load().catch(function (e) {
          console.error(e);
        });
      });
      await CurrentCompetition.whenReady(function () {
        return TopBreaksPage.load();
      });
    } else {
      await TopBreaksPage.load();
    }
  },
};
