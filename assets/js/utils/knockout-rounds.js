// Knockout round codes, display labels, and sort order for fixtures UI.

var KnockoutRounds = (function () {
  var WINNER_OF_PREFIX = 'wo:';

  var ROUNDS = [
    { code: 'PO1', label: 'Play-off 1', sortKey: 1 },
    { code: 'PO2', label: 'Play-off 2', sortKey: 2 },
    { code: 'PO3', label: 'Play-off 3', sortKey: 3 },
    { code: 'PO4', label: 'Play-off 4', sortKey: 4 },
    { code: 'QF1', label: 'Quarter-final 1', sortKey: 5 },
    { code: 'QF2', label: 'Quarter-final 2', sortKey: 6 },
    { code: 'QF3', label: 'Quarter-final 3', sortKey: 7 },
    { code: 'QF4', label: 'Quarter-final 4', sortKey: 8 },
    { code: 'SF1', label: 'Semi-final 1', sortKey: 9 },
    { code: 'SF2', label: 'Semi-final 2', sortKey: 10 },
    { code: 'F', label: 'Final', sortKey: 11 },
    { code: 'PQ', label: 'Plate Quarters', sortKey: 20 },
    { code: 'PS', label: 'Plate Semis', sortKey: 21 },
    { code: 'PF', label: 'Plate Final', sortKey: 22 },
    { code: 'CS', label: 'Championship Semis', sortKey: 23 },
    { code: 'CF', label: 'Championship Final', sortKey: 24 },
    { code: 'KO Pre-16', label: 'Preliminary', sortKey: 101 },
    { code: 'KO Last 16', label: 'Last 16', sortKey: 102 },
    { code: 'KO Last 8', label: 'Quarter-finals', sortKey: 103 },
    { code: 'KO Last 4', label: 'Semi-finals', sortKey: 104 },
    { code: 'KO Last 2', label: 'Final', sortKey: 105 },
  ];

  var byCode = {};
  ROUNDS.forEach(function (r) {
    byCode[r.code] = r;
  });

  var KO_BASE_SORT = 10000;

  function parseMatchScores(match) {
    var hasResult = match['Result'] && String(match['Result']).trim() !== '';
    var scoreA = match.scoreA;
    var scoreB = match.scoreB;
    if (hasResult) {
      var parts = String(match['Result']).trim().split('-');
      scoreA = parseInt(parts[0], 10);
      scoreB = parseInt(parts[1], 10);
    }
    if (!Number.isFinite(scoreA)) scoreA = null;
    if (!Number.isFinite(scoreB)) scoreB = null;
    return { hasResult: hasResult, scoreA: scoreA, scoreB: scoreB };
  }

  return {
    all: function () {
      return ROUNDS.slice();
    },

    labelFor: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';
      if (byCode[c]) return byCode[c].label;
      var koLast = c.match(/^KO Last (\d+)$/i);
      if (koLast) {
        var n = parseInt(koLast[1], 10);
        if (n === 2) return 'Final';
        if (n === 4) return 'Semi-finals';
        if (n === 8) return 'Quarter-finals';
        if (n === 16) return 'Last 16';
        return 'Last ' + n;
      }
      if (/^KO Pre-/i.test(c)) return 'Preliminary';
      return c;
    },

    sortKeyFor: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (byCode[c]) return byCode[c].sortKey;
      var koLast = c.match(/^KO Last (\d+)$/i);
      if (koLast) {
        var n = parseInt(koLast[1], 10);
        if (n === 2) return 105;
        if (n === 4) return 104;
        if (n === 8) return 103;
        if (n === 16) return 102;
        return 100 + Math.log2(n);
      }
      if (/^KO Pre-/i.test(c)) return 101;
      return 999 + c.charCodeAt(0);
    },

    sortOrderFor: function (code) {
      return KO_BASE_SORT + this.sortKeyFor(code);
    },

    isKnownCode: function (code) {
      return !!byCode[String(code == null ? '' : code).trim()];
    },

    winnerOfPlayerId: function (roundCode) {
      return WINNER_OF_PREFIX + String(roundCode == null ? '' : roundCode).trim();
    },

    isWinnerOfPlayerId: function (playerId) {
      return String(playerId == null ? '' : playerId).indexOf(WINNER_OF_PREFIX) === 0;
    },

    roundCodeFromWinnerOfId: function (playerId) {
      if (!this.isWinnerOfPlayerId(playerId)) return '';
      return String(playerId).slice(WINNER_OF_PREFIX.length);
    },

    winnerOfDisplayLabel: function (roundCode) {
      var label = this.labelFor(roundCode);
      var base = label || String(roundCode || '').trim();
      return base ? base + ' Winner' : 'Winner';
    },

    /**
     * Display name for a fixture slot, substituting the real winner when the feeder round has a result.
     * @param {Object} match
     * @param {'a'|'b'} slot
     * @param {Object.<string,string>} [winnersByCode]
     */
    resolvedPlayerName: function (match, slot, winnersByCode) {
      winnersByCode = winnersByCode || {};
      var isA = slot !== 'b';
      var id = isA ? match.playerAId : match.playerBId;
      var fallback = (isA ? match['Player A'] : match['Player B']) || 'TBD';
      if (this.isWinnerOfPlayerId(id)) {
        var code = this.roundCodeFromWinnerOfId(id);
        if (code && winnersByCode[code]) return winnersByCode[code];
      }
      return fallback;
    },

    /**
     * Map round code → winner name for completed knockout fixtures (earliest rounds first).
     */
    buildRoundWinnersMap: function (fixtures) {
      var self = this;
      var winners = {};
      var list = (fixtures || []).slice().sort(function (a, b) {
        var diff =
          self.sortKeyFor(a['Game Week']) - self.sortKeyFor(b['Game Week']);
        if (diff !== 0) return diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });

      list.forEach(function (match) {
        var code = String(match['Game Week'] || '').trim();
        if (!code) return;
        var sc = parseMatchScores(match);
        if (!sc.hasResult || sc.scoreA == null || sc.scoreB == null) return;
        if (sc.scoreA === sc.scoreB) return;
        var slot = sc.scoreA > sc.scoreB ? 'a' : 'b';
        var name = self.resolvedPlayerName(match, slot, winners);
        if (name && name !== 'TBD') winners[code] = name;
      });

      return winners;
    },

    /**
     * Stage key for bracket columns (SF1 + SF2 → same stage).
     */
    stageKeyFor: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';
      var prefixed = c.match(/^(PO|QF|SF)(\d+)$/i);
      if (prefixed) return prefixed[1].toUpperCase();
      var koLast = c.match(/^KO Last (\d+)$/i);
      if (koLast) {
        var n = parseInt(koLast[1], 10);
        if (n === 2) return 'KO-FINAL';
        if (n === 4) return 'KO-SEMI';
        if (n === 8) return 'KO-QF';
        if (n === 16) return 'KO-L16';
        return 'KO-LAST-' + n;
      }
      if (/^KO Pre-/i.test(c)) return 'KO-PRELIM';
      return c;
    },

    stageLabelFor: function (code) {
      var key = this.stageKeyFor(code);
      var labels = {
        PO: 'Play-offs',
        QF: 'Quarter-finals',
        SF: 'Semi-finals',
        'KO-PRELIM': 'Preliminary',
        'KO-L16': 'Last 16',
        'KO-QF': 'Quarter-finals',
        'KO-SEMI': 'Semi-finals',
        'KO-FINAL': 'Final',
      };
      if (labels[key]) return labels[key];
      return this.labelFor(code);
    },

    stageSortKeyFor: function (code) {
      var key = this.stageKeyFor(code);
      var keys = {
        PO: 5,
        QF: 9,
        SF: 11,
        'KO-PRELIM': 101,
        'KO-L16': 102,
        'KO-QF': 103,
        'KO-SEMI': 104,
        'KO-FINAL': 105,
      };
      if (keys[key] != null) return keys[key];
      return this.sortKeyFor(code);
    },

    /**
     * Group fixtures by knockout stage (one column per stage, all matches listed vertically).
     */
    groupFixturesByStage: function (fixtures, descending) {
      var stages = {};
      (fixtures || []).forEach(function (f) {
        var code = String(f['Game Week'] || '').trim();
        if (!code || !f['Player A'] || !f['Player B']) return;
        var sk = KnockoutRounds.stageKeyFor(code);
        if (!stages[sk]) {
          stages[sk] = {
            stageKey: sk,
            label: KnockoutRounds.stageLabelFor(code),
            codes: [],
            matches: [],
            sortKey: KnockoutRounds.stageSortKeyFor(code),
          };
        }
        if (stages[sk].codes.indexOf(code) < 0) stages[sk].codes.push(code);
        stages[sk].matches.push(f);
        stages[sk].sortKey = Math.min(stages[sk].sortKey, KnockoutRounds.stageSortKeyFor(code));
      });

      Object.keys(stages).forEach(function (sk) {
        stages[sk].matches.sort(function (a, b) {
          var ca = KnockoutRounds.sortKeyFor(a['Game Week']);
          var cb = KnockoutRounds.sortKeyFor(b['Game Week']);
          if (ca !== cb) return ca - cb;
          return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        });
      });

      var list = Object.keys(stages).map(function (sk) {
        return stages[sk];
      });
      list.sort(function (a, b) {
        var diff = a.sortKey - b.sortKey;
        return descending ? -diff : diff;
      });
      return list;
    },

    /**
     * Group fixtures by round code.
     * @param {Array} fixtures
     * @param {boolean} descending - true = latest round first (Final before QFs)
     * @returns {Array<{code:string,label:string,matches:Array}>}
     */
    groupFixtures: function (fixtures, descending) {
      var grouped = {};
      (fixtures || []).forEach(function (f) {
        var code = String(f['Game Week'] || '').trim();
        if (!code || !f['Player A'] || !f['Player B']) return;
        if (!grouped[code]) grouped[code] = [];
        grouped[code].push(f);
      });
      var codes = Object.keys(grouped).sort(function (a, b) {
        var diff = KnockoutRounds.sortKeyFor(a) - KnockoutRounds.sortKeyFor(b);
        return descending ? -diff : diff;
      });
      return codes.map(function (code) {
        return {
          code: code,
          label: KnockoutRounds.labelFor(code),
          matches: grouped[code],
        };
      });
    },
  };
})();
