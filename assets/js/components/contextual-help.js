/**
 * Click-to-target contextual help.
 * Arm with [data-help-toggle], then the next pointer is explained (feature copy, never live records).
 */
window.ContextualHelp = (function () {
  'use strict';

  var armed = false;
  var popover = null;
  var hint = null;
  var swallowUntil = 0;
  var outsideTimer = 0;
  var inited = false;

  function catalog() {
    return window.IerneHelpCatalog || { pages: {}, topics: {} };
  }

  function isToggle(el) {
    return !!(el && el.closest && el.closest('[data-help-toggle]'));
  }

  function pageId() {
    if (document.body && document.body.dataset && document.body.dataset.page) {
      return document.body.dataset.page;
    }
    var path = (window.location.pathname || '').split('/').pop() || 'index.html';
    var name = path.replace(/\.html$/i, '');
    if (!name || name === 'index') return 'home';
    return name;
  }

  function pageTopic() {
    var cat = catalog();
    var pages = cat.pages || {};
    var id = pageId();
    return pages[id] || pages.home || { title: 'Help', body: 'Tap a control to learn what it does.' };
  }

  function resolve(target) {
    var el = target && target.closest ? target.closest('[data-help]') : null;
    var cat = catalog();
    if (el) {
      var key = el.getAttribute('data-help');
      var topic = cat.topics && cat.topics[key];
      if (topic) return { topic: topic, anchor: el };
    }
    var fallback = target && target.nodeType === 1 ? target : document.body;
    return { topic: pageTopic(), anchor: fallback };
  }

  function syncToggles() {
    var nodes = document.querySelectorAll('[data-help-toggle]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-pressed', armed ? 'true' : 'false');
    }
  }

  /** Native <dialog> is a top layer; a popover on body would sit behind it. */
  function mountParent(anchor) {
    var host = anchor && anchor.closest ? anchor.closest('dialog[open]') : null;
    if (host) return host;
    var dialogs = document.querySelectorAll('dialog[open]');
    if (dialogs.length) return dialogs[dialogs.length - 1];
    return document.body;
  }

  function showHint() {
    if (hint) return;
    hint = document.createElement('div');
    hint.className = 'help-hint';
    hint.textContent = 'Tap something to learn what it does.';
    mountParent(null).appendChild(hint);
  }

  function hideHint() {
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    hint = null;
  }

  function setArmed(on) {
    armed = !!on;
    if (document.body) document.body.classList.toggle('help-mode', armed);
    syncToggles();
    if (armed) showHint();
    else hideHint();
  }

  function closePopover() {
    if (outsideTimer) {
      clearTimeout(outsideTimer);
      outsideTimer = 0;
    }
    document.removeEventListener('pointerdown', onOutside, true);
    if (popover && popover.parentNode) popover.parentNode.removeChild(popover);
    popover = null;
  }

  function placePopover(anchor) {
    if (!popover) return;
    var pad = 8;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var rect = anchor && anchor.getBoundingClientRect
      ? anchor.getBoundingClientRect()
      : { left: vw / 2, right: vw / 2, top: vh / 3, bottom: vh / 3, width: 0, height: 0 };
    var box = popover.getBoundingClientRect();
    var w = box.width || Math.min(352, vw - 1.2 * 16);
    var h = box.height || 120;
    var left = rect.left + rect.width / 2 - w / 2;
    if (left < pad) left = pad;
    if (left + w > vw - pad) left = Math.max(pad, vw - pad - w);
    var top = rect.bottom + 10;
    if (top + h > vh - pad && rect.top - 10 - h >= pad) {
      top = rect.top - 10 - h;
    }
    if (top < pad) top = pad;
    if (top + h > vh - pad) top = Math.max(pad, vh - pad - h);
    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
  }

  function showPopover(topic, anchor) {
    closePopover();
    if (!topic) return;
    var root = document.createElement('div');
    root.className = 'help-popover';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-labelledby', 'helpPopoverTitle');
    var title = document.createElement('h3');
    title.id = 'helpPopoverTitle';
    title.textContent = topic.title || 'Help';
    var body = document.createElement('p');
    body.textContent = topic.body || '';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'help-popover__close';
    close.setAttribute('aria-label', 'Close help');
    close.textContent = '\u2715';
    close.addEventListener('click', closePopover);
    root.appendChild(close);
    root.appendChild(title);
    root.appendChild(body);
    mountParent(anchor).appendChild(root);
    popover = root;
    placePopover(anchor);
    outsideTimer = setTimeout(function () {
      outsideTimer = 0;
      document.addEventListener('pointerdown', onOutside, true);
    }, 0);
  }

  function onOutside(e) {
    if (!popover) {
      document.removeEventListener('pointerdown', onOutside, true);
      return;
    }
    if (popover.contains(e.target)) return;
    if (isToggle(e.target)) return;
    closePopover();
    document.removeEventListener('pointerdown', onOutside, true);
  }

  function finishHelp(target) {
    var found = resolve(target);
    setArmed(false);
    swallowUntil = Date.now() + 600;
    showPopover(found.topic, found.anchor);
  }

  function shouldSwallow() {
    return Date.now() <= swallowUntil;
  }

  function onPointerDown(e) {
    if (isToggle(e.target)) return;
    if (!armed) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    finishHelp(e.target);
  }

  function onClick(e) {
    if (isToggle(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      if (armed) {
        setArmed(false);
      } else {
        closePopover();
        setArmed(true);
      }
      swallowUntil = Date.now() + 400;
      return;
    }
    if (armed) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      finishHelp(e.target);
      return;
    }
    if (shouldSwallow()) {
      if (popover && popover.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (!armed && !popover) return;
    if (popover) closePopover();
    if (armed) setArmed(false);
    e.preventDefault();
  }

  function init() {
    if (inited) return;
    inited = true;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', function () {
      if (popover) closePopover();
    });
  }

  function boot() {
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    init: init,
    isArmed: function () {
      return armed;
    }
  };
})();
