// Knockout Tournament Renderer Component
// Single source of truth for knockout display logic

const KnockoutRenderer = {
  /**
   * Render knockout matches in a container
   * @param {string} containerId - Element ID to render into
   * @param {Array} matches - Array of match data objects
   */
  render: function (containerId, matches, allFixtures) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (!matches || matches.length === 0) {
      container.textContent = '(No fixtures yet)';
      return;
    }

    const winnersByCode =
      typeof KnockoutRounds !== 'undefined' && KnockoutRounds.buildRoundWinnersMap
        ? KnockoutRounds.buildRoundWinnersMap(allFixtures || matches)
        : {};

    matches.forEach(function (match) {
      KnockoutRenderer.renderRow(container, match, winnersByCode);
    });
  },

  /**
   * Append one match row to a container element.
   * @param {HTMLElement} container
   * @param {Object} match
   */
  renderRow: function (container, match, winnersByCode) {
    if (!container || !match) return;

    const w = winnersByCode || {};
    const nameA =
      typeof KnockoutRounds !== 'undefined'
        ? KnockoutRounds.resolvedPlayerName(match, 'a', w)
        : match['Player A'] || '';
    const nameB =
      typeof KnockoutRounds !== 'undefined'
        ? KnockoutRounds.resolvedPlayerName(match, 'b', w)
        : match['Player B'] || '';

    const row = document.createElement('div');
    row.className = 'knockout-match-row';
    const hasResult = match['Result'] && String(match['Result']).trim() !== '';
    if (hasResult) row.classList.add('knockout-match-row--has-result');

    const playerA = document.createElement('span');
    playerA.className = 'knockout-match-row__player knockout-match-row__player--a';
    playerA.textContent = nameA;

    let centerText = 'V';
    if (hasResult) {
      centerText = '[' + String(match['Result']).trim() + ']';
    }
    const middle = document.createElement('span');
    middle.className = 'knockout-match-row__vs';
    middle.textContent = centerText;

    const playerB = document.createElement('span');
    playerB.className = 'knockout-match-row__player knockout-match-row__player--b';
    playerB.textContent = nameB;

    row.appendChild(playerA);
    row.appendChild(middle);
    row.appendChild(playerB);
    container.appendChild(row);
  },

  /**
   * Filter matches by game week code
   * @param {Array} fixtures - All fixtures
   * @param {string} gameWeekCode - Code like 'CS', 'CF', 'PQ', 'PS', 'PF'
   * @returns {Array} Filtered matches
   */
  filterByGameWeek: function (fixtures, gameWeekCode) {
    const gw = (r) => (r['Game Week'] || '').trim().toUpperCase();
    return fixtures.filter((r) => {
      const stage = String(r.Stage || '').toLowerCase();
      if (stage && stage !== 'knockout') return false;
      return gw(r) === gameWeekCode;
    });
  },
};
