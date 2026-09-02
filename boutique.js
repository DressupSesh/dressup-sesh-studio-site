(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    document.getElementById('shop-grid').innerHTML = '<div class="ds-empty">Boutique connection is not configured yet.</div>';
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const grid = document.getElementById('shop-grid');
  const itemCount = document.getElementById('item-count');
  const shopCount = document.getElementById('shop-count');
  const filterToggle = document.getElementById('filter-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const brandFilter = document.getElementById('brand-filter');
  const sizeFilter = document.getElementById('size-filter');
  let allItems = [];

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => value === null || value === '' ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value));

  function productMarkup(item) {
    const img = item.image_url
      ? `<img class="ds-product-image" src="${esc(item.image_url)}" alt="${esc(item.title)}" loading="lazy" />`
      : `<div class="ds-product-placeholder">DS</div>`;
    const meta = [item.descriptor, item.size ? `Size: ${item.size}` : ''].filter(Boolean).map(esc).join('<br>');
    const content = `
      <div class="ds-product-image-wrap">${img}</div>
      <div class="ds-product-copy">
        <h2 class="ds-product-title">${esc(item.title)}</h2>
        ${meta ? `<p class="ds-product-meta">${meta}</p>` : ''}
        ${item.price !== null ? `<div class="ds-product-price">${money(item.price)}</div>` : ''}
      </div>`;
    if (!item.destination_url) return `<article class="ds-product-card">${content}</article>`;
    return `<article class="ds-product-card"><a class="ds-product-link" href="${esc(item.destination_url)}" target="_blank" rel="noopener" data-item-id="${esc(item.id)}">${content}</a></article>`;
  }

  function render() {
    const brand = brandFilter.value;
    const size = sizeFilter.value;
    const items = allItems.filter(item => (!brand || item.brand === brand) && (!size || item.size === size));
    itemCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    shopCount.textContent = items.length;
    grid.innerHTML = items.length ? items.map(productMarkup).join('') : '<div class="ds-empty">No pieces in this edit yet.</div>';
    grid.querySelectorAll('[data-item-id]').forEach(link => link.addEventListener('click', () => track('item_click', null, link.dataset.itemId)));
  }

  function fillFilters() {
    const brands = [...new Set(allItems.map(i => i.brand).filter(Boolean))].sort();
    const sizes = [...new Set(allItems.map(i => i.size).filter(Boolean))].sort();
    brandFilter.innerHTML = '<option value="">All brands</option>' + brands.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    sizeFilter.innerHTML = '<option value="">All sizes</option>' + sizes.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

  async function track(eventType, campaignId = null, itemId = null) {
    try {
      await fetch(`${cfg.supabaseUrl}/functions/v1/record-boutique-event`, {
        method: 'POST',
        headers: { apikey: cfg.supabasePublishableKey, 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
        campaign_id: campaignId,
        item_id: itemId,
        event_type: eventType,
          source: 'shop',
          path: location.pathname + location.search
        })
      });
    } catch (_) {}
  }

  async function load() {
    const { data, error } = await client
      .from('boutique_items')
      .select('id,title,brand,descriptor,size,price,image_url,destination_url,status,sort_order,created_at')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      grid.innerHTML = '<div class="ds-empty">The rack could not load right now.</div>';
      itemCount.textContent = 'Unavailable';
      return;
    }
    allItems = data || [];
    fillFilters();
    render();
  }

  filterToggle.addEventListener('click', () => {
    const open = filterPanel.classList.toggle('open');
    filterToggle.setAttribute('aria-expanded', String(open));
    filterToggle.textContent = open ? '− Filter' : '＋ Filter';
  });
  brandFilter.addEventListener('change', render);
  sizeFilter.addEventListener('change', render);
  load();
})();
