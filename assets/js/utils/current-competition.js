// Shared "current competition" context for public pages.
// Several comps can be isCurrent (e.g. league + knockout).
// The selected comp drives the home carousel and optional ?comp= on reads.

var CurrentCompetition = (function () {
  var STORAGE_KEY = 'ierneCurrentCompId';
  var EVENT_NAME = 'ierne-current-competition-changed';

  var _comps = [];
  var _current = null;
  var _ready = false;
  var _initPromise = null;

  function isKnockoutComp(comp) {
    if (!comp) return false;
    var type = String(comp.competitionType || comp.competition_type || '')
      .trim()
      .toLowerCase();
    if (type === 'knockout') return true;
    if (type === 'league') return false;
    var id = String(comp.compId || comp.competition_id || '').toLowerCase();
    if (id.indexOf('knockout') !== -1 || id.indexOf('-ko') !== -1) return true;
    var name = String(comp.name || '');
    if (/\bk\/o\b/i.test(name) || /knockout/i.test(name)) return true;
    return false;
  }

  function currentComps() {
    return (_comps || []).filter(function (c) {
      return c && c.isCurrent;
    });
  }

  function findComp(compId) {
    if (!compId) return null;
    return (
      (_comps || []).find(function (c) {
        return String(c.compId) === String(compId);
      }) || null
    );
  }

  function readUrlCompId() {
    try {
      return new URLSearchParams(window.location.search).get('comp');
    } catch (_e) {
      return null;
    }
  }

  function readStoredCompId() {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch (_e) {
      return null;
    }
  }

  function writeStoredCompId(compId) {
    try {
      if (compId) sessionStorage.setItem(STORAGE_KEY, compId);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  function defaultCompId() {
    var active = currentComps();
    if (!active.length) return null;
    var league = active.find(function (c) {
      return !isKnockoutComp(c);
    });
    return (league || active[0]).compId;
  }

  function pickInitialCompId() {
    var active = currentComps();
    if (!active.length) return null;

    var urlId = readUrlCompId();
    if (urlId && findComp(urlId) && findComp(urlId).isCurrent) return urlId;

    var stored = readStoredCompId();
    if (stored && findComp(stored) && findComp(stored).isCurrent) return stored;

    return defaultCompId();
  }

  function dispatchChange() {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          comp: _current,
          compId: _current ? _current.compId : null,
        },
      })
    );
  }

  function syncUrl(compId) {
    try {
      var url = new URL(window.location.href);
      if (compId) url.searchParams.set('comp', compId);
      else url.searchParams.delete('comp');
      window.history.replaceState({}, '', url.toString());
    } catch (_e) {
      /* ignore */
    }
  }

  return {
    EVENT_NAME: EVENT_NAME,

    init: function () {
      if (_initPromise) return _initPromise;
      _initPromise = ApiClient.get({ action: 'getCompetitions' })
        .then(function (res) {
          _comps = res.competitions || [];
          var id = pickInitialCompId();
          _current = id ? findComp(id) : null;
          if (!_current && _comps.length) {
            _current = findComp(defaultCompId());
          }
          writeStoredCompId(_current ? _current.compId : null);
          _ready = true;
          dispatchChange();
          return _current;
        })
        .catch(function (err) {
          console.error('CurrentCompetition.init failed:', err);
          _ready = true;
          throw err;
        });
      return _initPromise;
    },

    ready: function () {
      return _ready;
    },

    allComps: function () {
      return _comps.slice();
    },

    currentComps: currentComps,

    get: function () {
      return _current;
    },

    getCompId: function () {
      return _current ? _current.compId : null;
    },

    isKnockoutComp: isKnockoutComp,

    isKnockout: function () {
      return isKnockoutComp(_current);
    },

    isLeague: function () {
      return !!(_current && !isKnockoutComp(_current));
    },

    setCompId: function (compId, options) {
      var opts = options || {};
      var next = findComp(compId);
      if (!next || !next.isCurrent) return false;
      if (_current && _current.compId === next.compId) return true;
      _current = next;
      writeStoredCompId(next.compId);
      if (opts.syncUrl !== false) syncUrl(next.compId);
      dispatchChange();
      return true;
    },

    apiParams: function () {
      var id = this.getCompId();
      return id ? { comp: id } : {};
    },

    whenReady: function (fn) {
      return this.init().then(fn);
    },
  };
})();
