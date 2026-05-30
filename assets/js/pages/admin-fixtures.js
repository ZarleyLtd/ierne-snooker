// Admin — group + knockout fixtures: grouped list + modal add/edit.

var AdminFixturesPage = (function () {
  var KNOCKOUT_GROUP_ID = 'ko';

  function playerGroup(p) {
    if (!p) return '';
    return p.group != null ? p.group : p.groupId;
  }

  var self = {
    competitions: [],
    groups: [],
    compPlayers: [],
    fixturesLoaded: [],
    el: {},

    adminEvt: function () {
      return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
    },

    cacheEls: function () {
      this.el.root = document.getElementById('adminFixturesRoot');
      this.el.gate = document.getElementById('adminFixturesGate');
      this.el.panel = document.getElementById('adminFixturesPanel');
      this.el.compSelect = document.getElementById('adminFxComp');
      this.el.list = document.getElementById('adminFxList');
      this.el.addBtn = document.getElementById('adminFxAddBtn');
      this.el.msg = document.getElementById('adminFxMsg');
      this.el.dialog = document.getElementById('admin-fixture-dialog');
      this.el.form = document.getElementById('adminFxDialogForm');
      this.el.fixtureId = document.getElementById('adminFxFixtureId');
      this.el.stage = document.getElementById('adminFxStage');
      this.el.groupFields = document.getElementById('adminFxGroupFields');
      this.el.koFields = document.getElementById('adminFxKoFields');
      this.el.group = document.getElementById('adminFxGroup');
      this.el.week = document.getElementById('adminFxWeek');
      this.el.round = document.getElementById('adminFxRound');
      this.el.roundCustom = document.getElementById('adminFxRoundCustom');
      this.el.pa = document.getElementById('adminFxPa');
      this.el.pb = document.getElementById('adminFxPb');
      this.el.deleteBtn = document.getElementById('adminFxDeleteBtn');
      this.el.dialogMsg = document.getElementById('adminFxDialogMsg');
    },

    flash: function (text, isErr) {
      if (!this.el.msg) return;
      this.el.msg.textContent = text || '';
      this.el.msg.className = 'msg' + (isErr ? ' msg--warning' : ' msg--success');
      this.el.msg.hidden = !text;
    },

    dialogFlash: function (text, isErr) {
      if (!this.el.dialogMsg) return;
      this.el.dialogMsg.textContent = text || '';
      this.el.dialogMsg.className = 'msg' + (isErr ? ' msg--warning' : ' msg--success');
      this.el.dialogMsg.hidden = !text;
    },

    syncGate: function () {
      var ok = typeof AdminMode !== 'undefined' && AdminMode.isUnlocked();
      if (this.el.gate) this.el.gate.hidden = ok;
      if (this.el.panel) this.el.panel.hidden = !ok;
      if (ok) this.loadMeta();
    },

    groupById: function (id) {
      var gid = String(id == null ? '' : id);
      for (var i = 0; i < (this.groups || []).length; i++) {
        if (String(this.groups[i].groupId) === gid) return this.groups[i];
      }
      return null;
    },

    groupDisplayOrder: function (groupId) {
      var G = this.groupById(groupId);
      return G && G.displayOrder != null ? Number(G.displayOrder) : 0;
    },

    fillCompSelect: function () {
      var ss = this.el.compSelect;
      if (!ss) return;
      ss.innerHTML = '';
      var cur = null;
      (this.competitions || []).forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.compId;
        o.textContent = c.name;
        if (c.isCurrent) cur = c.compId;
        ss.appendChild(o);
      });
      if (cur && ss.querySelector('option[value="' + cur + '"]')) ss.value = cur;
      else if (ss.options.length) ss.selectedIndex = 0;
    },

    groupsForGroupSelect: function () {
      return (this.groups || []).filter(function (G) {
        return String(G.groupId) !== KNOCKOUT_GROUP_ID;
      });
    },

    fillGroupSelect: function (selectedGroupId) {
      var ls = this.el.group;
      if (!ls) return;
      var keep = selectedGroupId != null ? String(selectedGroupId) : ls.value;
      ls.innerHTML = '';
      this.groupsForGroupSelect().forEach(function (G) {
        var o = document.createElement('option');
        o.value = G.groupId;
        o.textContent = G.name;
        ls.appendChild(o);
      });
      if (keep && ls.querySelector('option[value="' + keep + '"]')) ls.value = keep;
      else if (ls.options.length) ls.selectedIndex = 0;
    },

    fillRoundSelect: function () {
      var rs = this.el.round;
      if (!rs) return;
      rs.innerHTML = '';
      (KnockoutRounds.all() || []).forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.code;
        o.textContent = r.label;
        rs.appendChild(o);
      });
      var custom = document.createElement('option');
      custom.value = '__custom__';
      custom.textContent = 'Custom…';
      rs.appendChild(custom);
    },

    currentCompId: function () {
      return this.el.compSelect && this.el.compSelect.value;
    },

    loadCompGroups: function () {
      var me = this;
      var cid = me.currentCompId();
      if (!cid) {
        me.groups = [];
        me.fillGroupSelect();
        return Promise.resolve();
      }
      return ApiClient.get({ action: 'getCompetitionGroups', compId: cid }).then(function (r) {
        var groups = r.groups || [];
        var isKoComp =
          r.competition && String(r.competition.competitionType || '').toLowerCase() === 'knockout';
        if (!isKoComp) {
          groups = groups.filter(function (g) {
            return String(g.groupId) !== KNOCKOUT_GROUP_ID;
          });
        }
        me.groups = groups;
        me.fillGroupSelect();
      });
    },

    loadMeta: function () {
      var me = this;
      if (typeof AdminMode === 'undefined' || !AdminMode.isUnlocked()) return;
      ApiClient.get({ action: 'getCompetitions' })
        .then(function (r) {
          me.competitions = r.competitions || [];
          me.fillCompSelect();
          me.fillRoundSelect();
          return me.loadCompGroups();
        })
        .then(function () {
          return me.reloadFixtures();
        })
        .catch(function (e) {
          me.flash(e.message || String(e), true);
        });
    },

    reloadCompPlayers: function () {
      var me = this;
      var cid = me.currentCompId();
      if (!cid) {
        me.compPlayers = [];
        return Promise.resolve();
      }
      return ApiClient.get({ action: 'getPlayers', comp: cid }).then(function (r) {
        me.compPlayers = r.players || [];
      });
    },

    reloadFixtures: function () {
      var me = this;
      var cid = me.currentCompId();
      if (!cid) return Promise.resolve();
      return Promise.all([
        ApiClient.get({ action: 'getFixtures', comp: cid }),
        me.reloadCompPlayers(),
      ]).then(function (rs) {
        me.fixturesLoaded = rs[0].fixtures || [];
        me.renderList();
      });
    },

    sortedFixturesForDisplay: function () {
      var me = this;
      var groupFx = [];
      var koFx = [];
      (this.fixturesLoaded || []).forEach(function (f) {
        if (f['Stage'] === 'knockout') koFx.push(f);
        else if (f['Stage'] === 'group') groupFx.push(f);
      });

      groupFx.sort(function (a, b) {
        var la = me.groupDisplayOrder(a['Group']);
        var lb = me.groupDisplayOrder(b['Group']);
        if (la !== lb) return la - lb;
        var wa = parseInt(String(a['Game Week']).trim(), 10);
        var wb = parseInt(String(b['Game Week']).trim(), 10);
        if (!Number.isFinite(wa)) wa = 0;
        if (!Number.isFinite(wb)) wb = 0;
        if (wa !== wb) return wa - wb;
        var na = String(a['Player A'] || '');
        var nb = String(b['Player A'] || '');
        return na.localeCompare(nb);
      });

      koFx.sort(function (a, b) {
        var sa = KnockoutRounds.sortKeyFor(a['Game Week']);
        var sb = KnockoutRounds.sortKeyFor(b['Game Week']);
        if (sa !== sb) return sa - sb;
        return String(a['Player A'] || '').localeCompare(String(b['Player A'] || ''));
      });

      return groupFx.concat(koFx);
    },

    renderList: function () {
      var list = this.el.list;
      if (!list) return;
      list.innerHTML = '';
      var me = this;
      var items = this.sortedFixturesForDisplay();
      if (!items.length) {
        list.innerHTML = '<p class="admin-fixtures-empty"><em>No fixtures for this comp.</em></p>';
        return;
      }

      var lastGroup = null;
      var lastWeek = null;
      var lastKoRound = null;

      items.forEach(function (f) {
        if (f['Stage'] === 'knockout') {
          var round = String(f['Game Week'] || '').trim();
          if (round !== lastKoRound) {
            lastKoRound = round;
            lastGroup = null;
            lastWeek = null;
            var h = document.createElement('h3');
            h.className = 'admin-fixtures-list__header';
            h.textContent = KnockoutRounds.labelFor(round);
            list.appendChild(h);
          }
        } else {
          lastKoRound = null;
          var gid = String(f['Group'] || '');
          var week = String(f['Game Week'] || '').trim();
          var grp = me.groupById(gid);
          var groupName = grp ? grp.name : 'Group ' + gid;
          if (gid !== lastGroup) {
            lastGroup = gid;
            lastWeek = null;
            var gh = document.createElement('h3');
            gh.className = 'admin-fixtures-list__header';
            gh.textContent = groupName;
            list.appendChild(gh);
          }
          if (week !== lastWeek) {
            lastWeek = week;
            var wh = document.createElement('h4');
            wh.className = 'admin-fixtures-list__subheader';
            var wn = parseInt(week, 10);
            wh.textContent = Number.isFinite(wn) ? 'Week ' + wn : week;
            list.appendChild(wh);
          }
        }

        var row = document.createElement('div');
        row.className = 'fixture-row admin-fixtures-list__row';
        row.dataset.fixtureId = f.fixtureId || '';

        var playerA = document.createElement('span');
        playerA.className = 'admin-fixtures-list__player-a';
        playerA.textContent = f['Player A'] || '';

        var center = document.createElement('button');
        center.type = 'button';
        center.className = 'fixture-vs-btn admin-fixtures-list__vs';
        center.textContent = 'V';
        center.setAttribute(
          'aria-label',
          'Edit fixture: ' + (f['Player A'] || '') + ' vs ' + (f['Player B'] || '')
        );
        center.addEventListener('click', function () {
          me.openDialogEdit(f);
        });

        var playerB = document.createElement('span');
        playerB.className = 'admin-fixtures-list__player-b';
        playerB.textContent = f['Player B'] || '';

        row.appendChild(playerA);
        row.appendChild(center);
        row.appendChild(playerB);
        list.appendChild(row);
      });
    },

    syncStageFields: function () {
      var stage = this.el.stage && this.el.stage.value;
      var isKo = stage === 'knockout';
      if (this.el.groupFields) this.el.groupFields.hidden = isKo;
      if (this.el.koFields) this.el.koFields.hidden = !isKo;
      if (this.el.group) this.el.group.required = !isKo;
      if (this.el.week) this.el.week.required = !isKo;
      if (this.el.round) this.el.round.required = isKo;
      this.fillGroupSelect(this.el.group && this.el.group.value);
      this.fillPlayerSelects(
        this.el.pa && this.el.pa.value,
        this.el.pb && this.el.pb.value
      );
    },

    playersForDropdown: function () {
      var stage = this.el.stage && this.el.stage.value;
      var players = (this.compPlayers || []).slice();
      if (stage === 'group' && this.el.group && this.el.group.value) {
        var gid = String(this.el.group.value);
        players = players.filter(function (p) {
          return String(playerGroup(p) || '') === gid;
        });
      }
      players.sort(function (a, b) {
        return String(a.playerName || '').localeCompare(String(b.playerName || ''));
      });
      return players;
    },

    fillPlayerSelects: function (selectedA, selectedB) {
      var pa = this.el.pa;
      var pb = this.el.pb;
      if (!pa || !pb) return;
      var players = this.playersForDropdown();
      pa.innerHTML = '<option value="">— Select —</option>';
      pb.innerHTML = '<option value="">— Select —</option>';
      players.forEach(function (p) {
        var oa = document.createElement('option');
        oa.value = p.playerId;
        oa.textContent = p.playerName;
        pa.appendChild(oa);
        var ob = document.createElement('option');
        ob.value = p.playerId;
        ob.textContent = p.playerName;
        pb.appendChild(ob);
      });
      if (selectedA) pa.value = selectedA;
      if (selectedB) pb.value = selectedB;
    },

    syncRoundCustom: function () {
      if (!this.el.roundCustom || !this.el.round) return;
      var custom = this.el.round.value === '__custom__';
      this.el.roundCustom.hidden = !custom;
      this.el.roundCustom.required = custom;
    },

    openDialogAdd: function () {
      if (this.el.fixtureId) this.el.fixtureId.value = '';
      if (this.el.stage) {
        this.el.stage.value = 'group';
        this.el.stage.disabled = false;
      }
      if (this.el.week) this.el.week.value = '';
      if (this.el.round) this.el.round.selectedIndex = 0;
      if (this.el.roundCustom) {
        this.el.roundCustom.value = '';
        this.el.roundCustom.hidden = true;
      }
      if (this.el.deleteBtn) this.el.deleteBtn.hidden = true;
      this.fillGroupSelect();
      this.syncStageFields();
      this.fillPlayerSelects('', '');
      this.dialogFlash('', false);
      if (this.el.dialog && typeof this.el.dialog.showModal === 'function') {
        this.el.dialog.showModal();
      }
    },

    openDialogEdit: function (f) {
      if (this.el.fixtureId) this.el.fixtureId.value = f.fixtureId || '';
      var isKo = f['Stage'] === 'knockout';
      if (this.el.stage) {
        this.el.stage.value = isKo ? 'knockout' : 'group';
        this.el.stage.disabled = true;
      }
      if (isKo) {
        var code = String(f['Game Week'] || '').trim();
        if (KnockoutRounds.isKnownCode(code)) {
          if (this.el.round) this.el.round.value = code;
          if (this.el.roundCustom) {
            this.el.roundCustom.value = '';
            this.el.roundCustom.hidden = true;
          }
        } else {
          if (this.el.round) this.el.round.value = '__custom__';
          if (this.el.roundCustom) {
            this.el.roundCustom.value = code;
            this.el.roundCustom.hidden = false;
          }
        }
      } else {
        this.fillGroupSelect(String(f['Group'] || ''));
        if (this.el.week) this.el.week.value = String(f['Game Week'] || '');
      }
      if (this.el.deleteBtn) this.el.deleteBtn.hidden = false;
      this.syncStageFields();
      this.fillPlayerSelects(f.playerAId || '', f.playerBId || '');
      this.dialogFlash('', false);
      if (this.el.dialog && typeof this.el.dialog.showModal === 'function') {
        this.el.dialog.showModal();
      }
    },

    closeDialog: function () {
      if (this.el.dialog && typeof this.el.dialog.close === 'function') {
        this.el.dialog.close();
      }
    },

    groupSortOrder: function (groupId, weekNum) {
      var ord = this.groupDisplayOrder(groupId);
      var w = Number.isFinite(weekNum) ? weekNum : 0;
      return ord * 1000 + w * 10;
    },

    saveDialog: function (e) {
      if (e) e.preventDefault();
      var me = this;
      var compId = me.currentCompId();
      if (!compId) {
        me.dialogFlash('Select a comp.', true);
        return;
      }
      var stage = me.el.stage && me.el.stage.value;
      var pa = me.el.pa && me.el.pa.value;
      var pb = me.el.pb && me.el.pb.value;
      if (!pa || !pb) {
        me.dialogFlash('Select both players.', true);
        return;
      }
      if (pa === pb) {
        me.dialogFlash('Players must be different.', true);
        return;
      }

      var payload = {
        compId: compId,
        stage: stage,
        playerAId: pa,
        playerBId: pb,
      };
      var fid = me.el.fixtureId && me.el.fixtureId.value.trim();
      if (fid) payload.fixtureId = fid;

      if (stage === 'knockout') {
        var roundVal = me.el.round && me.el.round.value;
        if (roundVal === '__custom__') {
          roundVal = (me.el.roundCustom && me.el.roundCustom.value.trim()) || '';
        }
        if (!roundVal) {
          me.dialogFlash('Select or enter a knockout round.', true);
          return;
        }
        payload.roundLabel = roundVal;
        payload.sortOrder = KnockoutRounds.sortOrderFor(roundVal);
      } else {
        var groupId = me.el.group && me.el.group.value;
        var weekRaw = me.el.week && me.el.week.value.trim();
        var weekNum = parseInt(weekRaw, 10);
        if (!groupId) {
          me.dialogFlash('Select a group.', true);
          return;
        }
        if (!weekRaw || !Number.isFinite(weekNum)) {
          me.dialogFlash('Enter a valid week number.', true);
          return;
        }
        payload.groupId = groupId;
        payload.roundLabel = String(weekNum);
        payload.sortOrder = me.groupSortOrder(groupId, weekNum);
      }

      ApiClient.post('upsertFixture', payload)
        .then(function () {
          me.flash('Fixture saved.', false);
          me.closeDialog();
          return me.reloadFixtures();
        })
        .catch(function (err) {
          me.dialogFlash(err.message || String(err), true);
        });
    },

    deleteFixture: function () {
      var me = this;
      var fid = me.el.fixtureId && me.el.fixtureId.value.trim();
      if (!fid) return;
      if (!window.confirm('Delete this fixture?')) return;
      ApiClient.post('deleteFixture', { fixtureId: fid })
        .then(function () {
          me.flash('Fixture deleted.', false);
          me.closeDialog();
          return me.reloadFixtures();
        })
        .catch(function (err) {
          me.dialogFlash(err.message || String(err), true);
        });
    },

    bind: function () {
      var me = this;
      if (this.el.compSelect) {
        this.el.compSelect.addEventListener('change', function () {
          me.loadCompGroups()
            .then(function () {
              return me.reloadFixtures();
            })
            .catch(function (e) {
              me.flash(e.message || String(e), true);
            });
        });
      }
      if (this.el.addBtn) {
        this.el.addBtn.addEventListener('click', function () {
          me.openDialogAdd();
        });
      }
      if (this.el.stage) {
        this.el.stage.addEventListener('change', function () {
          me.syncStageFields();
        });
      }
      if (this.el.group) {
        this.el.group.addEventListener('change', function () {
          me.fillPlayerSelects(
            me.el.pa && me.el.pa.value,
            me.el.pb && me.el.pb.value
          );
        });
      }
      if (this.el.round) {
        this.el.round.addEventListener('change', function () {
          me.syncRoundCustom();
        });
      }
      if (this.el.form) {
        this.el.form.addEventListener('submit', function (e) {
          me.saveDialog(e);
        });
      }
      var cancel = document.getElementById('adminFxCancelBtn');
      if (cancel) {
        cancel.addEventListener('click', function () {
          me.closeDialog();
        });
      }
      if (this.el.deleteBtn) {
        this.el.deleteBtn.addEventListener('click', function () {
          me.deleteFixture();
        });
      }
    },

    init: function () {
      if (!document.getElementById('adminFixturesRoot')) return;
      this.cacheEls();
      this.bind();
      var me = this;
      window.addEventListener(this.adminEvt(), function () {
        me.syncGate();
      });
      this.syncGate();
    },
  };

  return { init: function () { self.init(); } };
})();
