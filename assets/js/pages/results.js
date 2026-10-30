// Results Page — match results; admin can edit via same dialog as Fixtures

var ResultsPage = {
  KO_LABELS: {
    CS: 'Championship Semis',
    CF: 'Championship Final',
    PQ: 'Plate Quarters',
    PS: 'Plate Semis',
    PF: 'Plate Final',
  },

  _listenersBound: false,

  adminModeEvent: function () {
    return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
  },

  isAdmin: function () {
    return typeof AdminMode !== 'undefined' && AdminMode.isUnlocked();
  },

  fixtureGroup: function (row) {
    return String(row['Group'] || row['League'] || '').trim();
  },

  highlightSelectedLeague: function () {
    var selected = document.querySelector('input[name="league"]:checked');
    if (!selected) return;
    document.querySelectorAll('.league-label').forEach(function (label) {
      var input = label.querySelector('input[name="league"]');
      if (input && input.value === selected.value) {
        label.style.fontWeight = 'bold';
        label.style.border = '3px solid green';
        label.style.borderRadius = '4px';
      } else {
        label.style.fontWeight = 'normal';
        label.style.border = '1px solid transparent';
      }
    });
  },

  selectedLeague: function () {
    if (typeof LeagueGroupFilter !== 'undefined') return LeagueGroupFilter.selected();
    var el = document.querySelector('input[name="league"]:checked');
    return el ? el.value : 'All';
  },

  refreshAndLoad: async function () {
    if (typeof LeagueGroupFilter !== 'undefined') await LeagueGroupFilter.sync();
    return this.loadResults();
  },

  init: async function () {
    var container = document.getElementById('results-list');
    if (!container) return;

    var self = this;

    if (!this._listenersBound) {
      this._listenersBound = true;
      window.addEventListener(this.adminModeEvent(), function () {
        self.init().catch(function (e) {
          console.error(e);
        });
      });
      window.addEventListener(
        typeof PlayerSession !== 'undefined' ? PlayerSession.EVENT_NAME : 'ierne-player-session-changed',
        function () {
          self.init().catch(function (e) {
            console.error(e);
          });
        }
      );

      if (typeof CurrentCompetition !== 'undefined') {
        if (typeof NavCompetition !== 'undefined') {
          NavCompetition.syncLeagueFiltersFromSession();
        }
        window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
          self.refreshAndLoad().catch(function (e) {
            console.error(e);
          });
        });
      }

      if (typeof FixturesPage !== 'undefined' && FixturesPage.RESULT_SAVED_EVENT) {
        window.addEventListener(FixturesPage.RESULT_SAVED_EVENT, function () {
          self.init().catch(function (e) {
            console.error(e);
          });
        });
      }

      if (typeof LeagueGroupFilter !== 'undefined') {
        LeagueGroupFilter.bindChange(function () {
          self.loadResults().catch(function (e) {
            console.error(e);
          });
        });
      }
    }

    if (typeof FixturesPage !== 'undefined') {
      FixturesPage.bindResultDialog();
    }

    if (typeof CurrentCompetition !== 'undefined') {
      await CurrentCompetition.whenReady(function () {
        return self.refreshAndLoad();
      });
    } else {
      await this.loadResults();
    }
  },

  loadResults: async function () {
    var container = document.getElementById('results-list');
    if (!container) return;

    try {
      var params = { action: 'getFixtures' };
      if (typeof CurrentCompetition !== 'undefined') {
        Object.assign(params, CurrentCompetition.apiParams());
      } else {
        params.competitionType = 'league';
      }
      var result = await ApiClient.get(params);
      var data = result.fixtures || [];

      var isKnockout =
        typeof CurrentCompetition !== 'undefined' && CurrentCompetition.isKnockout();
      if (typeof NavCompetition !== 'undefined') {
        NavCompetition.syncLeagueFilters(isKnockout);
      }
      var group = this.selectedLeague();

      var rows = data.filter(function (r) {
        var has =
          r['Game Week'] &&
          r['Player A'] &&
          r['Player B'] &&
          r['Result'] &&
          String(r['Result']).trim() !== '';
        if (!has) return false;
        if (!isKnockout) {
          var stage = String(r.Stage || '').toLowerCase();
          if (stage === 'knockout') return false;
        }
        if (group === 'All') return true;
        return ResultsPage.fixtureGroup(r) === group;
      });

      if (rows.length === 0) {
        container.innerHTML = '<p><em>No results available yet.</em></p>';
        return;
      }

      var winnersByCode = {};
      var sectionLabels = null;
      var groupedWeeks;
      if (isKnockout && typeof KnockoutRounds !== 'undefined') {
        winnersByCode = KnockoutRounds.buildRoundWinnersMap(data);
        var winnerIdsByCode = KnockoutRounds.buildRoundWinnerIdsMap
          ? KnockoutRounds.buildRoundWinnerIdsMap(data)
          : {};
        var koGroup = KnockoutRounds.groupForList(rows);
        groupedWeeks = { grouped: koGroup.grouped, orderedWeeks: koGroup.orderedKeys };
        sectionLabels = koGroup.labels;
      } else {
        groupedWeeks = this.groupByGameWeek(rows);
      }

      this.renderGroups(container, groupedWeeks.grouped, groupedWeeks.orderedWeeks, {
        isKnockout: isKnockout,
        winnersByCode: winnersByCode,
        winnerIdsByCode: typeof winnerIdsByCode !== 'undefined' ? winnerIdsByCode : {},
        sectionLabels: sectionLabels,
      });
    } catch (error) {
      console.error('Failed to load results:', error);
      container.innerHTML = '<p><em>Error loading results.</em></p>';
    }
  },

  groupByGameWeek: function (results) {
    var grouped = {};
    var orderedWeeks = [];

    results.forEach(function (r) {
      var week = String(r['Game Week']).trim();
      if (!grouped[week]) {
        grouped[week] = [];
        orderedWeeks.push(week);
      }
      grouped[week].push(r);
    });

    return { grouped: grouped, orderedWeeks: orderedWeeks };
  },

  knockoutWeekLabel: function (week) {
    if (typeof KnockoutRounds !== 'undefined') {
      return KnockoutRounds.labelFor(week);
    }
    return this.KO_LABELS[week] || week;
  },

  knockoutPlayerLabel: function (match, slot, winnersByCode) {
    if (typeof KnockoutRounds !== 'undefined') {
      return KnockoutRounds.resolvedPlayerName(match, slot, winnersByCode);
    }
    return slot === 'a' ? match['Player A'] || '' : match['Player B'] || '';
  },

  renderGroups: function (container, grouped, orderedWeeks, options) {
    var self = this;
    options = options || {};
    var isKnockout = !!options.isKnockout;
    var winnersByCode = options.winnersByCode || {};
    container.innerHTML = '';

    orderedWeeks.forEach(function (week) {
      var h3 = document.createElement('h3');
      var num = parseInt(week, 10);
      h3.textContent =
        isKnockout && options.sectionLabels
          ? options.sectionLabels[week] || self.knockoutWeekLabel(week)
          : isKnockout
            ? self.knockoutWeekLabel(week)
            : isNaN(num)
              ? self.KO_LABELS[week] || week
              : 'Game Week ' + week;
      h3.style.marginTop = '1.5em';
      h3.style.marginBottom = '0.5em';
      h3.style.fontWeight = 'bold';
      h3.style.textAlign = 'center';
      container.appendChild(h3);

      grouped[week].forEach(function (match) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.gap = '0.5em';
        div.style.margin = '0.3em 0';
        div.style.fontSize = '1.05em';

        var fid = String(match.fixtureId || '').trim();
        var slotA = String(match.playerAId || '').trim();
        var slotB = String(match.playerBId || '').trim();
        var pidA = slotA;
        var pidB = slotB;
        if (
          isKnockout &&
          typeof KnockoutRounds !== 'undefined' &&
          KnockoutRounds.resolvedPlayerId
        ) {
          pidA = KnockoutRounds.resolvedPlayerId(match, 'a', options.winnerIdsByCode) || slotA;
          pidB = KnockoutRounds.resolvedPlayerId(match, 'b', options.winnerIdsByCode) || slotB;
        }
        div.setAttribute('data-fixture-id', fid);
        div.setAttribute('data-player-a-id', pidA);
        div.setAttribute('data-player-b-id', pidB);
        var nameA = self.knockoutPlayerLabel(match, 'a', winnersByCode);
        var nameB = self.knockoutPlayerLabel(match, 'b', winnersByCode);
        if (!isKnockout) {
          nameA = match['Player A'] || '';
          nameB = match['Player B'] || '';
        }
        div.setAttribute('data-player-a-name', nameA);
        div.setAttribute('data-player-b-name', nameB);
        div.setAttribute('data-match-date', match['Match Date'] || '');
        div.setAttribute('data-result-posted-at', match.resultPostedAt || '');
        div.setAttribute(
          'data-best-of',
          String(
            typeof FixturesPage !== 'undefined' && FixturesPage.normalizeBestOf
              ? FixturesPage.normalizeBestOf(match.bestOf)
              : match.bestOf || 3
          )
        );
        var enteredBy = String(match.resultEnteredBy || '').trim();
        if (enteredBy) div.setAttribute('data-result-entered-by', enteredBy);
        div.setAttribute('data-had-result', '1');

        var sa = match.scoreA != null && match.scoreA !== '' ? Number(match.scoreA) : 0;
        var sb = match.scoreB != null && match.scoreB !== '' ? Number(match.scoreB) : 0;
        if (!Number.isFinite(sa)) sa = 0;
        if (!Number.isFinite(sb)) sb = 0;
        div.setAttribute('data-prefill-score-a', String(sa));
        div.setAttribute('data-prefill-score-b', String(sb));

        var resultStr = String(match['Result']).trim();
        var parts = resultStr.split('-');
        var aScore = parseInt(parts[0] ? parts[0].trim() : '', 10);
        var bScore = parseInt(parts[1] ? parts[1].trim() : '', 10);

        var matchDate = match['Match Date'] || '';
        var playerA =
          typeof FixturesPage !== 'undefined' && FixturesPage.makePlayerNameEl
            ? FixturesPage.makePlayerNameEl(nameA, pidA, matchDate, 'right')
            : (function () {
                var el = document.createElement('span');
                el.textContent = nameA;
                el.style.flex = '1';
                el.style.textAlign = 'right';
                return el;
              })();
        if (!isNaN(aScore) && !isNaN(bScore) && aScore > bScore) playerA.style.fontWeight = 'bold';

        var resultEl;
        var canEdit =
          typeof FixturesPage !== 'undefined' &&
          FixturesPage.canEditFixture &&
          FixturesPage.canEditFixture(slotA, slotB, match.resultPostedAt || '');
        if (canEdit && fid) {
          resultEl = document.createElement('button');
          resultEl.type = 'button';
          resultEl.className = 'results-score-btn';
          resultEl.textContent = '[' + resultStr + ']';
          resultEl.setAttribute(
            'aria-label',
            'Edit result ' +
              resultStr +
              ': ' +
              nameA +
              ' vs ' +
              nameB
          );
          resultEl.addEventListener('click', function () {
            FixturesPage.openResultDialog(div);
          });
        } else {
          resultEl = document.createElement('span');
          resultEl.textContent = '[' + resultStr + ']';
          resultEl.style.flex = '0 0 auto';
          resultEl.style.fontWeight = 'bold';
          resultEl.style.minWidth = '3.5em';
          resultEl.style.textAlign = 'center';
        }
        resultEl.style.flex = '0 0 auto';
        resultEl.style.fontWeight = 'bold';
        resultEl.style.minWidth = '3.5em';
        resultEl.style.textAlign = 'center';

        var playerB =
          typeof FixturesPage !== 'undefined' && FixturesPage.makePlayerNameEl
            ? FixturesPage.makePlayerNameEl(nameB, pidB, matchDate, 'left')
            : (function () {
                var el = document.createElement('span');
                el.textContent = nameB;
                el.style.flex = '1';
                el.style.textAlign = 'left';
                return el;
              })();
        if (!isNaN(aScore) && !isNaN(bScore) && bScore > aScore) playerB.style.fontWeight = 'bold';

        var wrap = document.createElement('div');
        wrap.className = 'fixture-row-wrap';
        div.appendChild(playerA);
        div.appendChild(resultEl);
        div.appendChild(playerB);
        wrap.appendChild(div);
        if (enteredBy) {
          var byLine = document.createElement('p');
          byLine.className = 'fixture-entered-by';
          byLine.textContent =
            typeof FixturesPage !== 'undefined' && FixturesPage.formatEnteredByLabel
              ? FixturesPage.formatEnteredByLabel(enteredBy)
              : 'Entered by ' + enteredBy;
          wrap.appendChild(byLine);
        }
        container.appendChild(wrap);
      });
    });
  },
};
