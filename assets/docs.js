// Shared Docsify configuration for the reference guides (dotnet/, python/).
// Each guide sets window.guide = { id, name, color } before loading this file.
(function () {
  var guide = window.guide || {};

  // Keep Docsify's own sidebar toggle and route lifecycle. No second menu.
  function guideChrome(hook, vm) {
    var toggle, sidebar;
    var compact = window.matchMedia('(max-width: 1023px)');
    function isOpen() { return !document.body.classList.contains('close'); }
    function syncMenu() {
      if (!toggle || !sidebar) return;
      toggle.setAttribute('aria-expanded', String(isOpen()));
      sidebar.inert = !isOpen();
    }
    function closeMenu() {
      if (isOpen()) toggle.click();
      toggle.focus();
    }
    function localize() {
      var search = document.querySelector('.search input');
      if (search) search.setAttribute('aria-label', 'Hledat v příručce ' + guide.name);
      var clear = document.querySelector('.search .clear-button');
      if (clear) {
        clear.setAttribute('role', 'button');
        clear.setAttribute('tabindex', '0');
        clear.setAttribute('aria-label', 'Vymazat hledání');
      }
      document.querySelectorAll('.docsify-copy-code-button').forEach(function (button) {
        button.setAttribute('aria-label', 'Kopírovat kód');
        button.setAttribute('aria-live', 'polite');
      });
      document.querySelectorAll('.markdown-section pre > code, .markdown-section table').forEach(function (region) {
        region.setAttribute('tabindex', '0');
        region.setAttribute('aria-label', region.tagName === 'TABLE' ? 'Tabulka – lze posouvat vodorovně' : 'Ukázka kódu – lze posouvat vodorovně');
      });
      var article = document.querySelector('.markdown-section');
      if (article) {
        // Leave all existing heading IDs untouched.
        article.setAttribute('tabindex', '-1');
      }
    }
    hook.mounted(function () {
      toggle = document.querySelector('.sidebar-toggle');
      sidebar = document.querySelector('.sidebar');
      if (!toggle || !sidebar) return;
      sidebar.id = 'guide-sidebar';
      sidebar.setAttribute('aria-label', 'Obsah příručky ' + guide.name);
      toggle.setAttribute('aria-label', 'Obsah příručky');
      toggle.setAttribute('aria-controls', sidebar.id);
      // Docsify 4 scrolls anchors itself, so CSS scroll-padding alone is insufficient.
      function updateAnchorOffset() { vm.config.topMargin = toggle.getBoundingClientRect().bottom + 20; }
      updateAnchorOffset();
      window.addEventListener('resize', updateAnchorOffset);
      if (compact.matches) document.body.classList.add('close');
      syncMenu();
      new MutationObserver(syncMenu).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      toggle.addEventListener('click', function () {
        syncMenu();
        if (isOpen() && compact.matches) {
          var input = sidebar.querySelector('input');
          if (input) input.focus();
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isOpen()) { event.preventDefault(); closeMenu(); }
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.search .clear-button')) {
          event.preventDefault(); event.target.click();
          sidebar.querySelector('input').focus();
        }
      });
      document.addEventListener('click', function (event) {
        if (compact.matches && isOpen() && !sidebar.contains(event.target) && !toggle.contains(event.target)) closeMenu();
      });
      compact.addEventListener('change', function () {
        document.body.classList.toggle('close', compact.matches);
        if (sidebar.contains(document.activeElement)) toggle.focus();
        syncMenu();
      });
      document.querySelector('.skip-link').addEventListener('click', function (event) {
        event.preventDefault();
        var article = document.getElementById('main');
        if (article) { article.focus(); article.scrollIntoView(); }
      });
      localize();
    });
    hook.doneEach(function () {
      localize();
      if (toggle && compact.matches && isOpen()) {
        var focusInSidebar = sidebar.contains(document.activeElement);
        toggle.click();
        if (focusInSidebar) document.getElementById('main').focus();
      }
    });
  }

  window.$docsify = {
    name: guide.name,
    nameLink: '#/',
    themeColor: guide.color,
    // Chapter links are relative to the chapter file (e.g. "../B/LINQ.md").
    relativePath: true,
    loadSidebar: true,
    // One sidebar per guide; avoids 404 lookups for _sidebar.md in chapter folders.
    alias: {
      '/.*/_sidebar.md': '/_sidebar.md',
    },
    maxLevel: 3,
    subMaxLevel: 2,
    auto2top: true,
    topMargin: 176,
    plugins: [guideChrome],
    externalLinkTarget: '_blank',
    search: {
      paths: 'auto',
      depth: 3,
      // Guides share one origin, so each needs its own localStorage index.
      namespace: guide.id,
      placeholder: 'Hledat…',
      noData: 'Nic nenalezeno',
    },
    copyCode: {
      buttonText: 'Kopírovat',
      errorText: 'Chyba',
      successText: 'Zkopírováno',
    },
    pagination: {
      previousText: 'Předchozí',
      nextText: 'Další',
      crossChapter: true,
      crossChapterText: true,
    },
  };
})();
