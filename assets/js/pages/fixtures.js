// Fixtures Page — upcoming list + Admin Mode result entry

var FixturesPage = {
  /** Dispatched on successful Save from the Enter result dialog (fixtures or results page). */
  RESULT_SAVED_EVENT: 'ierne-fixture-result-saved',

  KO_LABELS: {
    CS: 'Championship Semis',
    CF: 'Championship Final',
    PQ: 'Plate Quarters',
    PS: 'Plate Semis',
    PF: 'Plate Final',
  },

  /** Default match length when a fixture has no bestOf (odd 1–9). */
  DEFAULT_BEST_OF: 3,
  _currentBestOf: 3,
  _loadedBreakIds: [],
  _handicapHistoryByPlayer: null,
  _handicapsLoadPromise: null,
  _slipPendingUploaded: false,
  _slipHasCommitted: false,
  _slipSaveSucceeded: false,
  _slipSuppressDiscardOnClose: false,
  _resultSlipUploadInited: false,
  /** Per-player frame scores in the result dialog. */
  _playerScores: { a: 0, b: 0 },
  /** True when the dialog was opened for a fixture that already had a result. */
  _dialogOpenedWithResult: false,
  CLEAR_RESULT_CONFIRM_MSG:
    'Remove this result from the database?\n\nFrames are 0–0, so the recorded score will be cleared and this fixture will show as having no result. Any breaks already saved for this match will be deleted.',
  CLEAR_RESULT_INLINE_MSG:
    'Frames are 0–0 — saving will remove this result from the database and delete any breaks already saved for this match.',
  /** A player may edit their own match until 24 hours after the result is first posted. */
  RESULT_EDIT_MS: 24 * 60 * 60 * 1000,
  _openResultPostedAt: '',
  _resultDialogBindingsDone: false,

  adminModeEvent: function () {
    return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
  },

  isAdmin: function () {
    return typeof AdminMode !== 'undefined' && AdminMode.isUnlocked();
  },

  canEditFixture: function (playerAId, playerBId, resultPostedAt) {
    if (this.isAdmin()) return true;
    if (typeof PlayerSession === 'undefined' || !PlayerSession.isSignedIn()) return false;
    var mine = this.normalizePlayerId(PlayerSession.playerId());
    if (!mine) return false;
    if (mine !== this.normalizePlayerId(playerAId) && mine !== this.normalizePlayerId(playerBId)) {
      return false;
    }
    if (!resultPostedAt) return true;
    var posted = new Date(resultPostedAt).getTime();
    if (isNaN(posted)) return true;
    return Date.now() < posted + this.RESULT_EDIT_MS;
  },

  normalizeBestOf: function (raw) {
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 9 || n % 2 === 0) return this.DEFAULT_BEST_OF;
    return n;
  },

  frameCount: function () {
    return this.normalizeBestOf(this._currentBestOf);
  },

  framesToWin: function () {
    return Math.ceil(this.frameCount() / 2);
  },

  initPlayerScores: function () {
    this._playerScores = { a: 0, b: 0 };
  },

  playerScore: function (side) {
    return this._playerScores[side] || 0;
  },

  adjustPlayerScore: function (side, delta) {
    if (side !== 'a' && side !== 'b') return;
    var framesToWin = this.framesToWin();
    var myScore = this.playerScore(side);
    var next = myScore + delta;
    if (next < 0 || next > framesToWin) return;
    if (delta > 0 && !this.canIncrementScore(side)) return;
    this._playerScores[side] = next;
    this.refreshMatchFrameUI();
  },

  canIncrementScore: function (side) {
    var framesToWin = this.framesToWin();
    var myScore = this.playerScore(side);
    var total = this.playerScore('a') + this.playerScore('b');
    if (myScore >= framesToWin) return false;
    if (total + 1 > this.frameCount()) return false;
    return true;
  },

  formatEnteredByLabel: function (enteredBy) {
    var by = String(enteredBy || '').trim();
    if (!by) return '';
    return 'Entered by ' + by;
  },

  updateDialogEnteredBy: function (enteredBy) {
    var el = document.getElementById('fixture-result-entered-by');
    if (!el) return;
    var text = this.formatEnteredByLabel(enteredBy);
    el.textContent = text;
    el.hidden = !text;
  },

  ensureHandicapsLoaded: function () {
    var self = this;
    if (this._handicapHistoryByPlayer) {
      return Promise.resolve(this._handicapHistoryByPlayer);
    }
    if (this._handicapsLoadPromise) return this._handicapsLoadPromise;
    this._handicapsLoadPromise = ApiClient.get({ action: 'getHandicaps' })
      .then(function (r) {
        var map = {};
        (r.handicaps || []).forEach(function (h) {
          var pid = String(h.playerId || '').trim();
          if (!pid) return;
          if (!map[pid]) map[pid] = [];
          map[pid].push({
            date: String(h['Handicap Date'] || '').trim(),
            handicap: Number(h['Handicap']),
          });
        });
        Object.keys(map).forEach(function (pid) {
          map[pid].sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date));
          });
        });
        self._handicapHistoryByPlayer = map;
        return map;
      })
      .catch(function () {
        self._handicapHistoryByPlayer = {};
        return self._handicapHistoryByPlayer;
      });
    return this._handicapsLoadPromise;
  },

  handicapOnDate: function (playerId, matchDate) {
    var pid = String(playerId || '').trim();
    if (!pid) return null;
    if (
      typeof KnockoutRounds !== 'undefined' &&
      KnockoutRounds.isWinnerOfPlayerId &&
      KnockoutRounds.isWinnerOfPlayerId(pid)
    ) {
      return null;
    }
    var rows = (this._handicapHistoryByPlayer && this._handicapHistoryByPlayer[pid]) || [];
    if (!rows.length) return null;
    var md = String(matchDate || '').trim();
    if (!md) {
      var latest = rows[0];
      return latest && Number.isFinite(latest.handicap) ? latest.handicap : null;
    }
    var i;
    for (i = 0; i < rows.length; i++) {
      if (!rows[i].date || rows[i].date <= md) {
        return Number.isFinite(rows[i].handicap) ? rows[i].handicap : null;
      }
    }
    return null;
  },

  formatHandicapBrief: function (value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return 'Handicap: n/a';
    return 'Handicap: ' + Math.trunc(Number(value));
  },

  formatHandicapParen: function (value) {
    if (typeof Formatters !== 'undefined' && Formatters.formatHandicapParenValue) {
      return Formatters.formatHandicapParenValue(value);
    }
    if (value == null || value === '') return '';
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    n = Math.trunc(n);
    if (n === 0) return '0';
    if (n > 0) return '+' + n;
    return String(n);
  },

  playerLabelWithHandicap: function (name, playerId, matchDate) {
    var base = String(name == null ? '' : name);
    var hc = this.handicapOnDate(playerId, matchDate);
    var paren = this.formatHandicapParen(hc);
    if (!paren) return base;
    return base + ' (' + paren + ')';
  },

  refreshResultDialogPlayerLabels: function () {
    var nameA =
      (document.getElementById('fixture-result-label-a') &&
        document.getElementById('fixture-result-label-a').getAttribute('data-base-name')) ||
      '';
    var nameB =
      (document.getElementById('fixture-result-label-b') &&
        document.getElementById('fixture-result-label-b').getAttribute('data-base-name')) ||
      '';
    var pidA = (document.getElementById('fixture-result-player-a-id') || {}).value || '';
    var pidB = (document.getElementById('fixture-result-player-b-id') || {}).value || '';
    var matchDate = this.resultDialogMatchDateISO();
    var labelA = document.getElementById('fixture-result-label-a');
    var labelB = document.getElementById('fixture-result-label-b');
    if (labelA) labelA.textContent = this.playerLabelWithHandicap(nameA, pidA, matchDate);
    if (labelB) labelB.textContent = this.playerLabelWithHandicap(nameB, pidB, matchDate);
  },

  /** Match date from the Enter result dialog as YYYY-MM-DD (empty if invalid or blank). */
  resultDialogMatchDateISO: function () {
    var dateEl = document.getElementById('fixture-result-date');
    var pickerEl = document.getElementById('fixture-result-date-picker');
    var raw = dateEl ? String(dateEl.value || '').trim() : '';
    if (raw && typeof Formatters !== 'undefined' && Formatters.parseMatchDateToISO) {
      return Formatters.parseMatchDateToISO(raw);
    }
    if (!raw && pickerEl && pickerEl.value && typeof Formatters !== 'undefined' && Formatters.parseMatchDateToISO) {
      return Formatters.parseMatchDateToISO(pickerEl.value);
    }
    return '';
  },

  /** Set the dialog date control from an ISO date, or today when blank. */
  setResultDialogMatchDate: function (isoOrEmpty) {
    var dateEl = document.getElementById('fixture-result-date');
    var pickerEl = document.getElementById('fixture-result-date-picker');
    var iso =
      isoOrEmpty && String(isoOrEmpty).trim()
        ? String(isoOrEmpty).trim()
        : this.localISODate();
    if (pickerEl) pickerEl.value = iso;
    if (!dateEl) return;
    if (typeof Formatters !== 'undefined' && Formatters.formatMatchDateDisplay) {
      var display = Formatters.formatMatchDateDisplay(iso);
      dateEl.value = display || iso;
      return;
    }
    dateEl.value = iso;
  },

  /** Normalize a typed date to "31 Jan 2026" when valid, and refresh handicap labels. */
  normalizeResultDialogMatchDate: function () {
    var dateEl = document.getElementById('fixture-result-date');
    var pickerEl = document.getElementById('fixture-result-date-picker');
    if (!dateEl) return;
    var iso = this.resultDialogMatchDateISO();
    if (iso) {
      if (typeof Formatters !== 'undefined' && Formatters.formatMatchDateDisplay) {
        dateEl.value = Formatters.formatMatchDateDisplay(iso);
      }
      if (pickerEl) pickerEl.value = iso;
    }
    this.refreshResultDialogPlayerLabels();
  },

  /** Apply a date chosen via the calendar button into the display field. */
  applyResultDialogPickerDate: function () {
    var pickerEl = document.getElementById('fixture-result-date-picker');
    if (!pickerEl || !pickerEl.value) return;
    this.setResultDialogMatchDate(pickerEl.value);
    this.refreshResultDialogPlayerLabels();
  },

  setResultDialogPlayerLabels: function (nameA, nameB) {
    var labelA = document.getElementById('fixture-result-label-a');
    var labelB = document.getElementById('fixture-result-label-b');
    if (labelA) labelA.setAttribute('data-base-name', String(nameA == null ? '' : nameA));
    if (labelB) labelB.setAttribute('data-base-name', String(nameB == null ? '' : nameB));
    var self = this;
    if (this._handicapHistoryByPlayer) {
      this.refreshResultDialogPlayerLabels();
      return;
    }
    if (labelA) labelA.textContent = String(nameA == null ? '' : nameA);
    if (labelB) labelB.textContent = String(nameB == null ? '' : nameB);
    this.ensureHandicapsLoaded().then(function () {
      self.refreshResultDialogPlayerLabels();
    });
  },

  showPlayerHandicapBrief: function (anchorEl, playerId, matchDate) {
    var self = this;
    function show() {
      var text = self.formatHandicapBrief(self.handicapOnDate(playerId, matchDate));
      if (typeof window.BriefMessage !== 'undefined' && window.BriefMessage.show) {
        window.BriefMessage.show(text, anchorEl, { durationMs: 1200 });
      }
    }
    if (this._handicapHistoryByPlayer) {
      show();
      return;
    }
    this.ensureHandicapsLoaded().then(show, show);
  },

  makePlayerNameEl: function (name, playerId, matchDate, align) {
    var self = this;
    var winnerOf =
      typeof KnockoutRounds !== 'undefined' &&
      KnockoutRounds.isWinnerOfPlayerId &&
      KnockoutRounds.isWinnerOfPlayerId(playerId);
    var el = document.createElement('span');
    el.className = 'fixture-player-name';
    el.textContent = name;
    el.style.flex = '1';
    el.style.textAlign = align === 'left' ? 'left' : 'right';
    if (winnerOf) return el;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Show handicap for ' + name);
    function onActivate(e) {
      e.preventDefault();
      e.stopPropagation();
      self.showPlayerHandicapBrief(el, playerId, matchDate);
    }
    el.addEventListener('click', onActivate);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') onActivate(e);
    });
    return el;
  },

  initResultSlipUpload: function () {
    if (this._resultSlipUploadInited) return;
    var btn = document.getElementById('fixture-result-slip-btn');
    if (!btn || typeof ResultSlipUpload === 'undefined') return;
    var self = this;
    ResultSlipUpload.init(btn, {
      onPhotoSelected: function (base64, mimeType, previewUrl) {
        self.handleResultSlipPhotoSelected(base64, mimeType, previewUrl);
      },
      onRemoveRequested: function () {
        self.handleResultSlipRemoveRequested();
      },
    });
    this._resultSlipUploadInited = true;
  },

  resetResultSlipSession: function () {
    this._slipPendingUploaded = false;
    this._slipHasCommitted = false;
    this._slipSaveSucceeded = false;
    if (typeof ResultSlipUpload !== 'undefined') {
      ResultSlipUpload.clearImage();
      ResultSlipUpload.setBusy(false);
    }
  },

  loadResultSlipForDialog: function (fixtureId) {
    var self = this;
    if (!fixtureId || typeof ApiClient === 'undefined') return Promise.resolve();
    return ApiClient.post('getResultSlip', { fixtureId: fixtureId })
      .then(function (res) {
        if (res && res.hasImage && res.imageUrl && typeof ResultSlipUpload !== 'undefined') {
          self._slipHasCommitted = true;
          ResultSlipUpload.setImage(res.imageUrl);
        }
      })
      .catch(function (err) {
        console.warn('Could not load result slip:', err);
      });
  },

  slipBrief: function (text, anchor) {
    if (typeof window.BriefMessage !== 'undefined' && window.BriefMessage.show) {
      window.BriefMessage.show(text, anchor, { durationMs: 1200 });
    }
  },

  handleResultSlipPhotoSelected: function (base64, mimeType) {
    var fixtureId = (document.getElementById('fixture-result-fixture-id') || {}).value || '';
    var btn = document.getElementById('fixture-result-slip-btn');
    if (!fixtureId) {
      this.slipBrief('Missing fixture', btn);
      return;
    }
    var self = this;
    if (typeof ResultSlipUpload !== 'undefined') ResultSlipUpload.setBusy(true);
    ApiClient.post('uploadResultSlip', {
      fixtureId: fixtureId,
      base64: base64,
      mimeType: mimeType || 'image/jpeg',
    })
      .then(function (res) {
        self._slipPendingUploaded = true;
        var url = res && res.imageUrl;
        if (typeof ResultSlipUpload !== 'undefined') {
          if (url) ResultSlipUpload.setImage(url);
          ResultSlipUpload.setBusy(false);
        }
        self.slipBrief('Photo uploaded', btn);
      })
      .catch(function (err) {
        if (typeof ResultSlipUpload !== 'undefined') {
          if (self._slipHasCommitted) self.loadResultSlipForDialog(fixtureId);
          else ResultSlipUpload.clearImage();
          ResultSlipUpload.setBusy(false);
        }
        self.slipBrief((err && err.message) || 'Upload failed', btn);
      });
  },

  handleResultSlipRemoveRequested: function () {
    var fixtureId = (document.getElementById('fixture-result-fixture-id') || {}).value || '';
    var btn = document.getElementById('fixture-result-slip-btn');
    var self = this;
    if (!fixtureId) return;
    if (typeof ResultSlipUpload !== 'undefined') ResultSlipUpload.setBusy(true);
    var action = this._slipHasCommitted ? 'removeResultSlip' : 'discardResultSlipSession';
    ApiClient.post(action, { fixtureId: fixtureId })
      .then(function () {
        self._slipPendingUploaded = false;
        self._slipHasCommitted = false;
        if (typeof ResultSlipUpload !== 'undefined') {
          ResultSlipUpload.clearImage();
          ResultSlipUpload.setBusy(false);
        }
        self.slipBrief('Photo removed', btn);
      })
      .catch(function (err) {
        if (typeof ResultSlipUpload !== 'undefined') ResultSlipUpload.setBusy(false);
        self.slipBrief((err && err.message) || 'Could not remove photo', btn);
      });
  },

  discardResultSlipSessionIfNeeded: function () {
    if (!this._slipPendingUploaded) return Promise.resolve();
    var fixtureId = (document.getElementById('fixture-result-fixture-id') || {}).value || '';
    if (!fixtureId || typeof ApiClient === 'undefined') {
      this._slipPendingUploaded = false;
      return Promise.resolve();
    }
    var self = this;
    return ApiClient.post('discardResultSlipSession', { fixtureId: fixtureId })
      .then(function () {
        self._slipPendingUploaded = false;
      })
      .catch(function (err) {
        console.warn('Could not discard pending result slip:', err);
        self._slipPendingUploaded = false;
      });
  },

  commitResultSlipIfNeeded: function (fixtureId) {
    if (!this._slipPendingUploaded || !fixtureId) return Promise.resolve();
    var self = this;
    return ApiClient.post('commitResultSlip', { fixtureId: fixtureId }).then(function () {
      self._slipPendingUploaded = false;
      self._slipHasCommitted = true;
    });
  },

  localISODate: function () {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },

  fixtureGroup: function (row) {
    return String(row['Group'] || row['League'] || '').trim();
  },

  bindLeagueFilter: function () {
    var self = this;
    document.querySelectorAll('input[name="league"]').forEach(function (rb) {
      rb.addEventListener('change', function () {
        self.highlightSelectedLeague();
        self.render().catch(function (e) {
          console.error(e);
        });
      });
    });
    this.highlightSelectedLeague();
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

  init: async function () {
    var container = document.getElementById('fixtures-list');
    if (!container) return;

    var self = this;
    window.addEventListener(this.adminModeEvent(), function () {
      self.render().catch(function (e) {
        console.error(e);
      });
    });
    window.addEventListener(
      typeof PlayerSession !== 'undefined' ? PlayerSession.EVENT_NAME : 'ierne-player-session-changed',
      function () {
        self.render().catch(function (e) {
          console.error(e);
        });
      }
    );

    if (typeof CurrentCompetition !== 'undefined') {
      if (typeof NavCompetition !== 'undefined') {
        NavCompetition.syncLeagueFiltersFromSession();
      }
      window.addEventListener(CurrentCompetition.EVENT_NAME, function () {
        self.refreshFilterAndRender().catch(function (e) {
          console.error(e);
        });
      });
    }

    if (typeof LeagueGroupFilter !== 'undefined') {
      LeagueGroupFilter.bindChange(function () {
        self.render().catch(function (e) {
          console.error(e);
        });
      });
    }
    this.bindResultDialog();
    this.ensureHandicapsLoaded();

    if (typeof CurrentCompetition !== 'undefined') {
      await CurrentCompetition.whenReady(function () {
        return self.refreshFilterAndRender();
      });
    } else {
      await this.render();
    }
  },

  unplayedLeagueFixtures: function (fixtures) {
    return (fixtures || []).filter(function (r) {
      var notPlayed = !r['Result'] || String(r['Result']).trim() === '';
      var stage = String(r.Stage || '').toLowerCase();
      if (stage === 'knockout') return false;
      return notPlayed && r['Game Week'] && r['Player A'] && r['Player B'];
    });
  },

  knockoutFixturesWithParticipants: function (fixtures) {
    return (fixtures || []).filter(function (r) {
      return r['Game Week'] && r['Player A'] && r['Player B'];
    });
  },

  /**
   * When the league has no unplayed fixtures but a linked knockout already has
   * matches, show that knockout as the now-showing competition.
   * @returns {Promise<boolean>}
   */
  maybePromoteToAssociatedKnockout: async function () {
    if (typeof CurrentCompetition === 'undefined') return false;
    var comp = CurrentCompetition.get();
    if (!comp || CurrentCompetition.isKnockout()) return false;
    var ko = CurrentCompetition.findAssociatedKnockout(comp);
    if (!ko) return false;
    var leagueId = CurrentCompetition.getCompId();
    var koId = ko.compId;
    if (!leagueId || !koId) return false;
    try {
      var leagueResult = await ApiClient.get({ action: 'getFixtures', comp: leagueId });
      if (this.unplayedLeagueFixtures(leagueResult.fixtures || []).length > 0) return false;
      var koResult = await ApiClient.get({ action: 'getFixtures', comp: koId });
      if (this.knockoutFixturesWithParticipants(koResult.fixtures || []).length === 0) return false;
      return CurrentCompetition.setCompId(koId, { allowKnockoutStage: true });
    } catch (e) {
      console.error('maybePromoteToAssociatedKnockout failed:', e);
      return false;
    }
  },

  refreshFilterAndRender: async function () {
    var promoted = await this.maybePromoteToAssociatedKnockout();
    if (promoted) return;
    if (typeof LeagueGroupFilter !== 'undefined') await LeagueGroupFilter.sync();
    return this.render();
  },

  bindResultDialog: function () {
    if (this._resultDialogBindingsDone) return;
    var dlg = document.getElementById('fixture-result-dialog');
    if (!dlg) return;
    this._resultDialogBindingsDone = true;

    var self = this;
    self.ensureFrameRacksBuilt();
    if (!self._frameRackDelegationBound) {
      self._frameRackDelegationBound = true;
      dlg.addEventListener('click', function (e) {
        var rack = e.target.closest('.fixture-frame-rack');
        if (!rack || !dlg.contains(rack)) return;
        var host = rack.closest('[data-frame-racks-for]');
        if (!host) return;
        var side = host.getAttribute('data-frame-racks-for');
        var action = rack.getAttribute('data-rack-action');
        if (side && (action === 'inc' || action === 'dec')) {
          self.adjustPlayerScore(side, action === 'inc' ? 1 : -1);
        }
      });
    }

    var cancelBtn = document.getElementById('fixture-result-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        dlg.close();
      });
    }
    dlg.addEventListener('close', function () {
      if (self._slipSuppressDiscardOnClose) return;
      if (self._slipSaveSucceeded) {
        self._slipSaveSucceeded = false;
        return;
      }
      self.discardResultSlipSessionIfNeeded();
    });

    var form = document.getElementById('fixture-result-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      self.submitResultDialog().catch(function (err) {
        var msg = document.getElementById('fixture-result-msg');
        if (msg) {
          msg.textContent = err.message || String(err);
          msg.hidden = false;
          msg.classList.add('msg--warning');
        }
      });
    });
    var dateEl = document.getElementById('fixture-result-date');
    if (dateEl && !dateEl.getAttribute('data-hc-label-bound')) {
      dateEl.setAttribute('data-hc-label-bound', '1');
      dateEl.addEventListener('change', function () {
        self.normalizeResultDialogMatchDate();
      });
      dateEl.addEventListener('blur', function () {
        self.normalizeResultDialogMatchDate();
      });
    }
    var pickerEl = document.getElementById('fixture-result-date-picker');
    if (pickerEl && !pickerEl.getAttribute('data-hc-label-bound')) {
      pickerEl.setAttribute('data-hc-label-bound', '1');
      pickerEl.addEventListener('change', function () {
        self.applyResultDialogPickerDate();
      });
      pickerEl.addEventListener('input', function () {
        self.applyResultDialogPickerDate();
      });
    }
  },

  /** window.confirm() can render behind an open modal dialog; close first, then restore if cancelled. */
  confirmClearingResult: function () {
    var dlg = document.getElementById('fixture-result-dialog');
    var dialogWasOpen = !!(dlg && dlg.open);
    this._slipSuppressDiscardOnClose = true;
    if (dialogWasOpen && typeof dlg.close === 'function') {
      dlg.close();
    }
    var confirmed = window.confirm(this.CLEAR_RESULT_CONFIRM_MSG);
    if (!confirmed && dialogWasOpen && dlg && typeof dlg.showModal === 'function') {
      dlg.showModal();
      var self = this;
      window.setTimeout(function () {
        self.focusResultDialogRoot();
      }, 0);
    }
    this._slipSuppressDiscardOnClose = false;
    return confirmed;
  },

  updateClearingResultWarning: function (scoreA, scoreB) {
    var msg = document.getElementById('fixture-result-msg');
    if (!msg) return;
    if (this._dialogOpenedWithResult && scoreA === 0 && scoreB === 0) {
      msg.textContent = this.CLEAR_RESULT_INLINE_MSG;
      msg.hidden = false;
      msg.classList.remove('msg--success');
      msg.classList.add('msg--warning');
      return;
    }
    if (msg.classList.contains('msg--warning') && !msg.classList.contains('msg--success')) {
      msg.textContent = '';
      msg.hidden = true;
      msg.classList.remove('msg--warning');
    }
  },

  createFrameRackSvg: function () {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '10 5.5 36 36');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'fixture-frame-rack-svg');
    svg.setAttribute('aria-hidden', 'true');
    var ballR = 3.35;
    var rowSpacing = 7.15;
    var colSpacing = 7.15;
    var cx0 = 28;
    var cy0 = 9;
    var r;
    var c;
    for (r = 0; r < 5; r++) {
      var n = r + 1;
      var y = cy0 + r * rowSpacing;
      for (c = 0; c < n; c++) {
        var x = cx0 + (c - (n - 1) / 2) * colSpacing;
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', String(ballR));
        circle.setAttribute('fill', '#c42032');
        circle.setAttribute('stroke', '#8f1422');
        circle.setAttribute('stroke-width', '0.55');
        svg.appendChild(circle);
      }
    }
    return svg;
  },

  ensureFrameRacksBuilt: function () {
    var self = this;
    ['a', 'b'].forEach(function (side) {
      var host = document.getElementById('fixture-frame-racks-' + side);
      if (!host) return;
      if (host.getAttribute('data-racks-built') === 'controls-h1') return;
      var num = document.getElementById('fixture-result-score-' + side + '-display');
      host.innerHTML = '';

      function makeBtn(action, inverted, label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fixture-frame-rack';
        if (inverted) btn.classList.add('fixture-frame-rack--inverted');
        btn.setAttribute('data-rack-action', action);
        btn.setAttribute('aria-label', label);
        var icon = document.createElement('span');
        icon.className = 'fixture-frame-rack-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(self.createFrameRackSvg());
        btn.appendChild(icon);
        return btn;
      }

      host.appendChild(makeBtn('dec', true, 'Decrease score'));
      if (num) host.appendChild(num);
      host.appendChild(makeBtn('inc', false, 'Increase score'));
      host.setAttribute('data-racks-built', 'controls-h1');
    });
  },

  applyCanonicalFrameAssignment: function (scoreA, scoreB) {
    var cap = this.framesToWin();
    this._playerScores = {
      a: Math.max(0, Math.min(Math.trunc(scoreA), cap)),
      b: Math.max(0, Math.min(Math.trunc(scoreB), cap)),
    };
  },

  refreshMatchFrameUI: function () {
    var scoreA = this.playerScore('a');
    var scoreB = this.playerScore('b');
    var framesToWin = this.framesToWin();
    document.getElementById('fixture-result-score-a').value = String(scoreA);
    document.getElementById('fixture-result-score-b').value = String(scoreB);
    var dispA = document.getElementById('fixture-result-score-a-display');
    var dispB = document.getElementById('fixture-result-score-b-display');
    if (dispA) dispA.textContent = String(scoreA);
    if (dispB) dispB.textContent = String(scoreB);

    var labelA = document.getElementById('fixture-result-label-a');
    var labelB = document.getElementById('fixture-result-label-b');
    if (labelA && labelB) {
      labelA.classList.remove(
        'fixture-result-player-name--winner',
        'fixture-result-player-name--loser'
      );
      labelB.classList.remove(
        'fixture-result-player-name--winner',
        'fixture-result-player-name--loser'
      );
      if (scoreA >= framesToWin) {
        labelA.classList.add('fixture-result-player-name--winner');
        labelB.classList.add('fixture-result-player-name--loser');
      } else if (scoreB >= framesToWin) {
        labelB.classList.add('fixture-result-player-name--winner');
        labelA.classList.add('fixture-result-player-name--loser');
      }
    }

    var self = this;
    ['a', 'b'].forEach(function (side) {
      var host = document.getElementById('fixture-frame-racks-' + side);
      if (!host) return;
      var myScore = self.playerScore(side);
      host.querySelectorAll('.fixture-frame-rack').forEach(function (rack) {
        var action = rack.getAttribute('data-rack-action');
        var disable =
          action === 'inc' ? !self.canIncrementScore(side) : action === 'dec' ? myScore <= 0 : true;
        rack.disabled = disable;
        rack.setAttribute('aria-label', self.frameRackAriaLabel(action, side));
      });
    });
    this.updateClearingResultWarning(scoreA, scoreB);
  },

  frameRackAriaLabel: function (action, side) {
    var score = this.playerScore(side);
    if (action === 'inc') {
      return 'Increase score (currently ' + score + ')';
    }
    if (action === 'dec') {
      return 'Decrease score (currently ' + score + ')';
    }
    return 'Adjust score';
  },

  focusResultDialogRoot: function () {
    var titleEl = document.getElementById('fixture-result-title');
    if (!titleEl) return;
    titleEl.setAttribute('tabindex', '-1');
    titleEl.focus({ preventScroll: true });
  },

  render: async function () {
    var container = document.getElementById('fixtures-list');
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

      var upcoming = data.filter(function (r) {
        var notPlayed = !r['Result'] || String(r['Result']).trim() === '';
        var hasParticipants = r['Game Week'] && r['Player A'] && r['Player B'];
        if (!notPlayed || !hasParticipants) return false;
        if (!isKnockout) {
          var stage = String(r.Stage || '').toLowerCase();
          if (stage === 'knockout') return false;
        }
        if (group === 'All') return true;
        return FixturesPage.fixtureGroup(r) === group;
      });

      if (upcoming.length === 0) {
        container.innerHTML = '<p><em>No upcoming fixtures found.</em></p>';
        return;
      }

      var winnersByCode = {};
      var sectionLabels = null;
      var grouped;
      if (isKnockout && typeof KnockoutRounds !== 'undefined') {
        winnersByCode = KnockoutRounds.buildRoundWinnersMap(data);
        var winnerIdsByCode = KnockoutRounds.buildRoundWinnerIdsMap
          ? KnockoutRounds.buildRoundWinnerIdsMap(data)
          : {};
        var koGroup = KnockoutRounds.groupForList(upcoming);
        grouped = { grouped: koGroup.grouped, orderedWeeks: koGroup.orderedKeys };
        sectionLabels = koGroup.labels;
      } else {
        grouped = this.groupByGameWeek(upcoming);
      }
      this.renderGroups(container, grouped.grouped, grouped.orderedWeeks, {
        isKnockout: isKnockout,
        winnersByCode: winnersByCode,
        winnerIdsByCode: typeof winnerIdsByCode !== 'undefined' ? winnerIdsByCode : {},
        sectionLabels: sectionLabels,
      });
    } catch (error) {
      console.error('Failed to load fixtures:', error);
      container.innerHTML = '<p><em>Error loading fixtures.</em></p>';
    }
  },

  groupByGameWeek: function (fixtures) {
    var grouped = {};
    var orderedWeeks = [];
    fixtures.forEach(function (f) {
      var week = String(f['Game Week']).trim();
      if (!grouped[week]) {
        grouped[week] = [];
        orderedWeeks.push(week);
      }
      grouped[week].push(f);
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

  /** True when both players are known (not still waiting on an earlier round). */
  fixtureResultReady: function (match, isKnockout, winnersByCode) {
    if (!isKnockout) return true;
    if (typeof KnockoutRounds === 'undefined') return true;
    winnersByCode = winnersByCode || {};

    function slotReady(slot) {
      var id = slot === 'a' ? match.playerAId : match.playerBId;
      if (!KnockoutRounds.isWinnerOfPlayerId(id)) return true;
      var code = KnockoutRounds.roundCodeFromWinnerOfId(id);
      return !!(code && winnersByCode[code]);
    }

    var labelA = String(this.knockoutPlayerLabel(match, 'a', winnersByCode)).trim();
    var labelB = String(this.knockoutPlayerLabel(match, 'b', winnersByCode)).trim();
    return slotReady('a') && slotReady('b') && !!labelA && !!labelB;
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
        div.className = 'fixture-row';
        div.style.display = 'flex';
        div.style.justifyContent = 'center';
        div.style.alignItems = 'center';
        div.style.gap = '1em';
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
        div.setAttribute('data-best-of', String(self.normalizeBestOf(match.bestOf)));
        var enteredBy = String(match.resultEnteredBy || '').trim();
        if (enteredBy) div.setAttribute('data-result-entered-by', enteredBy);
        var resultReady = self.fixtureResultReady(match, isKnockout, winnersByCode);
        div.setAttribute('data-result-ready', resultReady ? 'true' : 'false');

        var matchDate = match['Match Date'] || '';
        var playerA = self.makePlayerNameEl(nameA, pidA, matchDate, 'right');

        var center;
        var canEdit = self.canEditFixture(slotA, slotB, match.resultPostedAt || '');
        if (canEdit && fid && resultReady) {
          center = document.createElement('button');
          center.type = 'button';
          center.className = 'fixture-vs-btn';
          center.textContent = 'V';
          center.setAttribute(
            'aria-label',
            'Enter result for ' + nameA + ' vs ' + nameB
          );
          center.addEventListener('click', function () {
            self.openResultDialog(div);
          });
        } else {
          center = document.createElement('span');
          center.className = 'fixture-vs-static';
          center.textContent = 'V';
          if (self.isAdmin() && fid && !resultReady) {
            center.setAttribute(
              'title',
              'Result entry is available once both players are known'
            );
          }
        }
        center.style.flex = '0 0 auto';

        var playerB = self.makePlayerNameEl(nameB, pidB, matchDate, 'left');

        div.appendChild(playerA);
        div.appendChild(center);
        div.appendChild(playerB);
        container.appendChild(div);
      });
    });
  },

  normalizePlayerId: function (id) {
    return String(id == null ? '' : id).trim().toLowerCase();
  },

  /** Merge GET getBreaksForFixture into breaks fields + _loadedBreakIds (player ids normalized). */
  applyBreaksResponseToDialogFields: function (res) {
    var breaks = (res && res.breaks) || [];
    var hidA = document.getElementById('fixture-result-player-a-id');
    var hidB = document.getElementById('fixture-result-player-b-id');
    var cmpA = this.normalizePlayerId(hidA ? hidA.value : '');
    var cmpB = this.normalizePlayerId(hidB ? hidB.value : '');
    var valsA = [];
    var valsB = [];
    var self = this;
    breaks.forEach(function (b) {
      if (!b) return;
      var bid = b.breakId != null ? b.breakId : b.break_id;
      if (bid) self._loadedBreakIds.push(String(bid));
      var rawPid = b.playerId != null ? b.playerId : b.player_id;
      var cmpP = self.normalizePlayerId(rawPid);
      var val = Number(b.value);
      if (!Number.isFinite(val)) return;
      if (cmpP && cmpA && cmpP === cmpA) valsA.push(val);
      else if (cmpP && cmpB && cmpP === cmpB) valsB.push(val);
    });
    valsA.sort(function (x, y) {
      return x - y;
    });
    valsB.sort(function (x, y) {
      return x - y;
    });
    var fa = document.getElementById('fixture-breaks-field-a');
    var fb = document.getElementById('fixture-breaks-field-b');
    if (fa) fa.value = valsA.join(', ');
    if (fb) fb.value = valsB.join(', ');
  },

  clearBreakContainers: function () {
    var a = document.getElementById('fixture-breaks-field-a');
    var b = document.getElementById('fixture-breaks-field-b');
    if (a) a.value = '';
    if (b) b.value = '';
    this._loadedBreakIds = [];
  },

  /** Split break list using common delimiters (spaces, commas, slashes, etc.). Valid snooker break 1–155. */
  parseBreaksListString: function (raw) {
    if (!raw || !String(raw).trim()) return [];
    var parts = String(raw).split(/[\s,;/|:\\-]+/);
    var out = [];
    var i;
    for (i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (!t) continue;
      var n = parseInt(t, 10);
      if (!isNaN(n) && n >= 1 && n <= 155) out.push(n);
    }
    return out;
  },

  collectBreakRowsForSubmit: function (playerId, side) {
    var el = document.getElementById('fixture-breaks-field-' + side);
    if (!el || !playerId) return [];
    var nums = this.parseBreaksListString(el.value);
    return nums.map(function (value) {
      return { playerId: playerId, value: value };
    });
  },

  openResultDialog: function (rowEl) {
    var dlg = document.getElementById('fixture-result-dialog');
    if (!dlg || !rowEl) return;
    if (rowEl.getAttribute('data-result-ready') === 'false') return;

    var fid = String(rowEl.getAttribute('data-fixture-id') || '').trim();
    var pidA = String(rowEl.getAttribute('data-player-a-id') || '').trim();
    var pidB = String(rowEl.getAttribute('data-player-b-id') || '').trim();
    var nameA = rowEl.getAttribute('data-player-a-name');
    var nameB = rowEl.getAttribute('data-player-b-name');
    var prevDate = rowEl.getAttribute('data-match-date');
    this._openResultPostedAt = rowEl.getAttribute('data-result-posted-at') || '';
    this._currentBestOf = this.normalizeBestOf(rowEl.getAttribute('data-best-of'));
    if (!this.canEditFixture(pidA, pidB, this._openResultPostedAt)) return;

    document.getElementById('fixture-result-fixture-id').value = fid;
    document.getElementById('fixture-result-player-a-id').value = pidA;
    document.getElementById('fixture-result-player-b-id').value = pidB;

    this.updateDialogEnteredBy(rowEl.getAttribute('data-result-entered-by'));
    this.setResultDialogMatchDate(prevDate && String(prevDate).trim() ? prevDate : '');
    this.setResultDialogPlayerLabels(nameA, nameB);

    this.ensureFrameRacksBuilt();
    this.initPlayerScores();
    this._dialogOpenedWithResult = false;
    var hadResult = rowEl.getAttribute('data-had-result');
    if (hadResult === '1' || hadResult === 'true') {
      this._dialogOpenedWithResult = true;
    }
    var preA = rowEl.getAttribute('data-prefill-score-a');
    var preB = rowEl.getAttribute('data-prefill-score-b');
    if (preA != null && preB != null && preA !== '' && preB !== '') {
      var na = parseInt(preA, 10);
      var nb = parseInt(preB, 10);
      if (!isNaN(na) && !isNaN(nb) && na >= 0 && nb >= 0) {
        if (na > 0 || nb > 0) this._dialogOpenedWithResult = true;
        this.applyCanonicalFrameAssignment(na, nb);
      }
    }

    var racksA = document.getElementById('fixture-frame-racks-a');
    var racksB = document.getElementById('fixture-frame-racks-b');
    if (racksA) racksA.setAttribute('aria-label', 'Frames scored — ' + nameA);
    if (racksB) racksB.setAttribute('aria-label', 'Frames scored — ' + nameB);

    var msg = document.getElementById('fixture-result-msg');
    if (msg) {
      msg.textContent = '';
      msg.hidden = true;
      msg.classList.remove('msg--warning', 'msg--success');
    }
    this.refreshMatchFrameUI();

    this.clearBreakContainers();
    this.initResultSlipUpload();
    this.resetResultSlipSession();

    var self = this;
    function openDlg() {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      window.setTimeout(function () {
        self.focusResultDialogRoot();
      }, 0);
    }

    if (!fid) {
      openDlg();
      return;
    }

    Promise.all([
      ApiClient.get({ action: 'getBreaksForFixture', fixtureId: fid }),
      self.loadResultSlipForDialog(fid),
    ])
      .then(function (parts) {
        self.applyBreaksResponseToDialogFields(parts[0]);
        openDlg();
      })
      .catch(function (err) {
        var loadMsg = document.getElementById('fixture-result-msg');
        if (loadMsg) {
          var base =
            err && err.message ? String(err.message) : 'Could not load breaks for this match.';
          var extra =
            base.indexOf('Unknown action') !== -1 || base.indexOf('getBreaksForFixture') !== -1
              ? ' Deploy the latest `ierne-api` Edge Function (see docs/SUPABASE_SETUP.md).'
              : '';
          loadMsg.textContent = base + extra;
          loadMsg.hidden = false;
          loadMsg.classList.remove('msg--success');
          loadMsg.classList.add('msg--warning');
        }
        openDlg();
      });
  },

  submitResultDialog: async function () {
    var dlg = document.getElementById('fixture-result-dialog');
    var msg = document.getElementById('fixture-result-msg');
    var fixtureId = document.getElementById('fixture-result-fixture-id').value;
    var pidA = document.getElementById('fixture-result-player-a-id').value;
    var pidB = document.getElementById('fixture-result-player-b-id').value;
    var scoreA = parseInt(document.getElementById('fixture-result-score-a').value, 10) || 0;
    var scoreB = parseInt(document.getElementById('fixture-result-score-b').value, 10) || 0;
    var matchDate = this.resultDialogMatchDateISO();

    if (!fixtureId) throw new Error('Missing fixture');

    if (!matchDate) {
      throw new Error('Enter a valid match date (e.g. 31 Jan 2026).');
    }

    if (!this.canEditFixture(pidA, pidB, this._openResultPostedAt || '')) {
      throw new Error(
        'This result can only be changed within 24 hours of being posted, and only by a player in the match or an admin.'
      );
    }

    var clearing = scoreA === 0 && scoreB === 0;
    if (clearing && this._dialogOpenedWithResult) {
      if (!this.confirmClearingResult()) return;
    } else if (clearing) {
      if (msg) {
        msg.textContent = 'There must be a winner!';
        msg.hidden = false;
        msg.classList.remove('msg--success');
        msg.classList.add('msg--warning');
      }
      return;
    }

    if (!clearing && scoreA < this.framesToWin() && scoreB < this.framesToWin()) {
      if (msg) {
        msg.textContent = 'There must be a winner!';
        msg.hidden = false;
        msg.classList.remove('msg--success');
        msg.classList.add('msg--warning');
      }
      return;
    }

    var breaksA = this.collectBreakRowsForSubmit(pidA, 'a');
    var breaksB = this.collectBreakRowsForSubmit(pidB, 'b');

    if (msg) {
      msg.textContent = 'Saving…';
      msg.hidden = false;
      msg.classList.remove('msg--warning', 'msg--success');
    }

    await ApiClient.post(
      'updateFixtureResult',
      clearing
        ? { fixtureId: fixtureId, scoreA: null, scoreB: null, matchDate: matchDate }
        : { fixtureId: fixtureId, scoreA: scoreA, scoreB: scoreB, matchDate: matchDate }
    );

    var idsToDelete = this._loadedBreakIds.slice();
    for (var i = 0; i < idsToDelete.length; i++) {
      await ApiClient.post('deleteBreak', { breakId: idsToDelete[i] });
    }

    if (!clearing) {
      var combined = breaksA.concat(breaksB);
      for (var j = 0; j < combined.length; j++) {
        var row = combined[j];
        await ApiClient.post('upsertBreak', {
          fixtureId: fixtureId,
          playerId: row.playerId,
          value: row.value,
        });
      }
      await this.commitResultSlipIfNeeded(fixtureId);
    } else {
      this._slipPendingUploaded = false;
      this._slipHasCommitted = false;
      if (typeof ResultSlipUpload !== 'undefined') ResultSlipUpload.clearImage();
    }

    this._slipSaveSucceeded = true;

    if (msg) {
      msg.textContent = clearing ? 'Result cleared.' : 'Saved.';
      msg.classList.add('msg--success');
    }
    if (dlg) dlg.close();
    window.dispatchEvent(
      new CustomEvent(this.RESULT_SAVED_EVENT, { detail: { fixtureId: fixtureId } })
    );
    await this.render();
  },
};
