// Comportamiento compartido: barra de navegación y apariciones al hacer scroll.
(function () {
  const nav = document.querySelector('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const toggle = nav.querySelector('.nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => nav.classList.toggle('open'));
      nav.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
    }
  }

  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add('in'));
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
