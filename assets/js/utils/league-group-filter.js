// Group radio filter for fixtures and results (per current competition).
// No "All" radio: none selected = all groups. Clicking the selected group clears it.

var LeagueGroupFilter = {
  KNOCKOUT_GROUP_ID: 'ko',

  _changeBound: false,
  /** Radio that was already checked at pointerdown (candidate to clear on click). */
  _wasCheckedInput: null,
  _suppressChange: false,

  selected: function () {
    var el = document.querySelector('input[name="league"]:checked');
    return el ? el.value : 'All';
  },

  highlightSelected: function () {
    var selected = document.querySelector('input[name="league"]:checked');
    document.querySelectorAll('.league-label').forEach(function (label) {
      var input = label.querySelector('input[name="league"]');
      label.classList.toggle(
        'is-selected',
        !!(selected && input && input.value === selected.value)
      );
    });
  },

  _radioFromEvent: function (container, e) {
    var t = e.target;
    if (!t) return null;
    if (t.name === 'league' && t.type === 'radio') return t;
    var label = t.closest ? t.closest('.league-label') : null;
    if (!label || !container.contains(label)) return null;
    return label.querySelector('input[name="league"]');
  },

  clearSelection: function () {
    document.querySelectorAll('input[name="league"]').forEach(function (rb) {
      rb.checked = false;
    });
    this.highlightSelected();
  },

  bindChange: function (onChange) {
    var container = document.getElementById('filter-container');
    if (!container || typeof onChange !== 'function') return;
    if (this._changeBound) return;
    this._changeBound = true;

    container.addEventListener(
      'pointerdown',
      function (e) {
        var input = LeagueGroupFilter._radioFromEvent(container, e);
        LeagueGroupFilter._wasCheckedInput = input && input.checked ? input : null;
      },
      true
    );

    container.addEventListener(
      'click',
      function (e) {
        var input = LeagueGroupFilter._radioFromEvent(container, e);
        if (!input) return;

        if (LeagueGroupFilter._wasCheckedInput === input) {
          e.preventDefault();
          e.stopPropagation();
          LeagueGroupFilter._suppressChange = true;
          input.checked = false;
          LeagueGroupFilter._wasCheckedInput = null;
          LeagueGroupFilter.highlightSelected();
          requestAnimationFrame(function () {
            if (input.checked) input.checked = false;
            LeagueGroupFilter._suppressChange = false;
            LeagueGroupFilter.highlightSelected();
            onChange();
          });
          return;
        }

        LeagueGroupFilter._wasCheckedInput = null;
      },
      true
    );

    container.addEventListener('change', function (e) {
      if (!e.target || e.target.name !== 'league') return;
      if (LeagueGroupFilter._suppressChange) return;
      LeagueGroupFilter._wasCheckedInput = null;
      LeagueGroupFilter.highlightSelected();
      onChange();
    });
  },

  createLabel: function (value, text) {
    var label = document.createElement('label');
    label.className = 'league-label';
    label.setAttribute('data-help', 'page.group');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'league';
    input.value = value;
    label.appendChild(input);
    label.appendChild(document.createTextNode(text));
    return label;
  },

  /** Rebuild #filter-container from getCompetitionGroups for the current competition. */
  sync: async function (options) {
    var opts = options || {};
    var container = document.getElementById('filter-container');
    if (!container) return;

    if (typeof CurrentCompetition !== 'undefined' && CurrentCompetition.isKnockout()) {
      return;
    }

    var compId =
      opts.compId ||
      (typeof CurrentCompetition !== 'undefined' ? CurrentCompetition.getCompId() : null);
    if (!compId) return;

    var prev = this.selected();
    var res = await ApiClient.get({ action: 'getCompetitionGroups', compId: compId });
    var groups = (res.groups || []).filter(function (g) {
      return String(g.groupId) !== LeagueGroupFilter.KNOCKOUT_GROUP_ID;
    });

    container.innerHTML = '';

    groups.forEach(function (g) {
      container.appendChild(
        LeagueGroupFilter.createLabel(String(g.groupId), g.name || g.groupId)
      );
    });

    var valid = groups.map(function (g) {
      return String(g.groupId);
    });
    var pick = prev !== 'All' && valid.indexOf(prev) >= 0 ? prev : '';
    container.querySelectorAll('input[name="league"]').forEach(function (rb) {
      rb.checked = pick !== '' && rb.value === pick;
    });

    this.highlightSelected();
  },
};
