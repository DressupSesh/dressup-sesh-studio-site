(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const storyGrid = document.getElementById('story-grid');
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    storyGrid.innerHTML = '<div class="ds-empty">Story connection is not configured.</div>';
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const params = new URLSearchParams(location.search);
  const slug = params.get('s') || params.get('slug');
  const titleEl = document.getElementById('story-title');
  const subtitleEl = document.getElementById('story-subtitle');
  const cta = document.getElementById('story-cta');

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => value === null || value === '' ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value));

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
          source: 'story',
          path: location.pathname + location.search
        })
      });
    } catch (_) {}
  }

  function itemMarkup(item) {
    const image = item.image_url
      ? `<img class="ds-story-img" src="${esc(item.image_url)}" alt="${esc(item.title)}" />`
      : `<div class="ds-story-img ds-product-placeholder">DS</div>`;
    const body = `<div class="ds-story-item">${image}<div class="ds-story-item-copy"><div class="ds-story-item-title">${esc(item.title)}</div>${item.price !== null ? `<div class="ds-story-item-price">${money(item.price)}</div>` : ''}</div></div>`;
    return item.destination_url ? `<a href="${esc(item.destination_url)}" target="_blank" rel="noopener" data-story-item="${esc(item.id)}" style="text-decoration:none">${body}</a>` : body;
  }

  async function load() {
    if (!slug) {
      storyGrid.innerHTML = '<div class="ds-empty">No story selected.</div>';
      return;
    }

    const { data: campaign, error: campaignError } = await client
      .from('story_campaigns')
      .select('id,slug,title,subtitle,cta,template,published,published_at')
      .eq('slug', slug)
      .eq('published', true)
      .single();

    if (campaignError || !campaign) {
      storyGrid.innerHTML = '<div class="ds-empty">This edit is no longer available.</div>';
      return;
    }

    titleEl.textContent = campaign.title || 'STORY SALE';
    subtitleEl.textContent = campaign.subtitle || 'CURATED VINTAGE EDITS';
    cta.querySelector('span').textContent = campaign.cta || 'TAP TO SHOP';
    cta.href = `shop.html?c=${encodeURIComponent(campaign.slug)}`;

    const { data: rows, error: rowError } = await client
      .from('story_campaign_items')
      .select('item_id,position')
      .eq('campaign_id', campaign.id)
      .order('position', { ascending: true });

    if (rowError || !rows?.length) {
      storyGrid.innerHTML = '<div class="ds-empty">This story is being styled.</div>';
      return;
    }

    const ids = rows.map(r => r.item_id);
    const { data: items, error: itemError } = await client
      .from('boutique_items')
      .select('id,title,price,image_url,destination_url,status')
      .in('id', ids);

    if (itemError) {
      storyGrid.innerHTML = '<div class="ds-empty">The edit could not load.</div>';
      return;
    }

    const byId = new Map((items || []).map(i => [i.id, i]));
    const ordered = rows.map(r => byId.get(r.item_id)).filter(Boolean).slice(0,4);
    storyGrid.innerHTML = ordered.map(itemMarkup).join('');
    storyGrid.querySelectorAll('[data-story-item]').forEach(link => link.addEventListener('click', () => track('item_click', campaign.id, link.dataset.storyItem)));
    cta.addEventListener('click', () => track('shop_click', campaign.id, null), { once: true });
    track('campaign_view', campaign.id, null);
  }

  load();
})();
