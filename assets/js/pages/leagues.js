// Leagues Page - standings for the selected current league competition

const LeaguesPage = {
  init: async function () {
    const hasLeagueContainers =
      document.getElementById('league-one') || document.getElementById('league-two');

    if (!hasLeagueContainers) return;

    const self = this;

    if (typeof CurrentCompetition === 'undefined') {
      return this.loadStandings({ competitionType: 'league' });
    }

    window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
      if (CurrentCompetition.isKnockout()) {
        window.location.replace('knockout.html' + (window.location.search || ''));
        return;
      }
      self.loadStandings().catch(function (e) {
        console.error(e);
      });
    });

    await CurrentCompetition.whenReady(function () {
      if (CurrentCompetition.isKnockout()) {
        window.location.replace('knockout.html' + (window.location.search || ''));
        return;
      }
      return self.loadStandings();
    });
  },

  loadStandings: async function (params) {
    try {
      var apiParams = params || (typeof CurrentCompetition !== 'undefined'
        ? CurrentCompetition.apiParams()
        : { competitionType: 'league' });
      const result = await ApiClient.get(
        Object.assign({ action: 'getStandings' }, apiParams)
      );
      const groups = result.groups || [];
      const containerIds = ['league-one', 'league-two'];
      const wrappers = document.querySelectorAll('.standings-wrapper');

      groups.forEach(function (grp, idx) {
        const containerId = containerIds[idx];
        if (!containerId) return;

        if (wrappers[idx]) {
          const heading = wrappers[idx].querySelector('.standings-heading');
          if (heading && grp.name) heading.textContent = grp.name;
        }

        const sorted = LeagueStandings.sort(grp.rows || []);
        LeagueStandings.render(containerId, sorted);
      });

      for (let i = groups.length; i < containerIds.length; i++) {
        LeagueStandings.render(containerIds[i], []);
      }
    } catch (error) {
      console.error('Failed to load league standings:', error);
    }
  },
};
