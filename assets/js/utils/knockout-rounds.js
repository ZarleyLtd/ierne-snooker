// Knockout round codes, display labels, and sort order for fixtures UI.

var KnockoutRounds = (function () {
  var WINNER_OF_PREFIX = 'wo:';
  var LOSER_OF_PREFIX = 'lo:';

  var ADMIN_STAGES = [
    { id: 'L32', label: 'Round 1', matchCount: 16, sortKey: 1 },
    { id: 'L16', label: 'Round 2', matchCount: 8, sortKey: 2 },
    { id: 'QF', label: 'Quarter Final', matchCount: 4, sortKey: 3 },
    { id: 'SF', label: 'Semi Final', matchCount: 2, sortKey: 4 },
    { id: 'F', label: 'Final', matchCount: 1, sortKey: 5 },
    { id: 'CP', label: 'Custom Playoff', matchCount: 16, sortKey: 0, customName: true },
  ];

  // sortKey bands leave room for large fields (W1…Wn then WF; L1…Ln then LF/GF).
  var DE_ADMIN_STAGES = [
    { id: 'W1', label: 'Round 1', matchCount: 16, sortKey: 101 },
    { id: 'W2', label: 'Round 2', matchCount: 8, sortKey: 102 },
    { id: 'W3', label: 'Quarter Final', matchCount: 4, sortKey: 103 },
    { id: 'W4', label: 'Semi Final', matchCount: 2, sortKey: 104 },
    { id: 'WF', label: 'Winners Final', matchCount: 1, sortKey: 199 },
    { id: 'L1', label: 'Losers Round 1', matchCount: 16, sortKey: 201 },
    { id: 'L2', label: 'Losers Round 2', matchCount: 8, sortKey: 202 },
    { id: 'L3', label: 'Losers Round 3', matchCount: 4, sortKey: 203 },
    { id: 'L4', label: 'Losers Round 4', matchCount: 4, sortKey: 204 },
    { id: 'LF', label: 'Losers Final', matchCount: 1, sortKey: 299 },
    { id: 'GF', label: 'Grand Final', matchCount: 1, sortKey: 300 },
    { id: 'GF-R', label: 'Grand Final Reset', matchCount: 1, sortKey: 301 },
    { id: 'CP', label: 'Custom Playoff', matchCount: 16, sortKey: 0, customName: true },
  ];

  /** Display name from how many players are still in this round. */
  function labelFromPlayersRemaining(playersRemaining, earlyRoundNum, opts) {
    opts = opts || {};
    var plural = opts.plural !== false;
    if (playersRemaining === 8) return plural ? 'Quarter-finals' : 'Quarter Final';
    if (playersRemaining === 4) return plural ? 'Semi-finals' : 'Semi Final';
    if (playersRemaining === 2) {
      if (opts.finalLabel) return opts.finalLabel;
      return 'Final';
    }
    if (playersRemaining > 8 && earlyRoundNum) return 'Round ' + earlyRoundNum;
    return '';
  }

  function playersRemainingForStageKey(stageKey, matchCount) {
    var key = String(stageKey || '').trim().toUpperCase();
    if (key === 'L32') return 32;
    if (key === 'L16') return 16;
    if (key === 'QF' || key === 'PO') return 8;
    if (key === 'SF') return 4;
    if (key === 'F' || key === 'WF' || key === 'LF' || key === 'GF' || key === 'GF-R') {
      return 2;
    }
    if (/^W\d+$/i.test(key) || /^L\d+$/i.test(key)) {
      var mc = parseInt(matchCount, 10);
      if (Number.isFinite(mc) && mc > 0) return mc * 2;
    }
    return 0;
  }

  /** KO uses L16/L32; those numbers are ambiguous with DE losers rounds. */
  function isKoReservedLn(n) {
    return n === 16 || n === 32;
  }

  /**
   * Losers-bracket stage keys (L1, L2, …, LF).
   * L16/L32 are KO rounds unless opts.doubleElim (large DE can reach those numbers).
   */
  function isLosersStageKey(stageKey, opts) {
    var key = String(stageKey || '').trim().toUpperCase();
    if (key === 'LF') return true;
    var m = key.match(/^L(\d+)$/i);
    if (!m) return false;
    var n = parseInt(m[1], 10);
    if (isKoReservedLn(n)) return !!(opts && opts.doubleElim);
    return true;
  }

  /** True when fixtures include unambiguous DE codes (W*, WF, LF, GF, or L{n}≠16/32). */
  function fixturesLookLikeDoubleElim(fixtures) {
    return (fixtures || []).some(function (f) {
      var code = String(f['Game Week'] || '').trim();
      if (/^W\d+-/i.test(code) || code === 'WF' || code === 'LF') return true;
      if (code === 'GF' || code === 'GF-R') return true;
      var m = code.match(/^L(\d+)-\d+$/i);
      if (!m) return false;
      return !isKoReservedLn(parseInt(m[1], 10));
    });
  }

  function playersRemainingForStage(stage) {
    if (!stage) return 0;
    var fromKey = playersRemainingForStageKey(stage.stageKey);
    // Prefer canonical size for known keys (L32/L16/QF/SF/F) so byes don't skew names.
    if (fromKey > 0 && !/^W\d+$/i.test(stage.stageKey) && !isLosersStageKey(stage.stageKey)) {
      return fromKey;
    }
    if (stage.matches && stage.matches.length) return stage.matches.length * 2;
    if (fromKey > 0) return fromKey;
    return 0;
  }

  function applyNamedRoundLabels(stages, opts) {
    var earlyKeys = [];
    (stages || []).forEach(function (stage) {
      if (!stage || isLosersStageKey(stage.stageKey, opts)) return;
      var pr = playersRemainingForStage(stage);
      if (pr > 8) earlyKeys.push(stage.stageKey);
    });
    earlyKeys.sort(function (a, b) {
      var sa = (stages || []).find(function (s) {
        return s.stageKey === a;
      });
      var sb = (stages || []).find(function (s) {
        return s.stageKey === b;
      });
      return (sa && sa.sortKey) - (sb && sb.sortKey);
    });
    var earlyNum = {};
    earlyKeys.forEach(function (k, i) {
      earlyNum[k] = i + 1;
    });

    (stages || []).forEach(function (stage) {
      if (!stage) return;
      if (stage.stageKey === 'CP') return;
      if (isLosersStageKey(stage.stageKey, opts)) {
        if (stage.stageKey !== 'LF') {
          stage.label = 'Losers Round ' + String(stage.stageKey).slice(1);
        }
        return;
      }
      var pr = playersRemainingForStage(stage);
      var named = labelFromPlayersRemaining(pr, earlyNum[stage.stageKey], {
        plural: true,
        finalLabel:
          stage.stageKey === 'WF'
            ? 'Winners Final'
            : stage.stageKey === 'GF'
              ? 'Grand Final'
              : stage.stageKey === 'GF-R'
                ? 'Grand Final Reset'
                : 'Final',
      });
      if (named) stage.label = named;
    });
  }

  var LEGACY_ROUNDS = [
    { code: 'PO1', label: 'Play-off 1', sortKey: 1 },
    { code: 'PO2', label: 'Play-off 2', sortKey: 2 },
    { code: 'PO3', label: 'Play-off 3', sortKey: 3 },
    { code: 'PO4', label: 'Play-off 4', sortKey: 4 },
    { code: 'PQ', label: 'Plate Quarters', sortKey: 20 },
    { code: 'PS', label: 'Plate Semis', sortKey: 21 },
    { code: 'PF', label: 'Plate Final', sortKey: 22 },
    { code: 'CS', label: 'Championship Semis', sortKey: 23 },
    { code: 'CF', label: 'Championship Final', sortKey: 24 },
    { code: 'KO Pre-16', label: 'Preliminary', sortKey: 101 },
    { code: 'KO Last 16', label: 'Round 1', sortKey: 102 },
    { code: 'KO Last 8', label: 'Quarter-finals', sortKey: 103 },
    { code: 'KO Last 4', label: 'Semi-finals', sortKey: 104 },
    { code: 'KO Last 2', label: 'Final', sortKey: 105 },
    { code: 'F-P', label: 'Plate Final', sortKey: 15 },
    { code: 'F-C', label: 'Championship Final', sortKey: 16 },
  ];

  function codeForStageMatchInternal(stageId, matchNum) {
    var stage = String(stageId || '').trim();
    var n = parseInt(matchNum, 10);
    if (!stage || !Number.isFinite(n) || n < 1) return '';
    if (stage === 'F') return 'F';
    if (stage === 'SF') return 'SF' + n;
    if (stage === 'QF') return 'QF' + n;
    if (stage === 'L16') return 'L16-' + n;
    if (stage === 'L32') return 'L32-' + n;
    if (stage === 'CP') return 'CP-' + n;
    if (stage === 'WF' || stage === 'LF' || stage === 'GF' || stage === 'GF-R') return stage;
    if (/^W\d+$/i.test(stage) || /^L\d+$/i.test(stage)) return stage.toUpperCase() + '-' + n;
    return '';
  }

  function labelForCode(code, roundName) {
    var c = String(code == null ? '' : code).trim();
    if (!c) return '';
    var custom = String(roundName == null ? '' : roundName).trim();
    if (custom) {
      var cpMatch = c.match(/^CP-(\d+)$/i);
      if (cpMatch) return custom + ' — match ' + cpMatch[1];
      return custom;
    }
    if (byCode[c]) return byCode[c].label;

    var l32 = c.match(/^L32-(\d+)$/i);
    if (l32) return 'Round — match ' + l32[1];

    var l16 = c.match(/^L16-(\d+)$/i);
    if (l16) return 'Round — match ' + l16[1];

    var cp = c.match(/^CP-(\d+)$/i);
    if (cp) return 'Custom Playoff — match ' + cp[1];

    var wr = c.match(/^W(\d+)-(\d+)$/i);
    if (wr) return 'Round ' + wr[1] + ' — match ' + wr[2];
    var lr = c.match(/^L(\d+)-(\d+)$/i);
    if (lr) return 'Losers Round ' + lr[1] + ' — match ' + lr[2];
    if (c === 'WF') return 'Winners Final';
    if (c === 'LF') return 'Losers Final';
    if (c === 'GF') return 'Grand Final';
    if (c === 'GF-R') return 'Grand Final Reset';

    var prefixed = c.match(/^(QF|SF)(\d+)$/i);
    if (prefixed) {
      var stageName = prefixed[1].toUpperCase() === 'QF' ? 'Quarter-final' : 'Semi-final';
      return stageName + ' ' + prefixed[2];
    }
    if (c === 'F') return 'Final';

    var koLast = c.match(/^KO Last (\d+)$/i);
    if (koLast) {
      var n = parseInt(koLast[1], 10);
      if (n === 2) return 'Final';
      if (n === 4) return 'Semi-finals';
      if (n === 8) return 'Quarter-finals';
      if (n === 16) return 'Round 1';
      if (n === 32) return 'Round 1';
      return 'Round';
    }
    if (/^KO Pre-/i.test(c)) return 'Preliminary';
    return c;
  }

  function sortKeyForCode(code) {
    var c = String(code == null ? '' : code).trim();
    if (byCode[c]) return byCode[c].sortKey;

    var l32 = c.match(/^L32-(\d+)$/i);
    if (l32) return 100 + parseInt(l32[1], 10);

    var l16 = c.match(/^L16-(\d+)$/i);
    if (l16) return 200 + parseInt(l16[1], 10);

    var cp = c.match(/^CP-(\d+)$/i);
    if (cp) return 50 + parseInt(cp[1], 10);

    // Wide gaps so large DE fields stay ordered: Wn < WF < Ln < LF < GF < GF-R.
    var wr = c.match(/^W(\d+)-(\d+)$/i);
    if (wr) return 1000 + parseInt(wr[1], 10) * 100 + parseInt(wr[2], 10);
    if (c === 'WF') return 1990;

    var lr = c.match(/^L(\d+)-(\d+)$/i);
    if (lr) return 2000 + parseInt(lr[1], 10) * 100 + parseInt(lr[2], 10);
    if (c === 'LF') return 2990;
    if (c === 'GF') return 3000;
    if (c === 'GF-R') return 3010;

    var prefixed = c.match(/^(QF|SF)(\d+)$/i);
    if (prefixed) {
      var base = prefixed[1].toUpperCase() === 'QF' ? 300 : 400;
      return base + parseInt(prefixed[2], 10);
    }
    if (c === 'F') return 501;

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
  }

  var byCode = {};

  function buildStandardRounds() {
    var rounds = [];
    ADMIN_STAGES.forEach(function (stage) {
      for (var n = 1; n <= stage.matchCount; n++) {
        var code = codeForStageMatchInternal(stage.id, n);
        rounds.push({
          code: code,
          label: labelForCode(code),
          sortKey: stage.sortKey * 100 + n,
          stageId: stage.id,
          matchNum: n,
        });
      }
    });
    return rounds;
  }

  var ROUNDS = buildStandardRounds().concat(LEGACY_ROUNDS);

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

  function isByePlayerId(playerId) {
    return String(playerId || '').trim().toLowerCase() === 'bye';
  }

  function isByeFixture(match) {
    if (!match) return false;
    return isByePlayerId(match.playerAId) || isByePlayerId(match.playerBId);
  }

  /** Win slot for a scored result or an unscored bye pad. @returns {'a'|'b'|null} */
  function decidedWinSlot(match) {
    if (isByeFixture(match)) {
      if (isByePlayerId(match.playerBId) && !isByePlayerId(match.playerAId)) return 'a';
      if (isByePlayerId(match.playerAId) && !isByePlayerId(match.playerBId)) return 'b';
      return null;
    }
    var sc = parseMatchScores(match);
    if (!sc.hasResult || sc.scoreA == null || sc.scoreB == null) return null;
    if (sc.scoreA === sc.scoreB) return null;
    return sc.scoreA > sc.scoreB ? 'a' : 'b';
  }

  function allAdminStages() {
    var seen = {};
    var out = [];
    ADMIN_STAGES.concat(DE_ADMIN_STAGES).forEach(function (stage) {
      if (seen[stage.id]) return;
      seen[stage.id] = true;
      out.push(stage);
    });
    return out;
  }

  return {
    adminStages: function (compType) {
      var t = String(compType || '').toLowerCase();
      if (t === 'double-eliminator') return DE_ADMIN_STAGES.slice();
      return ADMIN_STAGES.slice();
    },

    adminStagesForPlayerCount: function (playerCount, compType) {
      var n = Math.max(0, parseInt(playerCount, 10) || 0);
      var t = String(compType || '').toLowerCase();
      var stages = t === 'double-eliminator' ? DE_ADMIN_STAGES : ADMIN_STAGES;
      var filtered = stages.filter(function (stage) {
        if (stage.id === 'CP') return true;
        if (t === 'double-eliminator') {
          var bracket = 1;
          while (bracket < Math.max(2, n)) bracket *= 2;
          var wbRounds = Math.round(Math.log(bracket) / Math.LN2);
          var wNum = /^W(\d+)$/i.test(stage.id) ? parseInt(stage.id.slice(1), 10) : 0;
          if (wNum) return wNum < wbRounds;
          if (stage.id === 'L1') return n > 2;
          if (stage.id === 'L2') return n > 4;
          if (stage.id === 'L3' || stage.id === 'L4') return n > 4;
          return true;
        }
        if (stage.id === 'L32') return n > 16;
        if (stage.id === 'L16') return n > 8;
        if (stage.id === 'QF') return n > 4;
        if (stage.id === 'SF') return n > 2;
        return true;
      });

      // Knockout: Round 1/2 for L32/L16 when shown; QF/SF keep their names.
      var earlyKo = filtered.filter(function (s) {
        return s.id === 'L32' || s.id === 'L16';
      });
      var earlyKoIndex = {};
      earlyKo.forEach(function (s, i) {
        earlyKoIndex[s.id] = i + 1;
      });

      // Double-elim winners: name by players left in that winners round.
      var deWLabels = {};
      if (t === 'double-eliminator') {
        var size = 1;
        while (size < Math.max(2, n)) size *= 2;
        var early = 1;
        var playersLeft = size;
        var wi = 1;
        while (playersLeft > 2) {
          var wid = 'W' + wi;
          if (playersLeft === 8) deWLabels[wid] = 'Quarter Final';
          else if (playersLeft === 4) deWLabels[wid] = 'Semi Final';
          else {
            deWLabels[wid] = 'Round ' + early;
            early += 1;
          }
          playersLeft /= 2;
          wi += 1;
        }
      }

      return filtered.map(function (stage) {
        var copy = {
          id: stage.id,
          label: stage.label,
          matchCount: stage.matchCount,
          sortKey: stage.sortKey,
          customName: stage.customName,
        };
        if (earlyKoIndex[stage.id]) {
          copy.label = 'Round ' + earlyKoIndex[stage.id];
        } else if (stage.id === 'QF') {
          copy.label = 'Quarter Final';
        } else if (stage.id === 'SF') {
          copy.label = 'Semi Final';
        } else if (deWLabels[stage.id]) {
          copy.label = deWLabels[stage.id];
          var pl = 1;
          while (pl < Math.max(2, n)) pl *= 2;
          var wIdx = parseInt(String(stage.id).slice(1), 10) || 1;
          var left = pl / Math.pow(2, wIdx - 1);
          copy.matchCount = Math.max(1, left / 2);
        }
        return copy;
      });
    },

    matchNumbersForStage: function (stageId) {
      var stage = allAdminStages().find(function (s) {
        return s.id === stageId;
      });
      if (!stage) return [];
      var nums = [];
      for (var n = 1; n <= stage.matchCount; n++) nums.push(n);
      return nums;
    },

    codeForStageMatch: function (stageId, matchNum) {
      return codeForStageMatchInternal(stageId, matchNum);
    },

    isCustomPlayoffStage: function (stageId) {
      return String(stageId || '').trim().toUpperCase() === 'CP';
    },

    parseStageMatch: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return { stageId: '', matchNum: 0 };

      if (c === 'F' || c === 'F-P' || c === 'F-C' || c === 'KO Last 2') {
        return { stageId: 'F', matchNum: 1 };
      }
      if (c === 'WF' || c === 'LF' || c === 'GF' || c === 'GF-R') {
        return { stageId: c, matchNum: 1 };
      }

      var l32 = c.match(/^L32-(\d+)$/i);
      if (l32) return { stageId: 'L32', matchNum: parseInt(l32[1], 10) };

      var l16 = c.match(/^L16-(\d+)$/i);
      if (l16) return { stageId: 'L16', matchNum: parseInt(l16[1], 10) };

      var cp = c.match(/^CP-(\d+)$/i);
      if (cp) return { stageId: 'CP', matchNum: parseInt(cp[1], 10) };

      var wr = c.match(/^W(\d+)-(\d+)$/i);
      if (wr) return { stageId: 'W' + wr[1], matchNum: parseInt(wr[2], 10) };
      var lr = c.match(/^L(\d+)-(\d+)$/i);
      if (lr) return { stageId: 'L' + lr[1], matchNum: parseInt(lr[2], 10) };

      var qf = c.match(/^QF(\d+)$/i);
      if (qf) return { stageId: 'QF', matchNum: parseInt(qf[1], 10) };

      var sf = c.match(/^SF(\d+)$/i);
      if (sf) return { stageId: 'SF', matchNum: parseInt(sf[1], 10) };

      if (c === 'KO Last 8') return { stageId: 'QF', matchNum: 1 };
      if (c === 'KO Last 4') return { stageId: 'SF', matchNum: 1 };
      if (c === 'KO Last 16') return { stageId: 'L16', matchNum: 1 };

      var koLast = c.match(/^KO Last (\d+)$/i);
      if (koLast) {
        var n = parseInt(koLast[1], 10);
        if (n === 16) return { stageId: 'L16', matchNum: 1 };
        if (n === 8) return { stageId: 'QF', matchNum: 1 };
        if (n === 4) return { stageId: 'SF', matchNum: 1 };
        if (n === 2) return { stageId: 'F', matchNum: 1 };
      }

      if (/^PO(\d+)$/i.test(c)) {
        var poNum = parseInt(c.match(/^PO(\d+)$/i)[1], 10);
        return { stageId: 'L32', matchNum: poNum };
      }
      if (/^KO Pre-/i.test(c)) return { stageId: 'L32', matchNum: 1 };

      return { stageId: '', matchNum: 0 };
    },

    all: function () {
      return buildStandardRounds().slice();
    },

    labelFor: function (code, roundName) {
      return labelForCode(code, roundName);
    },

    sortKeyFor: function (code) {
      return sortKeyForCode(code);
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

    loserOfPlayerId: function (roundCode) {
      return LOSER_OF_PREFIX + String(roundCode == null ? '' : roundCode).trim();
    },

    isWinnerOfPlayerId: function (playerId) {
      return String(playerId == null ? '' : playerId).indexOf(WINNER_OF_PREFIX) === 0;
    },

    isLoserOfPlayerId: function (playerId) {
      return String(playerId == null ? '' : playerId).indexOf(LOSER_OF_PREFIX) === 0;
    },

    isBracketPlaceholderPlayerId: function (playerId) {
      return this.isWinnerOfPlayerId(playerId) || this.isLoserOfPlayerId(playerId);
    },

    isByePlayerId: isByePlayerId,

    isByeFixture: isByeFixture,

    /** @returns {'a'|'b'|null} */
    decidedWinSlot: decidedWinSlot,

    roundCodeFromWinnerOfId: function (playerId) {
      if (!this.isWinnerOfPlayerId(playerId)) return '';
      return String(playerId).slice(WINNER_OF_PREFIX.length);
    },

    roundCodeFromLoserOfId: function (playerId) {
      if (!this.isLoserOfPlayerId(playerId)) return '';
      return String(playerId).slice(LOSER_OF_PREFIX.length);
    },

    /**
     * Per-match display name using Round / Quarter-final / Semi-final rules.
     * Pass fixtures so DE W1/W2 etc. resolve to Quarter-final 1, Semi-final 2, …
     */
    matchLabelFor: function (code, fixtures) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';
      var roundName = '';
      if (fixtures && fixtures.length) {
        for (var i = 0; i < fixtures.length; i++) {
          if (String(fixtures[i]['Game Week'] || '').trim() === c) {
            roundName = this.fixtureRoundName(fixtures[i]);
            break;
          }
        }
      }
      if (roundName && /^CP-/i.test(c)) {
        var cp = c.match(/^CP-(\d+)$/i);
        return cp ? roundName + ' — match ' + cp[1] : roundName;
      }

      var parsed = this.parseStageMatch(c);
      var matchNum = parsed.matchNum || 0;
      var stageKey = this.stageKeyFor(c);
      var stageLabel = this.stageLabelFor(c, roundName);

      if (fixtures && fixtures.length && typeof this.stageLabelsForFixtures === 'function') {
        var map = this.stageLabelsForFixtures(fixtures);
        if (map[stageKey]) stageLabel = map[stageKey];
      }

      var singular = String(stageLabel || '').replace(/s$/i, '');
      if (/^Quarter-final/i.test(stageLabel) || /^Quarter Final/i.test(stageLabel)) {
        return matchNum ? 'Quarter-final ' + matchNum : 'Quarter-final';
      }
      if (/^Semi-final/i.test(stageLabel) || /^Semi Final/i.test(stageLabel)) {
        return matchNum ? 'Semi-final ' + matchNum : 'Semi-final';
      }
      if (
        stageLabel === 'Final' ||
        stageLabel === 'Winners Final' ||
        stageLabel === 'Losers Final' ||
        stageLabel === 'Grand Final' ||
        stageLabel === 'Grand Final Reset'
      ) {
        return stageLabel;
      }
      if (/^Round \d+/i.test(stageLabel)) {
        return matchNum ? stageLabel + ' — match ' + matchNum : stageLabel;
      }
      if (/^Losers Round \d+/i.test(stageLabel)) {
        return matchNum ? stageLabel + ' — match ' + matchNum : stageLabel;
      }
      if (singular && matchNum && stageLabel !== 'Round') {
        return singular + ' ' + matchNum;
      }
      return this.labelFor(c, roundName) || c;
    },

    winnerOfDisplayLabel: function (roundCode, fixtures) {
      var c = String(roundCode || '').trim();
      if (!c) return 'Winner';

      var parsed = this.parseStageMatch(c);
      var matchNum = parsed.matchNum || 0;
      var stageKey = this.stageKeyFor(c);
      var stageLabel = this.stageLabelFor(c);
      if (fixtures && fixtures.length && typeof this.stageLabelsForFixtures === 'function') {
        var map = this.stageLabelsForFixtures(fixtures);
        if (map[stageKey]) stageLabel = map[stageKey];
      }

      if (
        stageKey === 'QF' ||
        /^Quarter-final/i.test(stageLabel) ||
        /^Quarter Final/i.test(stageLabel)
      ) {
        return (matchNum ? 'QF ' + matchNum : 'QF') + ' Winner';
      }
      if (
        stageKey === 'SF' ||
        /^Semi-final/i.test(stageLabel) ||
        /^Semi Final/i.test(stageLabel)
      ) {
        return (matchNum ? 'SF ' + matchNum : 'SF') + ' Winner';
      }

      // Losers-bracket placeholders: "R1, Match 1 Winner" (not "Losers Round…").
      var deOpts =
        fixtures && fixturesLookLikeDoubleElim(fixtures) ? { doubleElim: true } : null;
      if (
        /^Losers Round/i.test(stageLabel) ||
        (isLosersStageKey(stageKey, deOpts) && String(stageKey).toUpperCase() !== 'LF')
      ) {
        var lbRound = String(stageKey || '').replace(/^L/i, '');
        if (!/^\d+$/.test(lbRound)) {
          var lbLabel = String(stageLabel || '').match(/^Losers Round (\d+)/i);
          lbRound = lbLabel ? lbLabel[1] : lbRound;
        }
        return matchNum
          ? 'R' + lbRound + ', Match ' + matchNum + ' Winner'
          : 'R' + lbRound + ' Winner';
      }

      // Earlier winners-bracket / single-elim rounds: short "Match N Winner".
      var earlyRound =
        stageKey === 'L16' ||
        stageKey === 'L32' ||
        stageLabel === 'Round' ||
        stageLabel === 'Preliminary' ||
        /^Round \d+/i.test(stageLabel) ||
        (this.isWinnersBracketCode(c) && stageKey !== 'WF');
      if (earlyRound) {
        return matchNum ? 'Match ' + matchNum + ' Winner' : 'Winner';
      }

      var label = this.matchLabelFor(roundCode, fixtures);
      var base = label || c;
      return base ? base + ' Winner' : 'Winner';
    },

    loserOfDisplayLabel: function (roundCode, fixtures) {
      var c = String(roundCode || '').trim();
      if (!c) return 'Loser';

      var parsed = this.parseStageMatch(c);
      var matchNum = parsed.matchNum || 0;
      var stageKey = this.stageKeyFor(c);
      var stageLabel = this.stageLabelFor(c);
      if (fixtures && fixtures.length && typeof this.stageLabelsForFixtures === 'function') {
        var map = this.stageLabelsForFixtures(fixtures);
        if (map[stageKey]) stageLabel = map[stageKey];
      }

      if (
        stageKey === 'QF' ||
        /^Quarter-final/i.test(stageLabel) ||
        /^Quarter Final/i.test(stageLabel)
      ) {
        return (matchNum ? 'QF ' + matchNum : 'QF') + ' Loser';
      }
      if (
        stageKey === 'SF' ||
        /^Semi-final/i.test(stageLabel) ||
        /^Semi Final/i.test(stageLabel)
      ) {
        return (matchNum ? 'SF ' + matchNum : 'SF') + ' Loser';
      }

      // Early winners-bracket rounds shown in the losers bracket: "R1, Match 2 Loser".
      var earlyRoundLabel = String(stageLabel || '').match(/^Round (\d+)/i);
      if (
        earlyRoundLabel ||
        stageLabel === 'Round' ||
        stageLabel === 'Preliminary' ||
        (this.isWinnersBracketCode(c) && String(stageKey).toUpperCase() !== 'WF')
      ) {
        var earlyNum =
          (earlyRoundLabel && earlyRoundLabel[1]) ||
          (/^W(\d+)$/i.test(stageKey) ? String(stageKey).slice(1) : '');
        if (earlyNum && matchNum) {
          return 'R' + earlyNum + ', Match ' + matchNum + ' Loser';
        }
        if (earlyNum) return 'R' + earlyNum + ' Loser';
        if (matchNum) return 'Match ' + matchNum + ' Loser';
      }

      var label = this.matchLabelFor(roundCode, fixtures);
      var base = label || c;
      return base ? base + ' Loser' : 'Loser';
    },

    resolvedPlayerId: function (match, slot, winnerIdsByCode, loserIdsByCode) {
      winnerIdsByCode = winnerIdsByCode || {};
      loserIdsByCode = loserIdsByCode || {};
      var isA = slot !== 'b';
      var id = isA ? match.playerAId : match.playerBId;
      if (this.isWinnerOfPlayerId(id)) {
        var wCode = this.roundCodeFromWinnerOfId(id);
        if (wCode && winnerIdsByCode[wCode]) return winnerIdsByCode[wCode];
        return id || '';
      }
      if (this.isLoserOfPlayerId(id)) {
        var lCode = this.roundCodeFromLoserOfId(id);
        if (lCode && loserIdsByCode[lCode]) return loserIdsByCode[lCode];
        return id || '';
      }
      return id || '';
    },

    buildRoundWinnerIdsMap: function (fixtures) {
      var self = this;
      var winners = {};
      var losers = {};
      var list = (fixtures || []).slice().sort(function (a, b) {
        var diff = self.sortKeyFor(a['Game Week']) - self.sortKeyFor(b['Game Week']);
        if (diff !== 0) return diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });
      list.forEach(function (match) {
        var code = String(match['Game Week'] || '').trim();
        if (!code) return;
        var winSlot = decidedWinSlot(match);
        if (!winSlot) return;
        var loseSlot = winSlot === 'a' ? 'b' : 'a';
        var id = self.resolvedPlayerId(match, winSlot, winners, losers);
        if (id && !self.isBracketPlaceholderPlayerId(id) && !isByePlayerId(id)) {
          winners[code] = id;
        }
        if (!isByeFixture(match)) {
          var lid = self.resolvedPlayerId(match, loseSlot, winners, losers);
          if (lid && !self.isBracketPlaceholderPlayerId(lid) && !isByePlayerId(lid)) {
            losers[code] = lid;
          }
        }
      });
      return winners;
    },

    buildRoundLoserIdsMap: function (fixtures) {
      var self = this;
      var winners = {};
      var losers = {};
      var list = (fixtures || []).slice().sort(function (a, b) {
        var diff = self.sortKeyFor(a['Game Week']) - self.sortKeyFor(b['Game Week']);
        if (diff !== 0) return diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });
      list.forEach(function (match) {
        var code = String(match['Game Week'] || '').trim();
        if (!code) return;
        var winSlot = decidedWinSlot(match);
        if (!winSlot) return;
        var loseSlot = winSlot === 'a' ? 'b' : 'a';
        var id = self.resolvedPlayerId(match, winSlot, winners, losers);
        if (id && !self.isBracketPlaceholderPlayerId(id) && !isByePlayerId(id)) {
          winners[code] = id;
        }
        if (!isByeFixture(match)) {
          var lid = self.resolvedPlayerId(match, loseSlot, winners, losers);
          if (lid && !self.isBracketPlaceholderPlayerId(lid) && !isByePlayerId(lid)) {
            losers[code] = lid;
          }
        }
      });
      return losers;
    },

    resolvedPlayerName: function (match, slot, winnersByCode, losersByCode, fixtures) {
      winnersByCode = winnersByCode || {};
      losersByCode = losersByCode || {};
      var isA = slot !== 'b';
      var id = isA ? match.playerAId : match.playerBId;
      var fallback = (isA ? match['Player A'] : match['Player B']) || 'TBD';
      if (this.isWinnerOfPlayerId(id)) {
        var code = this.roundCodeFromWinnerOfId(id);
        if (code && winnersByCode[code]) return winnersByCode[code];
        return this.winnerOfDisplayLabel(code, fixtures);
      }
      if (this.isLoserOfPlayerId(id)) {
        var lCode = this.roundCodeFromLoserOfId(id);
        if (lCode && losersByCode[lCode]) return losersByCode[lCode];
        return this.loserOfDisplayLabel(lCode, fixtures);
      }
      return fallback;
    },

    buildRoundWinnersMap: function (fixtures) {
      var self = this;
      var winners = {};
      var losers = {};
      var list = (fixtures || []).slice().sort(function (a, b) {
        var diff = self.sortKeyFor(a['Game Week']) - self.sortKeyFor(b['Game Week']);
        if (diff !== 0) return diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });

      list.forEach(function (match) {
        var code = String(match['Game Week'] || '').trim();
        if (!code) return;
        var winSlot = decidedWinSlot(match);
        if (!winSlot) return;
        var loseSlot = winSlot === 'a' ? 'b' : 'a';
        var name = self.resolvedPlayerName(match, winSlot, winners, losers);
        if (name && name !== 'TBD' && name.toLowerCase() !== 'bye') {
          winners[code] = name;
        }
        if (!isByeFixture(match)) {
          var lName = self.resolvedPlayerName(match, loseSlot, winners, losers);
          if (lName && lName !== 'TBD' && lName.toLowerCase() !== 'bye') {
            losers[code] = lName;
          }
        }
      });

      return winners;
    },

    buildRoundLosersMap: function (fixtures) {
      var self = this;
      var winners = {};
      var losers = {};
      var list = (fixtures || []).slice().sort(function (a, b) {
        var diff = self.sortKeyFor(a['Game Week']) - self.sortKeyFor(b['Game Week']);
        if (diff !== 0) return diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });
      list.forEach(function (match) {
        var code = String(match['Game Week'] || '').trim();
        if (!code) return;
        var winSlot = decidedWinSlot(match);
        if (!winSlot) return;
        var loseSlot = winSlot === 'a' ? 'b' : 'a';
        var name = self.resolvedPlayerName(match, winSlot, winners, losers);
        if (name && name !== 'TBD' && name.toLowerCase() !== 'bye') {
          winners[code] = name;
        }
        if (!isByeFixture(match)) {
          var lName = self.resolvedPlayerName(match, loseSlot, winners, losers);
          if (lName && lName !== 'TBD' && lName.toLowerCase() !== 'bye') {
            losers[code] = lName;
          }
        }
      });
      return losers;
    },

    fixtureRoundName: function (fixture) {
      if (!fixture) return '';
      return String(fixture.roundName || fixture.round_name || '').trim();
    },

    stageKeyFor: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';

      if (/^L32-/i.test(c)) return 'L32';
      if (/^L16-/i.test(c)) return 'L16';
      if (/^CP-/i.test(c)) return 'CP';
      if (/^W\d+-/i.test(c)) return c.match(/^(W\d+)/i)[1].toUpperCase();
      if (/^L\d+-/i.test(c)) return c.match(/^(L\d+)/i)[1].toUpperCase();
      if (c === 'WF' || c === 'LF' || c === 'GF' || c === 'GF-R') return c;

      var prefixed = c.match(/^(PO|QF|SF)(\d+)$/i);
      if (prefixed) return prefixed[1].toUpperCase();

      if (c === 'F' || c === 'F-P' || c === 'F-C') return 'F';

      var koLast = c.match(/^KO Last (\d+)$/i);
      if (koLast) {
        var n = parseInt(koLast[1], 10);
        if (n === 2) return 'F';
        if (n === 4) return 'SF';
        if (n === 8) return 'QF';
        if (n === 16) return 'L16';
        if (n === 32) return 'L32';
        return 'KO-LAST-' + n;
      }
      if (/^KO Pre-/i.test(c)) return 'L32';
      return c;
    },

    stageLabelFor: function (code, roundName) {
      var custom = String(roundName == null ? '' : roundName).trim();
      var key = this.stageKeyFor(code);
      if (key === 'CP' && custom) return custom;
      if (custom && /^CP-/i.test(String(code || ''))) return custom;
      var pr = playersRemainingForStageKey(key);
      if (pr === 8) return 'Quarter-finals';
      if (pr === 4) return 'Semi-finals';
      if (pr === 2) {
        if (key === 'WF') return 'Winners Final';
        if (key === 'GF') return 'Grand Final';
        if (key === 'GF-R') return 'Grand Final Reset';
        if (key === 'LF') return 'Losers Final';
        return 'Final';
      }
      if (pr > 8 || key === 'L32' || key === 'L16' || /^W\d+$/i.test(key)) {
        // Exact Round N is applied by applyNamedRoundLabels when stages are grouped.
        return 'Round';
      }
      var labels = {
        CP: 'Custom Playoff',
        PO: 'Play-offs',
        QF: 'Quarter-finals',
        SF: 'Semi-finals',
        F: 'Final',
        WF: 'Winners Final',
        LF: 'Losers Final',
        GF: 'Grand Final',
        'GF-R': 'Grand Final Reset',
        'KO-PRELIM': 'Preliminary',
        'KO-L16': 'Round',
        'KO-QF': 'Quarter-finals',
        'KO-SEMI': 'Semi-finals',
        'KO-FINAL': 'Final',
      };
      if (isLosersStageKey(key)) {
        if (key === 'LF') return 'Losers Final';
        return 'Losers Round ' + key.slice(1);
      }
      if (labels[key]) return labels[key];
      return this.labelFor(code, roundName);
    },

    /** stageKey → display label using Round / Quarter-finals / Semi-finals rules. */
    stageLabelsForFixtures: function (fixtures) {
      var stages = this.groupFixturesByStage(fixtures || [], false);
      var map = {};
      stages.forEach(function (stage) {
        map[stage.stageKey] = stage.label;
      });
      return map;
    },

    stageSortKeyFor: function (code, opts) {
      var key = this.stageKeyFor(code);
      var doubleElim = !!(opts && opts.doubleElim);
      var keys = {
        CP: 0,
        L32: 1,
        L16: 2,
        PO: 3,
        QF: 4,
        SF: 5,
        F: 6,
        'KO-PRELIM': 50,
        'KO-L16': 51,
        'KO-QF': 52,
        'KO-SEMI': 53,
        'KO-FINAL': 54,
        // DE finals — after any W{n} / L{n} band below.
        WF: 199,
        LF: 299,
        GF: 300,
        'GF-R': 301,
      };
      // Known keys first — L16/L32 are KO unless this fixture set is DE.
      if (keys[key] != null) {
        if (doubleElim && (key === 'L16' || key === 'L32')) {
          return 200 + parseInt(key.slice(1), 10);
        }
        return keys[key];
      }
      // W1=101 … W98=198 (WF is 199). L1=201 … L98=298 (LF is 299).
      if (/^W(\d+)$/i.test(key)) return 100 + parseInt(key.slice(1), 10);
      if (isLosersStageKey(key, opts)) return 200 + parseInt(key.slice(1), 10);
      return this.sortKeyFor(code);
    },

    isWinnersBracketCode: function (code) {
      var c = String(code == null ? '' : code).trim();
      return /^W\d+-/i.test(c) || c === 'WF';
    },

    isLosersBracketCode: function (code, opts) {
      var c = String(code == null ? '' : code).trim();
      if (c === 'LF') return true;
      // L1-1, L2-3, L17-1, … — not bare KO L16-1 / L32-2 unless doubleElim.
      var m = c.match(/^L(\d+)-(\d+)$/i);
      if (!m) return false;
      var n = parseInt(m[1], 10);
      if (isKoReservedLn(n)) return !!(opts && opts.doubleElim);
      return true;
    },

    fixturesLookLikeDoubleElim: fixturesLookLikeDoubleElim,

    isGrandFinalCode: function (code) {
      var c = String(code == null ? '' : code).trim();
      return c === 'GF' || c === 'GF-R';
    },

    findFixtureByCode: function (fixtures, code) {
      var want = String(code == null ? '' : code).trim();
      if (!want) return null;
      for (var i = 0; i < (fixtures || []).length; i++) {
        if (String(fixtures[i]['Game Week'] || '').trim() === want) return fixtures[i];
      }
      return null;
    },

    /**
     * True when GF is decided and the losers-bracket finalist won — the only
     * case where a Grand Final Reset is required / should be shown.
     * GF is generated as wo:WF (A) vs wo:LF (B).
     */
    grandFinalResetRequired: function (fixtures) {
      var gf = this.findFixtureByCode(fixtures, 'GF');
      if (!gf) return false;
      var winSlot = decidedWinSlot(gf);
      if (!winSlot) return false;

      var winnerIds = this.buildRoundWinnerIdsMap(fixtures);
      var loserIds = this.buildRoundLoserIdsMap
        ? this.buildRoundLoserIdsMap(fixtures)
        : {};
      var gfWinnerId = this.resolvedPlayerId(gf, winSlot, winnerIds, loserIds);
      var lfWinnerId = winnerIds.LF || '';
      var wfWinnerId = winnerIds.WF || '';

      if (gfWinnerId && lfWinnerId && String(gfWinnerId) === String(lfWinnerId)) {
        return true;
      }
      if (gfWinnerId && wfWinnerId && String(gfWinnerId) === String(wfWinnerId)) {
        return false;
      }
      // Placeholders / unresolved ids: slot B is the LF finalist by generation.
      return winSlot === 'b';
    },

    /** Whether list/bracket UIs should include the GF-R fixture. */
    shouldShowGrandFinalReset: function (fixtures) {
      return this.grandFinalResetRequired(fixtures);
    },

    /**
     * Overall DE champion display name once the tournament is decided:
     * WB wins GF → GF winner; LB wins GF → GF-R winner when that match is done.
     */
    doubleElimChampionName: function (fixtures) {
      var winners = this.buildRoundWinnersMap(fixtures);
      var gf = this.findFixtureByCode(fixtures, 'GF');
      if (!gf || !decidedWinSlot(gf)) return '';
      if (this.grandFinalResetRequired(fixtures)) {
        return winners['GF-R'] || '';
      }
      return winners.GF || '';
    },

    groupFixturesByStage: function (fixtures, descending) {
      var deOpts = { doubleElim: fixturesLookLikeDoubleElim(fixtures) };
      var stages = {};
      (fixtures || []).forEach(function (f) {
        var code = String(f['Game Week'] || '').trim();
        if (!code || !f['Player A'] || !f['Player B']) return;
        var sk = KnockoutRounds.stageKeyFor(code);
        var roundName = KnockoutRounds.fixtureRoundName(f);
        if (!stages[sk]) {
          stages[sk] = {
            stageKey: sk,
            label: KnockoutRounds.stageLabelFor(code, roundName),
            codes: [],
            matches: [],
            sortKey: KnockoutRounds.stageSortKeyFor(code, deOpts),
          };
        }
        if (stages[sk].codes.indexOf(code) < 0) stages[sk].codes.push(code);
        stages[sk].matches.push(f);
        stages[sk].sortKey = Math.min(
          stages[sk].sortKey,
          KnockoutRounds.stageSortKeyFor(code, deOpts)
        );
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
      applyNamedRoundLabels(list, deOpts);
      return list;
    },

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

    /**
     * Group knockout fixtures by stage for list UIs (fixtures, results, admin).
     * Pass labelFixtures (usually the full comp set) so Round / Quarter-finals /
     * Semi-finals names stay correct when `fixtures` is a filtered subset
     * (upcoming only, byes removed, results only, …).
     * @returns {{ grouped: Object.<string,Array>, orderedKeys: string[], labels: Object.<string,string> }}
     */
    groupForList: function (fixtures, labelFixtures) {
      var stages = this.groupFixturesByStage(fixtures, false);
      var labelMap =
        labelFixtures && labelFixtures !== fixtures
          ? this.stageLabelsForFixtures(labelFixtures)
          : null;
      var grouped = {};
      var orderedKeys = [];
      var labels = {};
      stages.forEach(function (stage) {
        orderedKeys.push(stage.stageKey);
        grouped[stage.stageKey] = stage.matches;
        labels[stage.stageKey] =
          (labelMap && labelMap[stage.stageKey]) || stage.label;
      });
      return { grouped: grouped, orderedKeys: orderedKeys, labels: labels };
    },
  };
})();
