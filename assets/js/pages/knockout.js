// Knockout bracket page — horizontal round columns with bracket connectors.

var KnockoutPage = {
  init: function () {
    var root = document.getElementById('knockout-bracket');
    if (!root) return;

    var self = this;
    CurrentCompetition.whenReady(function () {
      if (CurrentCompetition.isLeague()) {
        window.location.replace('leagues.html' + (window.location.search || ''));
        return;
      }
      self.render().catch(function (e) {
        console.error(e);
        root.innerHTML = '<p class="align-center"><em>Error loading knockout draw.</em></p>';
      });
    });

    window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
      if (CurrentCompetition.isLeague()) {
        window.location.replace('leagues.html' + (window.location.search || ''));
        return;
      }
      self.render().catch(function (e) {
        console.error(e);
      });
    });
  },

  render: async function () {
    var root = document.getElementById('knockout-bracket');
    if (!root) return;

    root.innerHTML = '<p class="align-center"><em>Loading…</em></p>';

    var result = await ApiClient.get(
      Object.assign({ action: 'getFixtures' }, CurrentCompetition.apiParams())
    );
    var fixtures = (result.fixtures || []).filter(function (f) {
      return f['Player A'] && f['Player B'];
    });

    if (typeof KnockoutBracket === 'undefined') {
      root.innerHTML = '<p class="align-center"><em>Bracket viewer unavailable.</em></p>';
      return;
    }

    KnockoutBracket.render(root, fixtures);
  },
};
