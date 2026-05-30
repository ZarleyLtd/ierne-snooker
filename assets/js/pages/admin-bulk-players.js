// Admin — bulk CSV import for players + handicaps.

var AdminBulkPlayersPage = (function () {
  function normDate(v) {
    if (!v) return null;
    var s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  var self = {
    competitions: [],
    groups: [],
    el: {},

    adminEvt: function () {
      return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
    },

    cacheEls: function () {
      this.el.gate = document.getElementById('adminBulkPlGate');
      this.el.panel = document.getElementById('adminBulkPlPanel');
      this.el.msg = document.getElementById('adminBulkPlMsg');
      this.el.log = document.getElementById('adminBulkPlLog');
      this.el.csv = document.getElementById('adminBulkPlCsv');
      this.el.rosterComp = document.getElementById('adminBulkPlRosterComp');
      this.el.rosterGroup = document.getElementById('adminBulkPlRosterGroup');
      this.el.rosterChk = document.getElementById('adminBulkPlRosterChk');
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

    fillRosterSelects: function () {
      var rc = this.el.rosterComp;
      var rg = this.el.rosterGroup;
      if (rc) {
        rc.innerHTML = '';
        (this.competitions || []).forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.compId;
          o.textContent = c.name + ' (' + c.compId + ')';
          rc.appendChild(o);
        });
        var cur = null;
        (this.competitions || []).forEach(function (c) {
          if (c.isCurrent) cur = c.compId;
        });
        if (cur && rc.querySelector('option[value="' + cur + '"]')) rc.value = cur;
      }
      if (rg) {
        rg.innerHTML = '';
        (this.groups || []).forEach(function (G) {
          var o = document.createElement('option');
          o.value = G.groupId;
          o.textContent = G.name;
          rg.appendChild(o);
        });
        if (rg.options.length) rg.selectedIndex = 0;
      }
    },

    loadGroupsForComp: function () {
      var me = this;
      var cid = me.el.rosterComp && me.el.rosterComp.value;
      if (!cid) {
        me.groups = [];
        me.fillRosterSelects();
        return Promise.resolve();
      }
      return ApiClient.get({ action: 'getCompetitionGroups', compId: cid }).then(function (r) {
        me.groups = (r.groups || []).filter(function (g) {
          return String(g.groupId) !== 'ko';
        });
        me.fillRosterSelects();
      });
    },

    loadMeta: function () {
      var me = this;
      ApiClient.get({ action: 'getCompetitions' })
        .then(function (r) {
          me.competitions = r.competitions || [];
          return me.loadGroupsForComp();
        })
        .catch(function (e) {
          me.flash(e.message || String(e), true);
        });
    },

    runBulk: function () {
      var me = this;
      var raw = (this.el.csv && this.el.csv.value) || '';
      var lines = CsvParse.splitLines(raw);
      if (!lines.length) {
        me.flash('Paste CSV first.', true);
        return;
      }
      var delim = CsvParse.sniffDelimiter(lines[0]);
      var start = 0;
      var head = CsvParse.splitRow(lines[0], delim);
      if (head.length >= 3 && /playername/i.test(head[0])) start = 1;

      var addRoster = me.el.rosterChk && me.el.rosterChk.checked;
      var compId = me.el.rosterComp && me.el.rosterComp.value;
      var groupId = me.el.rosterGroup && me.el.rosterGroup.value;
      if (addRoster && (!compId || !groupId)) {
        me.flash('Select comp and group for roster checkbox, or turn off roster.', true);
        return;
      }

      var logLines = [];

      function runRow(i) {
        if (i >= lines.length) {
          if (me.el.log) me.el.log.textContent = logLines.join('\n');
          me.flash('Bulk finished.', false);
          return;
        }
        var parts = CsvParse.splitRow(lines[i], delim);
        if (parts.length < 3) {
          logLines.push('Line ' + (i + 1) + ': need 3 columns');
          return runRow(i + 1);
        }
        var pname = parts[0];
        var hc = Number(parts[1]);
        var ed = normDate(parts[2]);
        if (!ed) {
          logLines.push('Line ' + (i + 1) + ': bad date');
          return runRow(i + 1);
        }
        if (!Number.isFinite(hc)) {
          logLines.push('Line ' + (i + 1) + ': bad handicap');
          return runRow(i + 1);
        }
        var pid = PlayerSlug.slugify(pname);
        ApiClient.post('upsertPlayer', { playerId: pid, playerName: String(pname).trim(), active: true })
          .then(function () {
            return ApiClient.post('upsertHandicap', {
              playerId: pid,
              handicap: hc,
              effectiveDate: ed,
            }).then(function () {
              if (addRoster) {
                return ApiClient.post('upsertCompetitionPlayer', {
                  compId: compId,
                  playerId: pid,
                  groupId: groupId,
                });
              }
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
      if (this.el.rosterComp) {
        this.el.rosterComp.addEventListener('change', function () {
          me.loadGroupsForComp().catch(function (e) {
            me.flash(e.message || String(e), true);
          });
        });
      }
      var bk = document.getElementById('adminBulkPlRun');
      if (bk) bk.addEventListener('click', function () { me.runBulk(); });
    },

    init: function () {
      if (!document.getElementById('adminBulkPlayersRoot')) return;
      this.cacheEls();
      this.bind();
      var me = this;
      window.addEventListener(this.adminEvt(), function () { me.syncGate(); });
      this.syncGate();
    },
  };

  return { init: function () { self.init(); } };
})();
