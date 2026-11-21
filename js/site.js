/* Site behaviour that does not depend on three.js */
(function () {
  'use strict';

  /* Tenure since January 2023, counting the current month */
  var START = new Date(2023, 0, 1);
  var now = new Date();
  var months = (now.getFullYear() - START.getFullYear()) * 12 + (now.getMonth() - START.getMonth()) + 1;
  var y = Math.floor(months / 12), m = months % 12;
  var formats = {
    short: y + 'y' + (m ? ' ' + m + 'm' : ''),
    long: y + ' yrs' + (m ? ' ' + m + ' mo' : ''),
    words: y + ' year' + (y === 1 ? '' : 's') + (m ? ' ' + m + ' month' + (m === 1 ? '' : 's') : '')
  };
  document.querySelectorAll('[data-tenure]').forEach(function (el) {
    var f = formats[el.getAttribute('data-tenure')];
    if (f) el.textContent = f;
  });

  var year = document.getElementById('year');
  if (year) year.textContent = now.getFullYear();

  /* Nav background on scroll */
  var nav = document.getElementById('nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Mobile menu */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('open', open);
    nav.classList.toggle('menu-open', open);
  }
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* Active nav link */
  var navLinks = Array.prototype.slice.call(links.querySelectorAll('a[href^="#"]'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id); });
      });
    }, { rootMargin: '-45% 0px -54% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (s) { io.observe(s); });
  }

  /* Copy email */
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var label = btn.textContent;
      function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      }
    });
  });
})();
