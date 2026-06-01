// Home Page — swipeable cards for each current competition.
// League cards show group leaders; knockout cards show the full draw (latest round first).

const IndexPage = {
  _carouselIndex: 0,
  _dragStartX: null,
  _dragActive: false,
  _swipeBound: false,

  viewport: function () {
    return document.getElementById('home-carousel-viewport');
  },

  track: function () {
    return document.getElementById('home-carousel-track');
  },

  slides: function () {
    var track = IndexPage.track();
    return track ? track.querySelectorAll('.home-carousel__slide') : [];
  },

  topPlayersLabel: function (rows) {
    var sorted = LeagueStandings.sort(rows || []);
    if (!sorted.length) return 'N/A';
    var topPts = Formatters.toInt(sorted[0].Pts, 0);
    var topPM = Formatters.toInt(sorted[0]['+/-'], 0);
    var leaders = sorted.filter(function (r) {
      return Formatters.toInt(r.Pts, 0) === topPts && Formatters.toInt(r['+/-'], 0) === topPM;
    });
    if (leaders.length === 0) return sorted[0]['Player Name'] || 'N/A';
    if (leaders.length === 1) return leaders[0]['Player Name'];
    return (
      leaders
        .map(function (r) {
          return r['Player Name'];
        })
        .join(' & ') + ' (tied)'
    );
  },

  buildLeagueCard: function (comp, groups) {
    var card = document.createElement('article');
    card.className = 'home-comp-card home-comp-card--league';
    card.setAttribute('data-comp-id', comp.compId);

    var html = '';
    html +=
      '<h2 class="home-comp-card__title align-center"><span style="color:#169179;">' +
      this.esc(comp.name) +
      '</span></h2>';
    html += '<p class="align-center home-comp-card__subtitle">League stage &mdash; current leaders</p>';

    (groups || []).forEach(function (grp) {
      var label = IndexPage.topPlayersLabel(grp.rows || []);
      html += '<div class="home-leader-group">';
      html +=
        '<h3 class="align-center"><span style="color:#169179;">' +
        IndexPage.esc(grp.name || grp.groupId) +
        '</span></h3>';
      html +=
        '<h3 class="align-center"><span class="home-comp-card__leader">' +
        IndexPage.esc(label) +
        '</span></h3>';
      html += '</div>';
    });

    if (!(groups || []).length) {
      html += '<p class="align-center"><em>No groups yet</em></p>';
    }

    card.innerHTML = html;
    return card;
  },

  buildKnockoutCard: function (comp, fixtures) {
    var card = document.createElement('article');
    card.className = 'home-comp-card home-comp-card--knockout';
    card.setAttribute('data-comp-id', comp.compId);

    var html = '';
    html +=
      '<h2 class="home-comp-card__title align-center"><span style="color:#169179;">' +
      this.esc(comp.name) +
      '</span></h2>';

    var rounds =
      typeof KnockoutRounds !== 'undefined'
        ? KnockoutRounds.groupFixtures(fixtures, true)
        : [];

    if (!rounds.length) {
      html += '<p class="align-center home-comp-card__subtitle"><em>No fixtures yet</em></p>';
      card.innerHTML = html;
      return card;
    }

    html += '<p class="align-center home-comp-card__subtitle">Knockout draw</p>';
    html += '<div class="home-comp-card__bracket"></div>';
    card.innerHTML = html;

    var bracket = card.querySelector('.home-comp-card__bracket');
    var winnersByCode =
      typeof KnockoutRounds !== 'undefined' && KnockoutRounds.buildRoundWinnersMap
        ? KnockoutRounds.buildRoundWinnersMap(fixtures)
        : {};
    rounds.forEach(function (round) {
      var section = document.createElement('section');
      section.className = 'knockout-round';

      var heading = document.createElement('h3');
      heading.className = 'knockout-round__heading align-center';
      heading.textContent = round.label || round.code;
      section.appendChild(heading);

      var list = document.createElement('div');
      list.className = 'knockout-round__matches';

      round.matches.forEach(function (match) {
        KnockoutRenderer.renderRow(list, match, winnersByCode);
      });

      section.appendChild(list);
      bracket.appendChild(section);
    });

    return card;
  },

  esc: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  loadCardData: async function (comp) {
    if (CurrentCompetition.isKnockoutComp(comp)) {
      var fx = await ApiClient.get({ action: 'getFixtures', comp: comp.compId });
      return IndexPage.buildKnockoutCard(comp, fx.fixtures || []);
    }

    var st = await ApiClient.get({ action: 'getStandings', comp: comp.compId });
    return IndexPage.buildLeagueCard(comp, st.groups || []);
  },

  renderCarousel: async function () {
    var track = document.getElementById('home-carousel-track');
    var dots = document.getElementById('home-carousel-dots');
    if (!track || !dots) return;

    var comps = CurrentCompetition.currentComps();
    track.innerHTML = '';
    dots.innerHTML = '';

    if (!comps.length) {
      track.innerHTML = '<p class="align-center"><em>No current competitions.</em></p>';
      IndexPage.updateCarouselHint(0);
      return;
    }

    var cards = await Promise.all(
      comps.map(function (comp) {
        return IndexPage.loadCardData(comp);
      })
    );

    cards.forEach(function (card, idx) {
      var slide = document.createElement('div');
      slide.className = 'home-carousel__slide';
      slide.appendChild(card);
      track.appendChild(slide);

      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'home-carousel__dot';
      dot.setAttribute('aria-label', 'Show competition ' + (idx + 1));
      dot.addEventListener('click', function () {
        IndexPage.goToSlide(idx, true);
      });
      dots.appendChild(dot);
    });

    var selectedId = CurrentCompetition.getCompId();
    var startIdx = comps.findIndex(function (c) {
      return c.compId === selectedId;
    });
    IndexPage._carouselIndex = startIdx >= 0 ? startIdx : 0;
    IndexPage.updateCarouselHint(comps.length);
    IndexPage.bindCarouselControls();
    IndexPage.updateCarouselPosition(false);
  },

  updateCarouselHint: function (compCount) {
    var hint = document.querySelector('.home-carousel__hint');
    if (!hint) return;
    hint.hidden = compCount <= 1;
  },

  bindCarouselControls: function () {
    if (IndexPage._swipeBound) return;
    IndexPage._swipeBound = true;

    var prev = document.getElementById('home-carousel-prev');
    var next = document.getElementById('home-carousel-next');
    if (prev) {
      prev.addEventListener('click', function () {
        IndexPage.goToSlide(IndexPage._carouselIndex - 1, true);
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        IndexPage.goToSlide(IndexPage._carouselIndex + 1, true);
      });
    }

    var viewport = IndexPage.viewport();
    if (!viewport) return;

    viewport.addEventListener(
      'touchstart',
      function (e) {
        if (!e.touches || !e.touches.length) return;
        IndexPage._dragStartX = e.touches[0].clientX;
        IndexPage._dragActive = true;
      },
      { passive: true }
    );

    viewport.addEventListener(
      'touchend',
      function (e) {
        IndexPage.finishDrag(
          e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null
        );
      },
      { passive: true }
    );

    viewport.addEventListener('touchcancel', function () {
      IndexPage._dragStartX = null;
      IndexPage._dragActive = false;
    });

    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      IndexPage._dragStartX = e.clientX;
      IndexPage._dragActive = true;
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') return;
      IndexPage.finishDrag(e.clientX);
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_err) {
        /* ignore */
      }
    });

    viewport.addEventListener('pointercancel', function (e) {
      if (e.pointerType === 'touch') return;
      IndexPage._dragStartX = null;
      IndexPage._dragActive = false;
    });

    window.addEventListener('resize', function () {
      IndexPage.updateCarouselPosition(false);
    });
  },

  finishDrag: function (endX) {
    if (!IndexPage._dragActive || IndexPage._dragStartX == null || endX == null) {
      IndexPage._dragStartX = null;
      IndexPage._dragActive = false;
      return;
    }
    var delta = endX - IndexPage._dragStartX;
    IndexPage._dragStartX = null;
    IndexPage._dragActive = false;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) {
      IndexPage.goToSlide(IndexPage._carouselIndex + 1, true);
    } else {
      IndexPage.goToSlide(IndexPage._carouselIndex - 1, true);
    }
  },

  syncViewportHeight: function () {
    var viewport = IndexPage.viewport();
    var slides = IndexPage.slides();
    if (!viewport || !slides.length) return;
    var slide = slides[IndexPage._carouselIndex];
    if (!slide) return;
    viewport.style.height = slide.offsetHeight + 'px';
  },

  updateArrows: function () {
    var comps = CurrentCompetition.currentComps();
    var prev = document.getElementById('home-carousel-prev');
    var next = document.getElementById('home-carousel-next');
    var count = comps.length;
    var idx = IndexPage._carouselIndex;

    if (prev) {
      var showPrev = count > 1 && idx > 0;
      prev.hidden = !showPrev;
      prev.disabled = !showPrev;
    }
    if (next) {
      var showNext = count > 1 && idx < count - 1;
      next.hidden = !showNext;
      next.disabled = !showNext;
    }
  },

  scrollPageToTop: function () {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  },

  goToSlide: function (index, syncCompetition) {
    var track = IndexPage.track();
    var comps = CurrentCompetition.currentComps();
    if (!track || !comps.length) return;

    var max = comps.length - 1;
    var next = Math.max(0, Math.min(index, max));
    if (next === IndexPage._carouselIndex && !syncCompetition) {
      IndexPage.syncViewportHeight();
      IndexPage.updateArrows();
      return;
    }
    IndexPage._carouselIndex = next;
    IndexPage.updateCarouselPosition(true);

    if (syncCompetition) {
      CurrentCompetition.setCompId(comps[next].compId);
    }

    IndexPage.scrollPageToTop();
  },

  updateCarouselPosition: function (animate) {
    var track = IndexPage.track();
    var viewport = IndexPage.viewport();
    var dots = document.querySelectorAll('.home-carousel__dot');
    var slides = IndexPage.slides();
    if (!track || !viewport) return;

    var slideWidth = viewport.offsetWidth;
    slides.forEach(function (slide) {
      slide.style.flexBasis = slideWidth + 'px';
      slide.style.width = slideWidth + 'px';
    });

    track.style.transition = animate ? 'transform 0.35s ease' : 'none';
    track.style.transform = 'translateX(-' + IndexPage._carouselIndex * slideWidth + 'px)';

    dots.forEach(function (dot, idx) {
      dot.classList.toggle('is-active', idx === IndexPage._carouselIndex);
      dot.setAttribute('aria-current', idx === IndexPage._carouselIndex ? 'true' : 'false');
    });

    window.requestAnimationFrame(function () {
      IndexPage.syncViewportHeight();
      IndexPage.updateArrows();
    });
  },

  init: async function () {
    var root = document.getElementById('home-carousel');
    if (!root) return;

    await CurrentCompetition.whenReady(function () {
      return IndexPage.renderCarousel();
    });

    window.addEventListener(CurrentCompetition.EVENT_NAME, function (ev) {
      var comps = CurrentCompetition.currentComps();
      var idx = comps.findIndex(function (c) {
        return c.compId === (ev.detail && ev.detail.compId);
      });
      if (idx >= 0 && idx !== IndexPage._carouselIndex) {
        IndexPage.goToSlide(idx, false);
      }
    });
  },
};
