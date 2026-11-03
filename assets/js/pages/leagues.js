// Leagues Page - standings for the selected current league competition

const LeaguesPage = {
  init: async function () {
    const hasLeagueContainers =
      document.getElementById('leagues-standings-root') ||
      document.getElementById('league-one') ||
      document.getElementById('league-two');

    if (!hasLeagueContainers) return;

    const self = this;

    if (typeof CurrentCompetition === 'undefined') {
      return this.loadStandings({ competitionType: 'league' });
    }

    window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
      self.loadStandings().catch(function (e) {
        console.error(e);
      });
    });

    await CurrentCompetition.whenReady(function () {
      return self.loadStandings();
    });
  },

  /** Standings always belong to a league, even when now-showing is a knockout. */
  leagueApiParams: function () {
    if (typeof CurrentCompetition === 'undefined') return { competitionType: 'league' };
    var comp = CurrentCompetition.get();
    if (comp && CurrentCompetition.isLeague && CurrentCompetition.isLeague()) {
      return { comp: comp.compId };
    }
    if (comp && CurrentCompetition.isLeagueKnockoutStage && CurrentCompetition.isLeagueKnockoutStage(comp)) {
      var parentId = String(comp.parentCompId || '').trim();
      if (parentId) return { comp: parentId };
    }
    var leagues = (CurrentCompetition.currentComps() || []).filter(function (c) {
      return c && CurrentCompetition.isKnockoutComp && !CurrentCompetition.isKnockoutComp(c);
    });
    if (leagues.length) return { comp: leagues[0].compId };
    return CurrentCompetition.apiParams();
  },

  loadStandings: async function (params) {
    const root = document.getElementById('leagues-standings-root');
    try {
      var apiParams = params || this.leagueApiParams();
      const result = await ApiClient.get(
        Object.assign({ action: 'getStandings' }, apiParams)
      );
      const groups = (result.groups || []).filter(function (grp) {
        return String(grp.groupId) !== 'ko';
      });

      var label = document.getElementById('page-competition-name');
      if (label && result.compId && typeof CurrentCompetition !== 'undefined' && CurrentCompetition.allComps) {
        var shown = (CurrentCompetition.allComps() || []).find(function (c) {
          return c && String(c.compId) === String(result.compId);
        });
        if (shown && shown.name) label.textContent = shown.name;
      }

      if (root) {
        this.renderGroups(root, groups);
        return;
      }

      const containerIds = ['league-one', 'league-two'];
      groups.forEach(function (grp, idx) {
        const containerId = containerIds[idx];
        if (!containerId) return;
        const sorted = LeagueStandings.sort(grp.rows || []);
        LeagueStandings.render(containerId, sorted);
      });
    } catch (error) {
      console.error('Failed to load league standings:', error);
      if (root) {
        root.innerHTML = '<p class="align-center"><em>Error loading standings.</em></p>';
      }
    }
  },

  renderGroups: function (root, groups) {
    root.innerHTML = '';
    if (!groups.length) {
      root.innerHTML = '<p class="align-center"><em>No groups for this competition.</em></p>';
      return;
    }
    groups.forEach(function (grp, idx) {
      const wrapper = document.createElement('div');
      wrapper.className = 'standings-wrapper';
      const heading = document.createElement('h3');
      heading.className = 'standings-heading';
      heading.textContent = grp.name || ('Group ' + (grp.groupId || ''));
      const pre = document.createElement('pre');
      pre.className = 'league-standings';
      pre.id = 'league-standings-' + idx;
      wrapper.appendChild(heading);
      wrapper.appendChild(pre);
      root.appendChild(wrapper);
      const sorted = LeagueStandings.sort(grp.rows || []);
      LeagueStandings.render(pre.id, sorted);
      if (sorted.some(function (player) { return player && player.unapproved; })) {
        const note = document.createElement('p');
        note.className = 'standings-pending-note';
        note.textContent = '* some results are pending approval';
        wrapper.appendChild(note);
      }
    });
  },
};
