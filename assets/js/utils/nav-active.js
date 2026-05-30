/**
 * Sets the active class on the navigation menu item that matches the current page
 */
(function () {
  function setActiveNavItem() {
    var pathParts = window.location.pathname.split('/');
    var currentPage = pathParts[pathParts.length - 1] || 'index.html';
    var isHomePage =
      currentPage === '' || currentPage === 'index.html' || pathParts[pathParts.length - 1] === '';

    var navLinks = document.querySelectorAll('.navbar__menu li a');
    if (navLinks.length === 0) return;

    navLinks.forEach(function (link) {
      if (link.parentElement) link.parentElement.classList.remove('active');
    });

    var effectivePage = currentPage;
    if (currentPage === 'admin-player.html') {
      effectivePage = 'admin-players.html';
    }

    navLinks.forEach(function (link) {
      var linkHref = link.getAttribute('href');
      if (linkHref === effectivePage) {
        if (link.parentElement) link.parentElement.classList.add('active');
        return;
      }
      if (isHomePage && (linkHref === 'index.html' || linkHref === './index.html')) {
        if (link.parentElement) link.parentElement.classList.add('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setActiveNavItem);
  } else {
    setActiveNavItem();
  }
})();
