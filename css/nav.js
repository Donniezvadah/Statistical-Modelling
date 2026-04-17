/* Shared navigation & theme logic for all pages */

/* ── Sidebar HTML ── */
const NAV_HTML = `
<div class="sidebar-section-title">Course</div>
<ul class="sidebar-nav">
  <li><a href="index.html" data-page="index">
    <span class="nav-number">☰</span> Introduction
  </a></li>
</ul>
<hr class="sidebar-divider">
<div class="sidebar-section-title">Chapters</div>
<ul class="sidebar-nav">
  <li><a href="model-selection.html" data-page="model-selection">
    <span class="nav-number">1</span> Model Selection
  </a></li>
  <li><a href="beyond-glms.html" data-page="beyond-glms">
    <span class="nav-number">2</span> Beyond GLMs
  </a></li>
  <li><a href="nonlinear.html" data-page="nonlinear">
    <span class="nav-number">3</span> Nonlinear Models
  </a></li>
  <li><a href="latent.html" data-page="latent">
    <span class="nav-number">4</span> Latent Variables
  </a></li>
</ul>
<hr class="sidebar-divider">
<div class="sidebar-section-title">Reference</div>
<ul class="sidebar-nav">
  <li><a href="formulations.html" data-page="formulations">
    <span class="nav-number">⊞</span> Model Formulations
  </a></li>
  <li><a href="key-readings.html" data-page="key-readings">
    <span class="nav-number">📚</span> Key Readings
  </a></li>
  <li><a href="bibliography.html" data-page="bibliography">
    <span class="nav-number">§</span> Bibliography
  </a></li>
</ul>
<hr class="sidebar-divider">
<div class="sidebar-section-title">Labs</div>
<ul class="sidebar-nav">
  <li><a href="lab1.html" data-page="lab1">
    <span class="nav-number">L1</span> Lab 1 (with solution)
  </a></li>
  <li><a href="lab2.html" data-page="lab2">
    <span class="nav-number">L2</span> Lab 2 (with solution)
  </a></li>
</ul>
`;

/* ── Inject nav & wire up page ── */
document.addEventListener('DOMContentLoaded', () => {
  /* Inject sidebar content */
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = NAV_HTML;

  /* Highlight active page */
  const page = document.body.dataset.page;
  if (page) {
    const link = document.querySelector(`[data-page="${page}"]`);
    if (link) link.classList.add('active');
  }

  /* Mobile menu toggle */
  const toggle = document.getElementById('menu-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  /* Dark / light mode */
  const themeBtn = document.getElementById('theme-toggle');
  const applyTheme = t => {
    document.documentElement.dataset.theme = t;
    if (themeBtn) themeBtn.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
  };
  const saved = localStorage.getItem('sm-theme') || 'light';
  applyTheme(saved);
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sm-theme', next);
      applyTheme(next);
    });
  }

  /* TOC active section tracking */
  buildTOC();
  trackTOC();
});

/* ── Auto-build right TOC from h2/h3 in content ── */
function buildTOC() {
  const list = document.getElementById('toc-list');
  if (!list) return;
  const headings = document.querySelectorAll('.content-wrapper h2[id], .content-wrapper h3[id]');
  if (headings.length === 0) { document.getElementById('toc-sidebar').style.display = 'none'; return; }
  headings.forEach(h => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    if (h.tagName === 'H3') a.classList.add('toc-h3');
    li.appendChild(a);
    list.appendChild(li);
  });
}

/* ── IntersectionObserver for TOC ── */
function trackTOC() {
  const links = document.querySelectorAll('#toc-list a');
  if (!links.length) return;
  const headings = Array.from(links).map(a => document.querySelector(a.getAttribute('href')));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.remove('toc-active'));
        const match = document.querySelector(`#toc-list a[href="#${e.target.id}"]`);
        if (match) match.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-56px 0px -70% 0px' });
  headings.forEach(h => h && obs.observe(h));
}
