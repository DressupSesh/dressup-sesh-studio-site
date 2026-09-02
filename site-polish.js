(() => {
  function ensureDrawer() {
    if (document.querySelector('.ds-site-drawer')) return;
    const drawer = document.createElement('div');
    drawer.className = 'ds-site-drawer';
    drawer.innerHTML = `
      <div class="ds-site-drawer-backdrop" data-drawer-close></div>
      <aside class="ds-site-drawer-panel" aria-label="Dressup Sesh menu">
        <button class="ds-site-drawer-close" type="button" aria-label="Close menu" data-drawer-close>×</button>
        <div class="ds-site-drawer-brand">Dressup Sesh.</div>
        <nav class="ds-site-drawer-nav">
          <a href="index.html">Home / The Rack</a>
          <a href="shop.html">New Arrivals</a>
          <a href="studio-home.html">Dressup Sesh Studio</a>
        </nav>
        <div class="ds-site-drawer-note">Curated one-of-one finds</div>
      </aside>`;
    document.body.appendChild(drawer);
    const open = () => { drawer.classList.add('open'); document.body.style.overflow='hidden'; };
    const close = () => { drawer.classList.remove('open'); document.body.style.overflow=''; };
    document.querySelectorAll('.ds-menu,.ds-icon-button').forEach(btn => btn.addEventListener('click', open));
    drawer.querySelectorAll('[data-drawer-close]').forEach(el => el.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function enableProductReveal() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    const wire = () => {
      grid.querySelectorAll('.ds-product-card').forEach(card => {
        if (card.dataset.revealWired) return;
        card.dataset.revealWired = '1';
        const link = card.querySelector('.ds-product-link');
        if (!link) return;
        link.addEventListener('click', e => {
          const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
          if (coarse && !card.classList.contains('is-revealed')) {
            e.preventDefault();
            grid.querySelectorAll('.ds-product-card.is-revealed').forEach(other => other !== card && other.classList.remove('is-revealed'));
            card.classList.add('is-revealed');
          }
        });
      });
    };
    new MutationObserver(wire).observe(grid,{childList:true,subtree:true});
    wire();
  }

  function enableNewStory() {
    const publishBtn = document.getElementById('publish-story');
    if (!publishBtn || document.getElementById('new-story-sale')) return;
    const btn = document.createElement('button');
    btn.id = 'new-story-sale';
    btn.type = 'button';
    btn.className = 'ds-btn light ds-new-story-btn';
    btn.textContent = 'Start a new Story Sale';
    btn.addEventListener('click', () => {
      sessionStorage.setItem('dressup-open-builder','1');
      location.reload();
    });
    const status = document.getElementById('builder-status');
    (status?.parentElement || publishBtn.parentElement).appendChild(btn);
    if (sessionStorage.getItem('dressup-open-builder') === '1') {
      sessionStorage.removeItem('dressup-open-builder');
      setTimeout(() => document.querySelector('.ds-tab[data-tab="builder"]')?.click(), 120);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureDrawer();
    enableProductReveal();
    enableNewStory();
  });
})();
