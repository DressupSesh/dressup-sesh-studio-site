(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const list = document.getElementById('rack-editor-list');
  const statusEl = document.getElementById('rack-editor-status');
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase || !list) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = (value='') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  let user = null;
  let items = [];

  function show(message, error = false) {
    if (!statusEl) return;
    statusEl.innerHTML = message ? `<div class="ds-status${error ? ' error' : ''}">${esc(message)}</div>` : '';
  }

  async function load() {
    if (!user) return;
    const { data, error } = await client
      .from('boutique_items')
      .select('id,title,brand,size,price,image_url,status,show_on_homepage,sort_order,created_at')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return show(error.message, true);
    items = data || [];
    render();
  }

  function render() {
    if (!items.length) {
      list.innerHTML = '<div class="ds-empty">No inventory yet.</div>';
      return;
    }

    list.innerHTML = items.map((item, index) => `
      <div class="ds-inventory-row ds-rack-editor-row ${item.show_on_homepage ? '' : 'is-hidden'}">
        ${item.image_url ? `<img class="ds-inventory-thumb" src="${esc(item.image_url)}" alt="${esc(item.title)}">` : '<div class="ds-inventory-thumb ds-product-placeholder">DS</div>'}
        <div class="ds-rack-editor-copy">
          <div class="ds-inventory-name">${esc(item.title)}</div>
          <div class="ds-inventory-meta">${esc(item.brand || '')}${item.size ? ` · Size ${esc(item.size)}` : ''}<br>${item.status === 'sold' ? 'Sold' : item.status}${item.show_on_homepage ? ' · On homepage' : ' · Hidden from homepage'}</div>
        </div>
        <div class="ds-row-actions ds-rack-editor-actions">
          <button class="ds-mini-btn" type="button" data-up="${item.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="ds-mini-btn" type="button" data-down="${item.id}" ${index === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="ds-mini-btn" type="button" data-visibility="${item.id}">${item.show_on_homepage ? 'Hide' : 'Show'}</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', () => move(btn.dataset.up, -1)));
    list.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click', () => move(btn.dataset.down, 1)));
    list.querySelectorAll('[data-visibility]').forEach(btn => btn.addEventListener('click', () => toggleVisibility(btn.dataset.visibility)));
  }

  async function persistOrder() {
    show('Saving Rack order…');
    const updates = items.map((item, index) => client
      .from('boutique_items')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('user_id', user.id));
    const results = await Promise.all(updates);
    const error = results.find(r => r.error)?.error;
    if (error) return show(error.message, true);
    show('Rack order saved.');
  }

  async function move(id, delta) {
    const index = items.findIndex(item => item.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    render();
    await persistOrder();
  }

  async function toggleVisibility(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const next = !item.show_on_homepage;
    show(next ? 'Adding piece to the homepage Rack…' : 'Removing piece from the homepage Rack…');
    const { error } = await client
      .from('boutique_items')
      .update({ show_on_homepage: next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return show(error.message, true);
    item.show_on_homepage = next;
    render();
    show(next ? 'Piece added to the homepage Rack.' : 'Piece hidden from the homepage Rack. It remains in inventory.');
  }

  document.querySelectorAll('.ds-tab[data-tab="rack"]').forEach(tab => tab.addEventListener('click', load));
  window.addEventListener('dressup:owner-ready', event => {
    user = event.detail?.user || null;
  });
  user = window.DRESSUP_BACKROOM_OWNER?.user || null;
})();
