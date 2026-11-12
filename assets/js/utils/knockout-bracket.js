// Horizontal knockout bracket: one column per stage (e.g. all semi-finals together), bracket lines between stages.

var KnockoutBracket = (function () {
  function parseScores(match) {
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

  function stageKeyFromCode(code) {
    return typeof KnockoutRounds !== 'undefined'
      ? KnockoutRounds.stageKeyFor(code)
      : code;
  }

  function linkParent(parentOf, childKey, parentKey) {
    if (!childKey || !parentKey || childKey === parentKey) return;
    if (!parentOf[childKey]) parentOf[childKey] = [];
    if (parentOf[childKey].indexOf(parentKey) < 0) {
      parentOf[childKey].push(parentKey);
    }
  }

  /**
   * Collect concrete player ids/names that can seed a later round.
   * Includes decided/bye winners so QF→SF stays linked after wo: slots are filled.
   */
  function stageFeederIdentity(stage) {
    var ids = {};
    var names = {};
    (stage.matches || []).forEach(function (m) {
      var winSlot =
        typeof KnockoutRounds !== 'undefined' && KnockoutRounds.decidedWinSlot
          ? KnockoutRounds.decidedWinSlot(m)
          : null;
      [
        { id: m.playerAId, name: m['Player A'], slot: 'a' },
        { id: m.playerBId, name: m['Player B'], slot: 'b' },
      ].forEach(function (row) {
        var id = String(row.id || '').trim();
        var name = String(row.name || '').trim();
        if (
          typeof KnockoutRounds !== 'undefined' &&
          (KnockoutRounds.isBracketPlaceholderPlayerId(id) ||
            KnockoutRounds.isByePlayerId(id))
        ) {
          return;
        }
        if (name.toLowerCase() === 'bye' || name === 'TBD') return;
        // Prefer the decided/bye winner; otherwise keep both (unplayed).
        if (winSlot && winSlot !== row.slot) return;
        if (id) ids[id] = true;
        if (name) names[name] = true;
      });
    });
    return { ids: ids, names: names };
  }

  /** @returns {Array<{id:string,label:string,stages:Array}>} */
  function buildTracks(stagesAsc) {
    if (!stagesAsc.length) return [];

    var stageByKey = {};
    stagesAsc.forEach(function (s) {
      stageByKey[s.stageKey] = s;
    });

    var parentOf = {};
    stagesAsc.forEach(function (stage) {
      parentOf[stage.stageKey] = [];
      stage.matches.forEach(function (m) {
        ['playerAId', 'playerBId'].forEach(function (key) {
          var pid = m[key];
          if (
            typeof KnockoutRounds !== 'undefined' &&
            KnockoutRounds.isWinnerOfPlayerId(pid)
          ) {
            var refCode = KnockoutRounds.roundCodeFromWinnerOfId(pid);
            var psk = stageKeyFromCode(refCode);
            if (psk && stageByKey[psk]) {
              linkParent(parentOf, stage.stageKey, psk);
            }
          }
        });
      });
    });

    // After results (or bye advances) fill real players into later rounds, wo:
    // links disappear. Reconnect stages that share those concrete players so
    // e.g. QF stays on the same track as SF/F.
    var feeders = {};
    stagesAsc.forEach(function (stage) {
      feeders[stage.stageKey] = stageFeederIdentity(stage);
    });
    stagesAsc.forEach(function (later) {
      stagesAsc.forEach(function (earlier) {
        if (earlier.sortKey >= later.sortKey) return;
        if ((parentOf[later.stageKey] || []).indexOf(earlier.stageKey) >= 0) return;
        var feed = feeders[earlier.stageKey];
        var linked = false;
        later.matches.forEach(function (m) {
          if (linked) return;
          [
            { id: m.playerAId, name: m['Player A'] },
            { id: m.playerBId, name: m['Player B'] },
          ].forEach(function (row) {
            if (linked) return;
            var id = String(row.id || '').trim();
            var name = String(row.name || '').trim();
            if (
              typeof KnockoutRounds !== 'undefined' &&
              KnockoutRounds.isBracketPlaceholderPlayerId(id)
            ) {
              return;
            }
            if ((id && feed.ids[id]) || (name && feed.names[name])) {
              linkParent(parentOf, later.stageKey, earlier.stageKey);
              linked = true;
            }
          });
        });
      });
    });

    var adj = {};
    stagesAsc.forEach(function (s) {
      adj[s.stageKey] = [];
    });
    stagesAsc.forEach(function (stage) {
      (parentOf[stage.stageKey] || []).forEach(function (psk) {
        adj[stage.stageKey].push(psk);
        adj[psk].push(stage.stageKey);
      });
    });

    var hasLinks = false;
    stagesAsc.forEach(function (s) {
      if ((parentOf[s.stageKey] || []).length) hasLinks = true;
    });

    if (!hasLinks) {
      return splitTracksByConvention(stagesAsc);
    }

    var seen = {};
    var tracks = [];

    stagesAsc.forEach(function (stage) {
      if (seen[stage.stageKey]) return;
      var stack = [stage.stageKey];
      var keys = [];
      seen[stage.stageKey] = true;
      while (stack.length) {
        var k = stack.pop();
        keys.push(k);
        (adj[k] || []).forEach(function (nb) {
          if (!seen[nb]) {
            seen[nb] = true;
            stack.push(nb);
          }
        });
      }
      var trackStages = keys
        .map(function (k) {
          return stageByKey[k];
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return a.sortKey - b.sortKey;
        });
      if (trackStages.length) {
        tracks.push({
          id: trackStages[0].stageKey,
          label: trackLabel(trackStages),
          stages: trackStages,
        });
      }
    });

    if (!tracks.length) {
      tracks.push({ id: 'main', label: '', stages: stagesAsc });
    }

    return tracks;
  }

  var PLATE_STAGE_KEYS = { 'plate-quarters': 1, PQ: 1, PS: 1, PF: 1 };
  var CHAMP_STAGE_KEYS = { 'championship-semis': 1, CS: 1, CF: 1, 'championship-final': 1 };

  function splitTracksByConvention(stagesAsc) {
    var plate = [];
    var champ = [];
    var other = [];

    stagesAsc.forEach(function (stage) {
      var sk = stage.stageKey;
      var codes = stage.codes || [];
      var isPlate =
        sk === 'PQ' ||
        sk === 'PS' ||
        sk === 'PF' ||
        codes.indexOf('PQ') >= 0 ||
        codes.indexOf('PS') >= 0 ||
        codes.indexOf('PF') >= 0;
      var isChamp =
        sk === 'CS' ||
        sk === 'CF' ||
        codes.indexOf('CS') >= 0 ||
        codes.indexOf('CF') >= 0;
      if (isPlate) plate.push(stage);
      else if (isChamp) champ.push(stage);
      else other.push(stage);
    });

    var tracks = [];
    if (plate.length) tracks.push({ id: 'plate', label: 'Plate', stages: plate });
    if (champ.length) tracks.push({ id: 'champ', label: 'Championship', stages: champ });
    if (other.length) tracks.push({ id: other[0].stageKey, label: '', stages: other });
    if (!tracks.length) tracks.push({ id: 'main', label: '', stages: stagesAsc });
    return tracks;
  }

  function trackLabel(stages) {
    var keys = stages.map(function (s) {
      return s.stageKey;
    });
    var codes = [];
    stages.forEach(function (s) {
      (s.codes || []).forEach(function (c) {
        if (codes.indexOf(c) < 0) codes.push(c);
      });
    });
    if (
      keys.indexOf('PQ') >= 0 ||
      codes.indexOf('PQ') >= 0 ||
      keys.indexOf('PS') >= 0 ||
      codes.indexOf('PF') >= 0
    ) {
      return 'Plate';
    }
    if (keys.indexOf('CS') >= 0 || keys.indexOf('CF') >= 0 || codes.indexOf('CS') >= 0) {
      return 'Championship';
    }
    return '';
  }

  function maxMatchesInTrack(stages) {
    var max = 1;
    stages.forEach(function (s) {
      max = Math.max(max, s.matches.length);
    });
    return max;
  }

  function findMatchIndexByRoundCode(stage, roundCode) {
    var code = String(roundCode || '').trim();
    if (!code || !stage || !stage.matches) return -1;
    for (var i = 0; i < stage.matches.length; i++) {
      if (String(stage.matches[i]['Game Week'] || '').trim() === code) return i;
    }
    return -1;
  }

  /** Links from prior-stage matches to winner-of slots in the next stage. */
  function buildFeederLinks(leftStage, rightStage) {
    var links = [];
    if (!rightStage || !leftStage) return links;

    rightStage.matches.forEach(function (rm, rightIdx) {
      [['playerAId', 'a'], ['playerBId', 'b']].forEach(function (pair) {
        var pid = rm[pair[0]];
        if (
          typeof KnockoutRounds === 'undefined' ||
          !KnockoutRounds.isWinnerOfPlayerId(pid)
        ) {
          return;
        }
        var refCode = KnockoutRounds.roundCodeFromWinnerOfId(pid);
        var leftIdx = findMatchIndexByRoundCode(leftStage, refCode);
        if (leftIdx < 0) return;
        links.push({
          leftIdx: leftIdx,
          rightIdx: rightIdx,
          rightSlot: pair[1],
        });
      });
    });
    return links;
  }

  /** Standard bracket pairing with alternating a/b slots per right-side match. */
  function buildConventionLinks(leftStage, rightStage) {
    var links = [];
    var leftCount = leftStage.matches.length;
    var rightCount = rightStage.matches.length;
    if (!leftCount || !rightCount) return links;

    for (var r = 0; r < rightCount; r++) {
      var leftStart = Math.floor((r * leftCount) / rightCount);
      var leftEnd = Math.floor(((r + 1) * leftCount) / rightCount) - 1;
      var slotIdx = 0;
      for (var l = leftStart; l <= leftEnd; l++) {
        links.push({
          leftIdx: l,
          rightIdx: r,
          rightSlot: slotIdx === 0 ? 'a' : 'b',
        });
        slotIdx++;
      }
    }
    return links;
  }

  /** Link prior-round matches when a player is placed directly in the next round. */
  function appendSharedPlayerLinks(leftStage, rightStage, links, linkedLeft) {
    leftStage.matches.forEach(function (lm, leftIdx) {
      if (linkedLeft[leftIdx]) return;

      var leftIds = {};
      var leftNames = {};
      [lm.playerAId, lm.playerBId].forEach(function (id) {
        if (id) leftIds[String(id)] = true;
      });
      [lm['Player A'], lm['Player B']].forEach(function (name) {
        if (name) leftNames[String(name).trim()] = true;
      });

      rightStage.matches.forEach(function (rm, rightIdx) {
        if (linkedLeft[leftIdx]) return;
        [
          { key: 'playerAId', slot: 'a', nameKey: 'Player A' },
          { key: 'playerBId', slot: 'b', nameKey: 'Player B' },
        ].forEach(function (pair) {
          if (linkedLeft[leftIdx]) return;
          var pid = rm[pair.key];
          if (
            typeof KnockoutRounds !== 'undefined' &&
            KnockoutRounds.isWinnerOfPlayerId(pid)
          ) {
            return;
          }
          var pname = String(rm[pair.nameKey] || '').trim();
          if (
            (pid && leftIds[String(pid)]) ||
            (pname && leftNames[pname])
          ) {
            links.push({ leftIdx: leftIdx, rightIdx: rightIdx, rightSlot: pair.slot });
            linkedLeft[leftIdx] = true;
          }
        });
      });
    });
  }

  function buildLinks(leftStage, rightStage) {
    var links = buildFeederLinks(leftStage, rightStage);
    var linkedLeft = {};
    links.forEach(function (link) {
      linkedLeft[link.leftIdx] = true;
    });

    appendSharedPlayerLinks(leftStage, rightStage, links, linkedLeft);

    buildConventionLinks(leftStage, rightStage).forEach(function (link) {
      if (!linkedLeft[link.leftIdx]) {
        links.push(link);
        linkedLeft[link.leftIdx] = true;
      }
    });

    return links;
  }

  function pathD(yLeft, yRight) {
    var yL = Math.max(3, Math.min(97, yLeft));
    var yR = Math.max(3, Math.min(97, yRight));
    return 'M0,' + yL + ' H12 V' + yR + ' H32';
  }

  function loserStubLabelForMatch(match, stubByCode) {
    if (!stubByCode) return '';
    var code = String(match['Game Week'] || '').trim();
    return stubByCode[code] || '';
  }

  function appendExitStub(host, className, ariaPrefix, label) {
    var stubEl = document.createElement('div');
    stubEl.className = className;
    stubEl.setAttribute('aria-label', ariaPrefix + ' ' + label);
    stubEl.innerHTML =
      '<span class="' +
      className +
      '-line"></span>' +
      '<span class="' +
      className +
      '-label">' +
      label +
      '</span>';
    host.appendChild(stubEl);
  }

  function renderGfStubCard() {
    var card = document.createElement('article');
    card.className = 'ko-bracket-match ko-bracket-match--gf-stub';
    card.setAttribute('data-round-code', 'GF-STUB');
    card.setAttribute('aria-label', 'Grand Final');

    var line = document.createElement('div');
    line.className = 'ko-bracket-match__row';
    var nameEl = document.createElement('span');
    nameEl.className = 'ko-bracket-match__name';
    nameEl.textContent = 'Grand Final';
    line.appendChild(nameEl);
    card.appendChild(line);
    return card;
  }

  function renderChampionStubCard(name) {
    var card = document.createElement('article');
    card.className =
      'ko-bracket-match ko-bracket-match--gf-stub ko-bracket-match--champion';
    card.setAttribute('data-round-code', 'CHAMPION');
    card.setAttribute('aria-label', 'Champion ' + name);

    var line = document.createElement('div');
    line.className = 'ko-bracket-match__row ko-bracket-match__row--winner';
    var nameEl = document.createElement('span');
    nameEl.className = 'ko-bracket-match__name';
    nameEl.textContent = name;
    line.appendChild(nameEl);
    card.appendChild(line);
    return card;
  }

  function renderChampionColumn(name, layoutSlots) {
    var col = document.createElement('div');
    col.className = 'ko-bracket-stage ko-bracket-stage--champion';
    col.setAttribute('data-stage', 'CHAMPION');

    var head = document.createElement('div');
    head.className = 'ko-bracket-stage__head';
    head.textContent = 'Champion';

    var list = document.createElement('div');
    list.className = 'ko-bracket-stage__list';
    list.appendChild(renderChampionStubCard(name));

    var arena = document.createElement('div');
    arena.className = 'ko-bracket-stage__arena';
    arena.style.setProperty('--ko-layout-slots', String(Math.max(1, layoutSlots || 1)));
    arena.appendChild(list);

    col.appendChild(head);
    col.appendChild(arena);
    return col;
  }

  function appendBridgeLine(bridge) {
    var line = document.createElement('span');
    line.className = 'ko-bracket-final-exit__bridge-line';
    bridge.appendChild(line);
  }

  /**
   * WF/LF match + bridge + Grand Final stub in the same stage column.
   * With a loser code:  --- L7 ---  [Grand Final]
   * Without (LF):       --------    [Grand Final]
   */
  function wrapWithGfStub(matchCard) {
    var wrap = document.createElement('div');
    wrap.className = 'ko-bracket-final-exit';

    var labelText = '';
    var exits = matchCard.querySelector('.ko-bracket-match__exits');
    if (exits) {
      var lab = exits.querySelector('.ko-bracket-match__loser-stub-label');
      labelText = lab ? String(lab.textContent || '').trim() : '';
      exits.parentNode.removeChild(exits);
    }

    wrap.appendChild(matchCard);

    var bridge = document.createElement('div');
    bridge.className = 'ko-bracket-final-exit__bridge';
    if (labelText) {
      bridge.setAttribute('aria-label', 'Loser ' + labelText);
    } else {
      bridge.setAttribute('aria-hidden', 'true');
    }

    appendBridgeLine(bridge);
    if (labelText) {
      var label = document.createElement('span');
      label.className = 'ko-bracket-final-exit__bridge-label';
      label.textContent = labelText;
      bridge.appendChild(label);
      appendBridgeLine(bridge);
    }

    wrap.appendChild(bridge);
    wrap.appendChild(renderGfStubCard());
    return wrap;
  }

  function rowIsWinner(match, slot, sc) {
    if (
      typeof KnockoutRounds !== 'undefined' &&
      KnockoutRounds.decidedWinSlot
    ) {
      return KnockoutRounds.decidedWinSlot(match) === slot;
    }
    if (sc.hasResult && slot === 'a') return sc.scoreA > sc.scoreB;
    if (sc.hasResult && slot === 'b') return sc.scoreB > sc.scoreA;
    return false;
  }

  /**
   * Losers-bracket entry label: append "(L15)" the first time a WB dropper
   * appears. Works for lo: placeholders and concrete ids after propagation.
   */
  function displayNameForSlot(match, slot, winnersByCode, losersByCode, entryStubByCode, fixtures, entryOpts) {
    entryOpts = entryOpts || {};
    var displayName =
      typeof KnockoutRounds !== 'undefined' && KnockoutRounds.resolvedPlayerName
        ? KnockoutRounds.resolvedPlayerName(
            match,
            slot,
            winnersByCode,
            losersByCode,
            fixtures
          )
        : slot === 'a'
          ? match['Player A'] || 'TBD'
          : match['Player B'] || 'TBD';
    if (!entryStubByCode || typeof KnockoutRounds === 'undefined') return displayName;

    var id = slot === 'a' ? match.playerAId : match.playerBId;
    var stub = '';
    var seenKey = '';
    var loserIdsByCode = entryOpts.loserIdsByCode || {};
    var stubByPlayerId = entryOpts.stubByPlayerId || {};
    var seen = entryOpts.lbEntrySeen;

    if (KnockoutRounds.isLoserOfPlayerId && KnockoutRounds.isLoserOfPlayerId(id)) {
      var feederCode = KnockoutRounds.roundCodeFromLoserOfId(id);
      stub = entryStubByCode[feederCode] || '';
      var resolvedId = loserIdsByCode[feederCode] || '';
      seenKey = resolvedId ? String(resolvedId) : feederCode ? 'lo:' + feederCode : '';
    } else if (id && stubByPlayerId[String(id)]) {
      stub = stubByPlayerId[String(id)];
      seenKey = String(id);
    }

    if (!stub || !seenKey) return displayName;
    if (seen && seen[seenKey]) return displayName;
    if (seen) seen[seenKey] = true;
    return displayName + ' (' + stub + ')';
  }

  function renderMatchCard(match, winnersByCode, opts) {
    opts = opts || {};
    var card = document.createElement('article');
    card.className = 'ko-bracket-match';
    var code = String(match['Game Week'] || '').trim();
    if (code) card.setAttribute('data-round-code', code);
    card.setAttribute('data-help', 'bracket.match');
    var isBye =
      typeof KnockoutRounds !== 'undefined' &&
      KnockoutRounds.isByeFixture &&
      KnockoutRounds.isByeFixture(match);
    if (isBye) card.classList.add('ko-bracket-match--bye');

    var sc = parseScores(match);
    [
      { slot: 'a', score: sc.scoreA },
      { slot: 'b', score: sc.scoreB },
    ].forEach(function (row) {
      var displayName = displayNameForSlot(
        match,
        row.slot,
        winnersByCode,
        opts.losersByCode,
        opts.entryStubByCode,
        opts.fixtures,
        opts
      );
      var line = document.createElement('div');
      line.className = 'ko-bracket-match__row';
      if (rowIsWinner(match, row.slot, sc)) {
        line.classList.add('ko-bracket-match__row--winner');
      }

      var nameEl = document.createElement('span');
      nameEl.className = 'ko-bracket-match__name';
      nameEl.textContent = displayName;

      var score = document.createElement('span');
      score.className = 'ko-bracket-match__score';
      score.textContent =
        sc.hasResult && row.score != null ? String(row.score) : '–';
      if (!sc.hasResult) score.setAttribute('aria-hidden', 'true');

      line.appendChild(nameEl);
      line.appendChild(score);
      card.appendChild(line);
    });

    var matchCode = String(match['Game Week'] || '').trim();
    var loserStub = loserStubLabelForMatch(match, opts.stubByCode);
    if (loserStub) {
      var exits = document.createElement('div');
      exits.className = 'ko-bracket-match__exits';
      appendExitStub(
        exits,
        'ko-bracket-match__loser-stub',
        'Loser',
        loserStub
      );
      card.appendChild(exits);
    }

    if (opts.inlineGfStub && (matchCode === 'WF' || matchCode === 'LF')) {
      return wrapWithGfStub(card);
    }
    return card;
  }

  function renderStageColumn(stage, layoutSlots, winnersByCode, opts) {
    opts = opts || {};
    var col = document.createElement('div');
    col.className = 'ko-bracket-stage';
    col.setAttribute('data-stage', stage.stageKey);

    var head = document.createElement('div');
    head.className = 'ko-bracket-stage__head';
    head.textContent = stage.label || stage.stageKey;

    var list = document.createElement('div');
    list.className = 'ko-bracket-stage__list';

    stage.matches.forEach(function (match) {
      list.appendChild(renderMatchCard(match, winnersByCode, opts));
    });

    var arena = document.createElement('div');
    arena.className = 'ko-bracket-stage__arena';
    arena.style.setProperty('--ko-layout-slots', String(Math.max(1, layoutSlots || 1)));
    arena.appendChild(list);

    col.appendChild(head);
    col.appendChild(arena);
    return col;
  }

  function listMatchUnits(col) {
    var list = col.querySelector('.ko-bracket-stage__list');
    if (!list) return [];
    return Array.prototype.slice.call(list.children);
  }

  function stageMatchCards(col) {
    return Array.prototype.slice.call(
      col.querySelectorAll('.ko-bracket-match:not(.ko-bracket-match--gf-stub)')
    );
  }

  function clearFeederLayout(scrollTrack) {
    scrollTrack.querySelectorAll('.ko-bracket-stage').forEach(function (col) {
      var list = col.querySelector('.ko-bracket-stage__list');
      var arena = col.querySelector('.ko-bracket-stage__arena');
      if (arena) {
        arena.style.minHeight = '';
        arena.style.justifyContent = '';
      }
      if (!list) return;
      list.classList.remove('ko-bracket-stage__list--feeder');
      list.style.position = '';
      list.style.height = '';
      list.style.minHeight = '';
      list.style.gap = '';
      Array.prototype.forEach.call(list.children, function (el) {
        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.width = '';
        el.style.margin = '';
      });
    });
    scrollTrack.querySelectorAll('.ko-bracket-connector__arena').forEach(function (arena) {
      arena.style.minHeight = '';
    });
  }

  function cardTopY(card, arenaTop) {
    if (!card) return null;
    return card.getBoundingClientRect().top - arenaTop;
  }

  function matchRowHeight(card) {
    if (!card) return 0;
    var row = card.querySelector('.ko-bracket-match__row');
    if (row && row.offsetHeight) return row.offsetHeight;
    return card.offsetHeight || 0;
  }

  /** Vertical gap between consecutive packed match cards (first-round spacing). */
  function measurePackedMatchGap(cards) {
    if (!cards || cards.length < 2) return 0;
    var sum = 0;
    var count = 0;
    for (var i = 0; i < cards.length - 1; i++) {
      var a = cards[i].getBoundingClientRect();
      var b = cards[i + 1].getBoundingClientRect();
      var gap = b.top - a.bottom;
      if (gap >= 0) {
        sum += gap;
        count++;
      }
    }
    return count ? sum / count : 0;
  }

  function topsRespectMinGap(tops, units, minGap) {
    if (!tops || tops.length < 2) return true;
    var gap = Math.max(0, minGap || 0);
    for (var i = 0; i < tops.length - 1; i++) {
      var h = (units[i] && units[i].offsetHeight) || 0;
      if (tops[i] + h + gap > tops[i + 1] + 0.5) return false;
    }
    return true;
  }

  /**
   * Later rounds: first match top nearly level with the previous round's second
   * match, nudged 25% of a match-row height lower; last match top nearly level
   * with the previous second-last, nudged 25% higher. Remaining matches are
   * spaced evenly between those tops. If that nudge would leave less than the
   * first-round vertical gap between cards, reduce it (down to 0).
   */
  function computeAdjacentRoundTops(units, leftCards, arenaTop, minGap) {
    var n = units.length;
    var L = leftCards.length;
    if (n < 1 || L < 2) return null;

    var second = leftCards[1];
    var secondLast = leftCards[L - 2];
    var topSecond = cardTopY(second, arenaTop);
    var topSecondLast = cardTopY(secondLast, arenaTop);
    if (topSecond == null || topSecondLast == null) return null;

    var lo = Math.min(topSecond, topSecondLast);
    var hi = Math.max(topSecond, topSecondLast);
    var span = hi - lo;
    var preferredNudge = 0.25 * matchRowHeight(second);
    var nudge = preferredNudge;
    var gap = Math.max(0, minGap || 0);

    if (n > 1) {
      var minPitch = 0;
      for (var p = 0; p < n - 1; p++) {
        var h = (units[p] && units[p].offsetHeight) || 0;
        minPitch = Math.max(minPitch, h + gap);
      }
      // (span - 2*nudge) / (n-1) >= minPitch  →  nudge <= (span - minPitch*(n-1)) / 2
      var maxNudge = (span - minPitch * (n - 1)) / 2;
      if (!(maxNudge > 0)) maxNudge = 0;
      if (nudge > maxNudge) nudge = maxNudge;
    }

    var topA = lo + nudge;
    var topB = hi - nudge;
    if (n > 1 && !(topB > topA)) return null;

    var tops = [];
    if (n === 1) {
      tops[0] = (topA + topB) / 2;
    } else {
      for (var i = 0; i < n; i++) {
        tops[i] = topA + ((topB - topA) * i) / (n - 1);
      }
      if (!topsRespectMinGap(tops, units, gap)) return null;
    }
    return tops;
  }

  function topsFitArena(tops, units, arenaHeight) {
    if (!tops || !tops.length) return false;
    for (var i = 0; i < tops.length; i++) {
      var h = (units[i] && units[i].offsetHeight) || 0;
      if (tops[i] < -0.5 || tops[i] + h > arenaHeight + 0.5) return false;
    }
    return true;
  }

  /**
   * Leftmost round keeps its natural packed spacing. Each later shrinking round
   * is placed from the previous round's second / second-last tops (±25% row
   * height, reduced if needed so gaps stay at least the first-round gap).
   * Expanding / irregular losers rounds stay packed and centred.
   */
  function layoutFeederDrivenGaps(scrollTrack, stagesData) {
    var stageCols = Array.prototype.slice.call(
      scrollTrack.querySelectorAll('.ko-bracket-stage')
    );
    if (!stageCols.length || !stagesData || !stagesData.length) return;

    clearFeederLayout(scrollTrack);

    var naturalHeights = stageCols.map(function (col) {
      var list = col.querySelector('.ko-bracket-stage__list');
      return list ? list.offsetHeight : 0;
    });
    var arenaHeight = Math.max.apply(null, naturalHeights.concat([1]));

    stageCols.forEach(function (col) {
      var arena = col.querySelector('.ko-bracket-stage__arena');
      if (arena) {
        arena.style.minHeight = arenaHeight + 'px';
        arena.style.justifyContent = 'center';
      }
    });
    scrollTrack.querySelectorAll('.ko-bracket-connector__arena').forEach(function (arena) {
      arena.style.minHeight = arenaHeight + 'px';
    });

    var firstArena = stageCols[0].querySelector('.ko-bracket-stage__arena');
    if (!firstArena) return;
    var arenaTop = firstArena.getBoundingClientRect().top;
    var minGap = measurePackedMatchGap(stageMatchCards(stageCols[0]));

    for (var s = 1; s < stageCols.length; s++) {
      var leftCol = stageCols[s - 1];
      var rightCol = stageCols[s];
      var rightArena = rightCol.querySelector('.ko-bracket-stage__arena');
      var rightList = rightCol.querySelector('.ko-bracket-stage__list');
      var units = listMatchUnits(rightCol);
      var leftCards = stageMatchCards(leftCol);
      var n = units.length;
      if (!rightList || !rightArena || n < 1) continue;

      var tops = null;

      if (n < leftCards.length) {
        // Classic shrink (e.g. W16→W8, SF→F). Skip when the round grows (LB).
        tops = computeAdjacentRoundTops(units, leftCards, arenaTop, minGap);
        if (!topsFitArena(tops, units, arenaHeight)) tops = null;
      }

      if (!tops) {
        // Packed + vertically centred (readable for losers absorb rounds).
        rightArena.style.justifyContent = 'center';
        continue;
      }

      rightArena.style.justifyContent = 'flex-start';
      rightList.classList.add('ko-bracket-stage__list--feeder');
      rightList.style.position = 'relative';
      rightList.style.height = arenaHeight + 'px';
      rightList.style.gap = '0';

      for (var j = 0; j < n; j++) {
        var el = units[j];
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.right = '0';
        el.style.width = '100%';
        el.style.top = Math.round(tops[j]) + 'px';
      }

      // Next round measures from these laid-out positions.
      arenaTop = firstArena.getBoundingClientRect().top;
    }
  }

  function renderConnector(leftStage, rightStage, layoutSlots) {
    var col = document.createElement('div');
    col.className = 'ko-bracket-connector';
    col.setAttribute('aria-hidden', 'true');

    var arena = document.createElement('div');
    arena.className = 'ko-bracket-connector__arena';
    arena.style.setProperty('--ko-layout-slots', String(layoutSlots));

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ko-bracket-connector__svg');
    svg.setAttribute('viewBox', '0 0 32 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    var links = buildLinks(leftStage, rightStage);

    links.forEach(function (link) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#169179');
      path.setAttribute('stroke-width', '1.75');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('data-left-idx', String(link.leftIdx));
      path.setAttribute('data-right-idx', String(link.rightIdx));
      path.setAttribute('data-right-slot', link.rightSlot);
      path.setAttribute('d', 'M0,50 H12 V50 H32');
      svg.appendChild(path);
    });

    arena.appendChild(svg);
    col.appendChild(arena);
    return col;
  }

  function matchRowForSlot(matchEl, slot) {
    if (!matchEl) return null;
    var rows = matchEl.querySelectorAll('.ko-bracket-match__row');
    if (!rows.length) return matchEl;
    return slot === 'b' ? rows[rows.length - 1] : rows[0];
  }

  function linkAnchorEl(side, matchEl, slot) {
    if (side === 'left') return matchEl;
    var row = matchRowForSlot(matchEl, slot);
    if (!row) return matchEl;
    return row.querySelector('.ko-bracket-match__name') || row;
  }

  function yPercentInRect(el, refTop, refHeight) {
    if (!el || refHeight < 1) return 50;
    var r = el.getBoundingClientRect();
    var y = ((r.top + r.height / 2) - refTop) / refHeight * 100;
    return Math.max(3, Math.min(97, y));
  }

  /** Left-side Y for a connector: top-row bottom (→ slot b) or bottom-row top (→ slot a). */
  function leftAnchorYPercent(matchEl, slot, refTop, refHeight) {
    if (!matchEl || refHeight < 1) return 50;
    var rows = matchEl.querySelectorAll('.ko-bracket-match__row');
    var y;
    if (slot === 'b') {
      var topRow = rows.length ? rows[0] : matchEl;
      var tb = topRow.getBoundingClientRect();
      y = (tb.bottom - refTop) / refHeight * 100;
    } else {
      var botRow = rows.length ? rows[rows.length - 1] : matchEl;
      var bb = botRow.getBoundingClientRect();
      y = (bb.top - refTop) / refHeight * 100;
    }
    return Math.max(3, Math.min(97, y));
  }

  function sharedVerticalMetrics(leftCol, rightCol, connArena) {
    var leftArena = leftCol.querySelector('.ko-bracket-stage__arena');
    var rightArena = rightCol.querySelector('.ko-bracket-stage__arena');
    var leftRect = leftArena ? leftArena.getBoundingClientRect() : null;
    var rightRect = rightArena ? rightArena.getBoundingClientRect() : null;
    var connRect = connArena ? connArena.getBoundingClientRect() : null;

    var refTop = Infinity;
    var refHeight = 0;
    [leftRect, rightRect, connRect].forEach(function (rect) {
      if (!rect || rect.height < 1) return;
      refTop = Math.min(refTop, rect.top);
      refHeight = Math.max(refHeight, rect.height);
    });

    if (!Number.isFinite(refTop) || refHeight < 1) {
      return null;
    }
    return { refTop: refTop, refHeight: refHeight };
  }

  function updateConnectorPaths(scrollTrack) {
    var connectors = scrollTrack.querySelectorAll('.ko-bracket-connector');
    connectors.forEach(function (conn) {
      var leftCol = conn.previousElementSibling;
      var rightCol = conn.nextElementSibling;
      var connArena = conn.querySelector('.ko-bracket-connector__arena');
      var svg = conn.querySelector('.ko-bracket-connector__svg');
      if (
        !leftCol ||
        !rightCol ||
        !connArena ||
        !svg ||
        !leftCol.classList.contains('ko-bracket-stage') ||
        !rightCol.classList.contains('ko-bracket-stage')
      ) {
        return;
      }

      var metrics = sharedVerticalMetrics(leftCol, rightCol, connArena);
      if (!metrics) return;

      var leftMatches = leftCol.querySelectorAll(
        '.ko-bracket-match:not(.ko-bracket-match--gf-stub)'
      );
      var rightMatches = rightCol.querySelectorAll(
        '.ko-bracket-match:not(.ko-bracket-match--gf-stub)'
      );

      svg.querySelectorAll('path').forEach(function (path) {
        var leftIdx = parseInt(path.getAttribute('data-left-idx'), 10);
        var rightIdx = parseInt(path.getAttribute('data-right-idx'), 10);
        var slot = path.getAttribute('data-right-slot') || 'a';
        var leftCard = leftMatches[leftIdx];
        var rightCard = rightMatches[rightIdx];
        if (!leftCard || !rightCard) return;

        var yL = leftAnchorYPercent(
          leftCard,
          slot,
          metrics.refTop,
          metrics.refHeight
        );
        var yR = yPercentInRect(
          linkAnchorEl('right', rightCard, slot),
          metrics.refTop,
          metrics.refHeight
        );
        path.setAttribute('d', pathD(yL, yR));
      });
    });
  }

  function syncConnectorHeights(scrollTrack) {
    var stages = scrollTrack.querySelectorAll('.ko-bracket-stage');
    var connectors = scrollTrack.querySelectorAll('.ko-bracket-connector');
    var maxH = 0;
    stages.forEach(function (col) {
      var arena = col.querySelector('.ko-bracket-stage__arena');
      if (arena) maxH = Math.max(maxH, arena.offsetHeight);
    });
    if (maxH < 1) return;
    stages.forEach(function (col) {
      var arena = col.querySelector('.ko-bracket-stage__arena');
      if (arena) arena.style.minHeight = maxH + 'px';
    });
    connectors.forEach(function (col) {
      var arena = col.querySelector('.ko-bracket-connector__arena');
      if (arena) arena.style.minHeight = maxH + 'px';
    });
  }

  function bindScroll(block, viewport, scrollTrack, stages, stageTitleEl) {
    var prev = block.querySelector('.ko-bracket-shell__arrow--prev');
    var next = block.querySelector('.ko-bracket-shell__arrow--next');

    function setStageTitle(idx) {
      if (!stageTitleEl || !stages[idx]) return;
      stageTitleEl.textContent = stages[idx].label || stages[idx].stageKey || '';
    }

    function columns() {
      return scrollTrack.querySelectorAll('.ko-bracket-stage');
    }

    function activeIndex() {
      var cols = columns();
      if (!cols.length) return 0;
      var vpRect = viewport.getBoundingClientRect();
      var center = vpRect.left + vpRect.width / 2;
      var best = 0;
      var bestDist = Infinity;
      cols.forEach(function (col, idx) {
        var r = col.getBoundingClientRect();
        var c = r.left + r.width / 2;
        var d = Math.abs(c - center);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      return best;
    }

    function scrollToStage(idx, smooth) {
      var cols = columns();
      if (!cols.length) return;
      var i = Math.max(0, Math.min(idx, cols.length - 1));
      var col = cols[i];
      var left = col.offsetLeft - (viewport.clientWidth - col.offsetWidth) / 2;
      viewport.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
      updateUi(i);
    }

    function updateUi(idx) {
      var count = columns().length;
      setStageTitle(idx);
      if (prev) {
        var showPrev = count > 1 && idx > 0;
        prev.classList.toggle('is-unavailable', !showPrev);
        prev.disabled = !showPrev;
        prev.setAttribute('aria-hidden', showPrev ? 'false' : 'true');
      }
      if (next) {
        var showNext = count > 1 && idx < count - 1;
        next.classList.toggle('is-unavailable', !showNext);
        next.disabled = !showNext;
        next.setAttribute('aria-hidden', showNext ? 'false' : 'true');
      }
    }

    var scrollTimer;
    viewport.addEventListener(
      'scroll',
      function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
          updateUi(activeIndex());
        }, 80);
      },
      { passive: true }
    );

    if (prev) {
      prev.addEventListener('click', function () {
        scrollToStage(activeIndex() - 1, true);
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        scrollToStage(activeIndex() + 1, true);
      });
    }

    scrollToStage(0, false);
  }

  function renderTrack(track, root, winnersByCode, trackOptions) {
    trackOptions = trackOptions || {};
    var block = document.createElement('section');
    block.className = 'ko-bracket-track-block';
    if (trackOptions.stageNav !== false) {
      block.classList.add('ko-bracket-track-block--stage-nav');
    }

    if (trackOptions.trackLabel) {
      var trackTitle = document.createElement('h3');
      trackTitle.className = 'ko-bracket-track-block__title align-center';
      trackTitle.textContent = trackOptions.trackLabel;
      block.appendChild(trackTitle);
    }

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'ko-bracket-shell__arrow ko-bracket-shell__arrow--prev';
    prevBtn.setAttribute('aria-label', 'Earlier stage');
    prevBtn.setAttribute('data-help', 'bracket.prev');
    prevBtn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6L8 12L14 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'ko-bracket-shell__arrow ko-bracket-shell__arrow--next';
    nextBtn.setAttribute('aria-label', 'Later stage');
    nextBtn.setAttribute('data-help', 'bracket.next');
    nextBtn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6L16 12L10 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var stages = track.stages.slice();
    var layoutSlots = maxMatchesInTrack(stages);
    var stageTitleEl = null;

    if (trackOptions.stageNav !== false && stages.length) {
      var headerRow = document.createElement('div');
      headerRow.className = 'ko-bracket-stage-nav';
      stageTitleEl = document.createElement('div');
      stageTitleEl.className = 'ko-bracket-stage-nav__title align-center';
      stageTitleEl.setAttribute('data-help', 'bracket.stage');
      stageTitleEl.textContent = stages[0].label || stages[0].stageKey || '';
      headerRow.appendChild(prevBtn);
      headerRow.appendChild(stageTitleEl);
      headerRow.appendChild(nextBtn);
      block.appendChild(headerRow);
    }

    var shell = document.createElement('div');
    shell.className = 'ko-bracket-shell';

    var viewport = document.createElement('div');
    viewport.className = 'ko-bracket-shell__viewport';
    viewport.setAttribute('tabindex', '0');

    var scrollTrack = document.createElement('div');
    scrollTrack.className = 'ko-bracket-shell__track';

    var cardOpts = Object.assign({}, trackOptions.cardOpts || {});
    if (trackOptions.appendGfStub) cardOpts.inlineGfStub = true;
    stages.forEach(function (stage, idx) {
      if (idx > 0) {
        scrollTrack.appendChild(renderConnector(stages[idx - 1], stage, layoutSlots));
      }
      scrollTrack.appendChild(
        renderStageColumn(stage, layoutSlots, winnersByCode, cardOpts)
      );
    });

    var navStages = stages.slice();
    var championName = String(trackOptions.championName || '').trim();
    if (championName) {
      scrollTrack.appendChild(renderChampionColumn(championName, layoutSlots));
      navStages.push({ stageKey: 'CHAMPION', label: 'Champion' });
    }

    viewport.appendChild(scrollTrack);

    shell.appendChild(viewport);
    block.appendChild(shell);
    root.appendChild(block);

    function layoutConnectors() {
      layoutFeederDrivenGaps(scrollTrack, stages);
      updateConnectorPaths(scrollTrack);
    }

    function scheduleLayoutConnectors() {
      layoutConnectors();
      requestAnimationFrame(function () {
        requestAnimationFrame(layoutConnectors);
      });
      [50, 150, 400].forEach(function (delay) {
        setTimeout(layoutConnectors, delay);
      });
    }

    scheduleLayoutConnectors();

    if (!scrollTrack._koResizeBound) {
      scrollTrack._koResizeBound = true;
      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(layoutConnectors, 120);
      });

      if (typeof ResizeObserver !== 'undefined') {
        var layoutTimer;
        var ro = new ResizeObserver(function () {
          clearTimeout(layoutTimer);
          layoutTimer = setTimeout(layoutConnectors, 16);
        });
        ro.observe(scrollTrack);
        scrollTrack.querySelectorAll('.ko-bracket-stage__arena, .ko-bracket-connector__arena').forEach(
          function (el) {
            ro.observe(el);
          }
        );
        scrollTrack._koResizeObserver = ro;
      }
    }

    scrollTrack._koLayoutConnectors = layoutConnectors;

    bindScroll(block, viewport, scrollTrack, navStages, stageTitleEl);
  }

  return {
    relayout: function (root) {
      if (!root) return;
      root.querySelectorAll('.ko-bracket-shell__track').forEach(function (track) {
        if (typeof track._koLayoutConnectors === 'function') {
          track._koLayoutConnectors();
        } else {
          syncConnectorHeights(track);
          updateConnectorPaths(track);
        }
      });
    },

    render: function (root, fixtures, options) {
      if (!root) return;
      root.innerHTML = '';
      options = options || {};

      var stages =
        typeof KnockoutRounds !== 'undefined' && KnockoutRounds.groupFixturesByStage
          ? KnockoutRounds.groupFixturesByStage(fixtures, false)
          : [];

      if (!stages.length) {
        root.innerHTML = '<p class="align-center"><em>No knockout fixtures yet.</em></p>';
        return;
      }

      var winnersByCode =
        typeof KnockoutRounds !== 'undefined' && KnockoutRounds.buildRoundWinnersMap
          ? KnockoutRounds.buildRoundWinnersMap(fixtures)
          : {};
      var losersByCode =
        typeof KnockoutRounds !== 'undefined' && KnockoutRounds.buildRoundLosersMap
          ? KnockoutRounds.buildRoundLosersMap(fixtures)
          : {};

      var stageNav = options.stageNav !== false;
      var looksLikeDe =
        options.doubleElim === true ||
        (typeof KnockoutRounds !== 'undefined' &&
          typeof KnockoutRounds.fixturesLookLikeDoubleElim === 'function' &&
          KnockoutRounds.fixturesLookLikeDoubleElim(fixtures));
      var deOpts = looksLikeDe ? { doubleElim: true } : null;

      if (looksLikeDe && typeof KnockoutRounds !== 'undefined') {
        var wbStages = [];
        var lbStages = [];
        var gfStages = [];
        stages.forEach(function (stage) {
          var sample = (stage.codes && stage.codes[0]) || '';
          if (KnockoutRounds.isGrandFinalCode(sample) || stage.stageKey === 'GF' || stage.stageKey === 'GF-R') {
            gfStages.push(stage);
          } else if (
            KnockoutRounds.isLosersBracketCode(sample, deOpts) ||
            stage.stageKey === 'LF'
          ) {
            lbStages.push(stage);
          } else if (
            KnockoutRounds.isWinnersBracketCode(sample) ||
            /^W\d+$/i.test(stage.stageKey) ||
            stage.stageKey === 'WF'
          ) {
            wbStages.push(stage);
          } else {
            wbStages.push(stage);
          }
        });

        var stubByCode = {};
        var stubNum = 1;
        wbStages.forEach(function (stage) {
          (stage.matches || []).forEach(function (m) {
            var code = String(m['Game Week'] || '').trim();
            if (code && stubByCode[code] == null) {
              stubByCode[code] = 'L' + stubNum;
              stubNum += 1;
            }
          });
        });

        var loserIdsByCode =
          typeof KnockoutRounds.buildRoundLoserIdsMap === 'function'
            ? KnockoutRounds.buildRoundLoserIdsMap(fixtures)
            : {};
        var stubByPlayerId = {};
        Object.keys(stubByCode).forEach(function (wbCode) {
          var lid = loserIdsByCode[wbCode];
          if (lid) stubByPlayerId[String(lid)] = stubByCode[wbCode];
        });

        if (wbStages.length) {
          renderTrack(
            { id: 'winners', label: 'Winners', stages: wbStages },
            root,
            winnersByCode,
            {
              stageNav: stageNav,
              trackLabel: 'Winners bracket',
              appendGfStub: true,
              cardOpts: {
                losersByCode: losersByCode,
                stubByCode: stubByCode,
                fixtures: fixtures,
              },
            }
          );
        }
        if (lbStages.length) {
          renderTrack(
            { id: 'losers', label: 'Losers', stages: lbStages },
            root,
            winnersByCode,
            {
              stageNav: stageNav,
              trackLabel: 'Losers bracket',
              appendGfStub: true,
              cardOpts: {
                losersByCode: losersByCode,
                entryStubByCode: stubByCode,
                stubByPlayerId: stubByPlayerId,
                loserIdsByCode: loserIdsByCode,
                lbEntrySeen: {},
                fixtures: fixtures,
              },
            }
          );
        }
        var showGfReset =
          typeof KnockoutRounds.shouldShowGrandFinalReset === 'function' &&
          KnockoutRounds.shouldShowGrandFinalReset(fixtures);
        gfStages = gfStages.filter(function (stage) {
          return stage.stageKey !== 'GF-R' || showGfReset;
        });
        var championName =
          typeof KnockoutRounds.doubleElimChampionName === 'function'
            ? KnockoutRounds.doubleElimChampionName(fixtures)
            : '';

        if (gfStages.length || championName) {
          renderTrack(
            { id: 'finals', label: 'Finals', stages: gfStages },
            root,
            winnersByCode,
            {
              stageNav: stageNav,
              trackLabel: 'Grand Final',
              championName: championName,
              cardOpts: { losersByCode: losersByCode, fixtures: fixtures },
            }
          );
        }
        return;
      }

      buildTracks(stages).forEach(function (track) {
        renderTrack(track, root, winnersByCode, {
          stageNav: stageNav,
          trackLabel: track.label || '',
          cardOpts: { losersByCode: losersByCode, fixtures: fixtures },
        });
      });
    },
  };
})();
