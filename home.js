(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const rack = document.getElementById('home-rack');
  const storyCta = document.getElementById('story-sale-link');
  const esc = (value='') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => value === null || value === '' ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value));

  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    rack.innerHTML = '<div class="ds-empty-rack">The rack is being prepared.</div>';
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  async function loadRack() {
    const { data, error } = await client
      .from('boutique_items')
      .select('*')
      .eq('status','published')
      .eq('show_on_homepage', true)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:false})
      .limit(12);

    if (error || !data?.length) {
      rack.innerHTML = '<div class="ds-empty-rack">New pieces are being added to the rack.</div>';
      return;
    }

    rack.innerHTML = data.map(item => `
      <article class="ds-piece">
        <a href="${esc(item.destination_url || '#')}" ${item.destination_url ? 'target="_blank" rel="noopener"' : ''}>
          <div class="ds-piece-image">${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(item.title)}">` : ''}</div>
          <div class="ds-piece-copy">
            <h3 class="ds-piece-title">${esc(item.title)}</h3>
            <div class="ds-piece-meta">${esc(item.brand || '')}${item.brand && item.size ? ' · ' : ''}${item.size ? `Size ${esc(item.size)}` : ''}</div>
            <div class="ds-piece-price">${money(item.price)}</div>
          </div>
        </a>
      </article>`).join('');
  }

  async function loadLatestStory() {
    const { data } = await client
      .from('story_campaigns')
      .select('slug')
      .eq('published',true)
      .order('published_at',{ascending:false})
      .limit(1);
    if (data?.[0]?.slug) storyCta.href = `story.html?s=${encodeURIComponent(data[0].slug)}`;
  }

  loadRack();
  loadLatestStory();
})();