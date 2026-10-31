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

  loadStandings: async function (params) {
    const root = document.getElementById('leagues-standings-root');
    try {
      var apiParams = params || (typeof CurrentCompetition !== 'undefined'
        ? CurrentCompetition.apiParams()
        : { competitionType: 'league' });
      const result = await ApiClient.get(
        Object.assign({ action: 'getStandings' }, apiParams)
      );
      const groups = (result.groups || []).filter(function (grp) {
        return String(grp.groupId) !== 'ko';
      });

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
      wrapper.setAttribute('data-help', 'leagues.group');
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
    });
  },
};
