// Comportamiento común del cuaderno: tema claro/oscuro, apariciones y ecuaciones.
(function () {
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
  const write = v => { try { localStorage.setItem('theme', v); } catch (e) {} };
  const saved = read();
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;

  const isDark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;

  const lang = (root.lang || 'es').slice(0, 2);
  const LABELS = {
    es: { light: 'Usar tema claro', dark: 'Usar tema oscuro' },
    en: { light: 'Use light theme', dark: 'Use dark theme' },
    de: { light: 'Helles Design verwenden', dark: 'Dunkles Design verwenden' },
  }[lang] || { light: 'Light theme', dark: 'Dark theme' };

  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.theme-toggle');
    const paint = () => {
      if (!btn) return;
      btn.innerHTML = isDark() ? sun : moon;
      btn.setAttribute('aria-label', isDark() ? LABELS.light : LABELS.dark);
    };
    paint();
    if (btn) btn.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      write(root.dataset.theme);
      paint();
      window.dispatchEvent(new Event('themechange'));
    });

    const render = () => document.querySelectorAll('[data-tex]').forEach(el => {
      try { katex.render(el.dataset.tex, el, { throwOnError: false, displayMode: el.hasAttribute('data-display') }); }
      catch (e) { el.textContent = el.dataset.tex; }
    });
    if (window.katex) render();

    const items = document.querySelectorAll('.fade');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -30px 0px' });
      items.forEach(el => io.observe(el));
    } else items.forEach(el => el.classList.add('in'));

    // Recordar el idioma elegido a mano, para no redirigir la portada otra vez.
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-lang]');
      if (a) try { localStorage.setItem('lang', a.dataset.lang); } catch (err) {}
    });

    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  });
})();
