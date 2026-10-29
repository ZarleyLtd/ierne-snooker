// Admin — player accounts and one-time registration / reset codes.

var AdminAccountsPage = (function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatWhen(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  var self = {
    accounts: [],

    adminEvt: function () {
      return typeof AdminMode !== 'undefined' ? AdminMode.EVENT_NAME : 'ierne-admin-mode-changed';
    },

    init: function () {
      this.cacheEls();
      var me = this;
      window.addEventListener(this.adminEvt(), function () {
        me.syncGate();
      });
      document.getElementById('adminAcPurpose').addEventListener('change', function () {
        me.syncPurpose();
      });
      document.getElementById('adminAcIssue').addEventListener('click', function () {
        me.issue();
      });
      this.syncPurpose();
      this.syncGate();
    },

    cacheEls: function () {
      this.el = {
        gate: document.getElementById('adminAccountsGate'),
        panel: document.getElementById('adminAccountsPanel'),
        msg: document.getElementById('adminAcMsg'),
        purpose: document.getElementById('adminAcPurpose'),
        label: document.getElementById('adminAcLabel'),
        account: document.getElementById('adminAcAccount'),
        accountField: document.getElementById('adminAcAccountField'),
        codeBox: document.getElementById('adminAcCodeBox'),
        invites: document.getElementById('adminAcInvites'),
        accounts: document.getElementById('adminAcAccounts'),
      };
    },

    flash: function (text, isErr) {
      if (!this.el.msg) return;
      this.el.msg.textContent = text || '';
      this.el.msg.className = 'msg' + (isErr ? ' msg--warning' : ' msg--success');
      this.el.msg.hidden = !text;
    },

    syncPurpose: function () {
      var reset = this.el.purpose && this.el.purpose.value === 'reset';
      if (this.el.accountField) this.el.accountField.hidden = !reset;
    },

    syncGate: function () {
      var ok = typeof AdminMode !== 'undefined' && AdminMode.isUnlocked();
      if (this.el.gate) this.el.gate.hidden = ok;
      if (this.el.panel) this.el.panel.hidden = !ok;
      if (ok) this.load();
    },

    load: function () {
      var me = this;
      if (typeof AdminMode === 'undefined' || !AdminMode.isUnlocked()) return;
      Promise.all([
        ApiClient.post('listAccounts', {}),
        ApiClient.post('listInvites', {}),
      ])
        .then(function (results) {
          me.accounts = results[0].accounts || [];
          me.renderAccounts(me.accounts);
          me.renderInvites(results[1].invites || []);
          me.fillAccountSelect(me.accounts);
        })
        .catch(function (err) {
          me.flash(err.message || 'Could not load accounts', true);
        });
    },

    fillAccountSelect: function (accounts) {
      var select = this.el.account;
      if (!select) return;
      var current = select.value;
      var html = '<option value="">Choose an account</option>';
      accounts.forEach(function (account) {
        html +=
          '<option value="' +
          esc(account.id) +
          '">' +
          esc(account.handle) +
          ' · ' +
          esc(account.playerName || account.playerId) +
          (account.disabled ? ' (disabled)' : '') +
          '</option>';
      });
      select.innerHTML = html;
      if (current) select.value = current;
    },

    renderAccounts: function (accounts) {
      var me = this;
      var host = this.el.accounts;
      if (!host) return;
      if (!accounts.length) {
        host.innerHTML = '<p class="admin-player-picks__hint"><em>No player accounts yet.</em></p>';
        return;
      }
      host.innerHTML = accounts
        .map(function (account) {
          return (
            '<div class="admin-player-picks__row admin-item-list__row">' +
            '<span class="admin-player-picks__name">' +
            esc(account.handle) +
            '</span>' +
            '<span class="admin-item-list__meta">' +
            esc(account.playerName || account.playerId) +
            (account.disabled ? ' · disabled' : '') +
            (account.lastSeenAt ? ' · last seen ' + esc(formatWhen(account.lastSeenAt)) : '') +
            '</span>' +
            (account.disabled
              ? ''
              : '<button type="button" class="btn" data-disable="' +
                esc(account.id) +
                '">Disable</button>') +
            '</div>'
          );
        })
        .join('');
      host.querySelectorAll('[data-disable]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-disable');
          var account = me.accounts.find(function (row) {
            return row.id === id;
          });
          var name = account ? account.handle : 'this account';
          if (!window.confirm('Disable ' + name + '? They will be signed out and will not be able to connect.')) {
            return;
          }
          ApiClient.post('disableAccount', { accountId: id })
            .then(function () {
              me.flash('Account disabled.', false);
              me.load();
            })
            .catch(function (err) {
              me.flash(err.message || 'Could not disable account', true);
            });
        });
      });
    },

    renderInvites: function (invites) {
      var me = this;
      var host = this.el.invites;
      if (!host) return;
      if (!invites.length) {
        host.innerHTML = '<p class="admin-player-picks__hint"><em>No unused codes.</em></p>';
        return;
      }
      host.innerHTML = invites
        .map(function (invite) {
          var who = invite.purpose === 'reset'
            ? 'reset for ' + (invite.handle || 'account')
            : 'register';
          if (invite.label) who += ' · ' + invite.label;
          return (
            '<div class="admin-player-picks__row admin-item-list__row">' +
            '<span class="admin-player-picks__name">' +
            esc(who) +
            '</span>' +
            '<span class="admin-item-list__meta">expires ' +
            esc(formatWhen(invite.expiresAt)) +
            '</span>' +
            '<button type="button" class="btn" data-revoke="' +
            esc(invite.id) +
            '">Revoke</button>' +
            '</div>'
          );
        })
        .join('');
      host.querySelectorAll('[data-revoke]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          ApiClient.post('revokeInvite', { inviteId: btn.getAttribute('data-revoke') })
            .then(function () {
              me.flash('Code revoked.', false);
              me.load();
            })
            .catch(function (err) {
              me.flash(err.message || 'Could not revoke code', true);
            });
        });
      });
    },

    issue: function () {
      var me = this;
      var purpose = this.el.purpose.value;
      var payload = {
        purpose: purpose,
        label: this.el.label.value,
      };
      if (purpose === 'reset') {
        payload.accountId = this.el.account.value;
        if (!payload.accountId) {
          this.flash('Choose the account that needs a reset code.', true);
          return;
        }
      }
      this.flash('Issuing code…', false);
      ApiClient.post('issueInvite', payload)
        .then(function (r) {
          var expires = formatWhen(r.expiresAt);
          me.el.codeBox.hidden = false;
          me.el.codeBox.innerHTML =
            '<p>Shown once. Send this ' +
            esc(purpose) +
            ' code, then it cannot be looked up again.</p>' +
            '<p class="account-code">' +
            esc(r.code) +
            '</p>' +
            '<p>Expires ' +
            esc(expires) +
            '.</p>';
          me.el.label.value = '';
          me.flash('Code created.', false);
          me.load();
        })
        .catch(function (err) {
          me.flash(err.message || 'Could not issue code', true);
        });
    },
  };

  return self;
})();
