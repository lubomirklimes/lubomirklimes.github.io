(() => {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#main-nav');
  if (!button || !nav) return;
  document.documentElement.classList.add('js');
  button.hidden = false;
  const close = (restoreFocus = false) => {
    nav.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  };
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    nav.classList.toggle('is-open', expanded);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) close(true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.site-header')) close();
  });
  matchMedia('(min-width: 961px)').addEventListener('change', () => close());
})();
