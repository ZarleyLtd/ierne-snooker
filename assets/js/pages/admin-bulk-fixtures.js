// Admin — bulk CSV import for group-stage fixtures.

var AdminBulkFixturesPage = (function () {
  function buildPlayerResolver(players) {
    var exact = {};
    var lowerToIds = {};
    (players || []).forEach(function (p) {
      var n = String(p.playerName || '').trim();
      if (!n) return;
      exact[n] = p.playerId;
      var L = n.toLowerCase();
      if (!lowerToIds[L]) lowerToIds[L] = [];
      lowerToIds[L].push({ id: p.playerId, name: n });
    });
    return function (raw) {
      var t = String(raw || '').trim();
      if (!t) return { err: 'Empty player name' };
      if (exact[t]) return { id: exact[t] };
      var L = t.toLowerCase();
      var arr = lowerToIds[L] || [];
      var uniq = [];
      arr.forEach(function (x) {
        if (uniq.indexOf(x.id) < 0) uniq.push(x.id);
      });
      if (uniq.length === 1) return { id: uniq[0] };
      if (uniq.length > 1) return { err: 'Ambiguous name: ' + t };
      return { err: 'Unknown player: ' + t };
    };
  }

  var self = {
    competitions: [],
    groups: [],
    playersAll: [],
    el: {},

    adminEvt: function () {
      return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
    },

    cacheEls: function () {
      this.el.gate = document.getElementById('adminBulkFxGate');
      this.el.panel = document.getElementById('adminBulkFxPanel');
      this.el.msg = document.getElementById('adminBulkFxMsg');
      this.el.compSelect = document.getElementById('adminBulkFxComp');
      this.el.groupSelect = document.getElementById('adminBulkFxGroup');
      this.el.csv = document.getElementById('adminBulkFxCsv');
      this.el.log = document.getElementById('adminBulkFxLog');
    },

    flash: function (text, isErr) {
      if (!this.el.msg) return;
      this.el.msg.textContent = text || '';
      this.el.msg.className = 'msg' + (isErr ? ' msg--warning' : ' msg--success');
      this.el.msg.hidden = !text;
    },

    syncGate: function () {
      var ok = typeof AdminMode !== 'undefined' && AdminMode.isUnlocked();
      if (this.el.gate) this.el.gate.hidden = ok;
      if (this.el.panel) this.el.panel.hidden = !ok;
      if (ok) this.loadMeta();
    },

    fillCompGroup: function () {
      var cs = this.el.compSelect;
      var gs = this.el.groupSelect;
      if (cs) {
        cs.innerHTML = '';
        var cur = null;
        (this.competitions || []).forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.compId;
          o.textContent = c.name;
          if (c.isCurrent) cur = c.compId;
          cs.appendChild(o);
        });
        if (cur && cs.querySelector('option[value="' + cur + '"]')) cs.value = cur;
        else if (cs.options.length) cs.selectedIndex = 0;
      }
      if (gs) {
        gs.innerHTML = '';
        (this.groups || []).forEach(function (G) {
          var o = document.createElement('option');
          o.value = G.groupId;
          o.textContent = G.name + ' (' + G.groupId + ')';
          gs.appendChild(o);
        });
        if (gs.options.length) gs.selectedIndex = 0;
      }
    },

    loadGroupsForComp: function () {
      var me = this;
      var cid = me.currentCompId();
      if (!cid) {
        me.groups = [];
        me.fillCompGroup();
        return Promise.resolve();
      }
      return ApiClient.get({ action: 'getCompetitionGroups', compId: cid }).then(function (r) {
        me.groups = (r.groups || []).filter(function (g) {
          return String(g.groupId) !== 'ko';
        });
        me.fillCompGroup();
      });
    },

    loadMeta: function () {
      var me = this;
      if (typeof AdminMode === 'undefined' || !AdminMode.isUnlocked()) return;
      Promise.all([
        ApiClient.get({ action: 'getCompetitions' }),
        ApiClient.get({ action: 'getPlayers' }),
      ])
        .then(function (rs) {
          me.competitions = rs[0].competitions || [];
          me.playersAll = rs[1].players || [];
          return me.loadGroupsForComp();
        })
        .catch(function (e) {
          me.flash(e.message || String(e), true);
        });
    },

    currentCompId: function () {
      return this.el.compSelect && this.el.compSelect.value;
    },

    currentGroupId: function () {
      return this.el.groupSelect && this.el.groupSelect.value;
    },

    resolveOrCreatePlayer: function (name, resolve, compId, groupId, logLines) {
      var r = resolve(name);
      if (r.id) return Promise.resolve(r.id);
      if (r.err && !/^Unknown player:/i.test(r.err)) return Promise.reject(new Error(r.err));
      var slug = PlayerSlug.slugify(name);
      var me = this;
      return ApiClient.post('upsertPlayer', { playerId: slug, playerName: String(name).trim(), active: true })
        .then(function () {
          logLines.push('Created player ' + slug + ' for "' + String(name).trim() + '"');
          me.playersAll.push({ playerId: slug, playerName: String(name).trim(), active: true });
          return ApiClient.post('upsertCompetitionPlayer', {
            compId: compId,
            playerId: slug,
            groupId: groupId,
          }).then(function () {
            return slug;
          });
        });
    },

    runBulkCsv: function () {
      var me = this;
      var raw = (this.el.csv && this.el.csv.value) || '';
      var lines = CsvParse.splitLines(raw);
      if (!lines.length) {
        this.flash('Paste CSV rows first.', true);
        return;
      }
      var delim = CsvParse.sniffDelimiter(lines[0]);
      var start = 0;
      var head = CsvParse.splitRow(lines[0], delim);
      if (head.length >= 3 && /gameweek/i.test(head[0])) start = 1;

      var compId = me.currentCompId();
      var groupId = me.currentGroupId();
      if (!compId || !groupId) {
        me.flash('Select comp and group.', true);
        return;
      }

      var logLines = [];

      function runRow(i) {
        if (i >= lines.length) {
          me.el.log.textContent = logLines.join('\n');
          me.flash('Bulk import finished.', false);
          return me.loadMeta();
        }
        var resolve = buildPlayerResolver(me.playersAll);
        var parts = CsvParse.splitRow(lines[i], delim);
        if (parts.length < 3) {
          logLines.push('Line ' + (i + 1) + ': need 3 columns');
          return runRow(i + 1);
        }
        var gw = parts[0];
        var na = parts[1];
        var nb = parts[2];
        var so = parseInt(gw, 10);
        if (!Number.isFinite(so)) so = 0;

        Promise.all([
          me.resolveOrCreatePlayer(na, resolve, compId, groupId, logLines),
          me.resolveOrCreatePlayer(nb, resolve, compId, groupId, logLines),
        ])
          .then(function (ids) {
            var pa = ids[0];
            var pb = ids[1];
            if (pa === pb) throw new Error('Same player twice');
            return ApiClient.post('upsertFixture', {
              compId: compId,
              stage: 'group',
              groupId: groupId,
              roundLabel: String(gw).trim(),
              playerAId: pa,
              playerBId: pb,
              sortOrder: so,
            });
          })
          .then(function () {
            logLines.push('Line ' + (i + 1) + ': OK');
            runRow(i + 1);
          })
          .catch(function (e) {
            logLines.push('Line ' + (i + 1) + ': ' + (e.message || String(e)));
            runRow(i + 1);
          });
      }

      runRow(start);
    },

    bind: function () {
      var me = this;
      if (this.el.compSelect) {
        this.el.compSelect.addEventListener('change', function () {
          me.loadGroupsForComp().catch(function (e) {
            me.flash(e.message || String(e), true);
          });
        });
      }
      var bulk = document.getElementById('adminBulkFxRun');
      if (bulk) bulk.addEventListener('click', function () { me.runBulkCsv(); });
    },

    init: function () {
      if (!document.getElementById('adminBulkFixturesRoot')) return;
      this.cacheEls();
      this.bind();
      var me = this;
      window.addEventListener(this.adminEvt(), function () { me.syncGate(); });
      this.syncGate();
    },
  };

  return { init: function () { self.init(); } };
})();
