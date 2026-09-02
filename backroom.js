(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
    document.getElementById('auth-status').innerHTML = '<div class="ds-status error">Supabase is not configured.</div>';
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => value === null || value === '' ? '' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value));
  const safeSlug = value => String(value || 'story-sale').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48) || 'story-sale';
  const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maxImageBytes = 10 * 1024 * 1024;
  $('item-image')?.setAttribute('accept', [...allowedImageTypes].join(','));

  let user = null;
  let inventory = [];
  let campaigns = [];
  let selectedIds = [];
  let editingItem = null;
  let currentCampaignId = null;
  let currentImageUrl = null;

  const authStatus = $('auth-status');
  const itemForm = $('item-form');
  const inventoryList = $('inventory-list');
  const builderItems = $('builder-items');
  const previewGrid = $('preview-grid');
  const publishedList = $('published-list');

  function status(el, text, isError = false) {
    el.innerHTML = text ? `<div class="ds-status${isError ? ' error' : ''}">${esc(text)}</div>` : '';
  }

  let started = false;

  async function startForOwner(ownerUser) {
    if (started || !ownerUser) return;
    user = ownerUser;
    started = true;
    await refreshAll();
  }

  window.addEventListener('dressup:owner-ready', event => {
    startForOwner(event.detail?.user).catch(error => status(authStatus, error.message || 'Could not load the Back Room.', true));
  });

  document.querySelectorAll('.ds-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.ds-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.ds-panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tab.dataset.tab}`));
  }));

  async function refreshAll() {
    await Promise.all([loadInventory(), loadCampaigns()]);
    renderInventory();
    renderBuilderChoices();
    renderPublished();
    renderPreview();
  }

  async function loadInventory() {
    const { data, error } = await client
      .from('boutique_items')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    inventory = data || [];
    selectedIds = selectedIds.filter(id => inventory.some(item => item.id === id));
  }

  async function loadCampaigns() {
    const { data, error } = await client
      .from('story_campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    campaigns = data || [];
  }

  function renderInventory() {
    if (!inventory.length) {
      inventoryList.innerHTML = '<div class="ds-empty">Add your first piece to start building the rack.</div>';
      return;
    }
    inventoryList.innerHTML = inventory.map(item => `
      <div class="ds-inventory-row">
        ${item.image_url ? `<img class="ds-inventory-thumb" src="${esc(item.image_url)}" alt="${esc(item.title)}" />` : '<div class="ds-inventory-thumb ds-product-placeholder">DS</div>'}
        <div>
          <div class="ds-inventory-name">${esc(item.title)}</div>
          <div class="ds-inventory-meta">${esc(item.brand || '')}${item.brand && item.size ? ' · ' : ''}${item.size ? `Size ${esc(item.size)}` : ''}${item.price !== null ? ` · ${money(item.price)}` : ''}<br>${esc(item.status)}</div>
        </div>
        <div class="ds-row-actions">
          <button class="ds-mini-btn" type="button" data-edit="${esc(item.id)}">Edit</button>
          <button class="ds-mini-btn" type="button" data-toggle-publish="${esc(item.id)}">${item.status === 'published' ? 'Draft' : 'Publish'}</button>
        </div>
      </div>`).join('');

    inventoryList.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => beginEdit(btn.dataset.edit)));
    inventoryList.querySelectorAll('[data-toggle-publish]').forEach(btn => btn.addEventListener('click', () => togglePublish(btn.dataset.togglePublish)));
  }

  function resetItemForm() {
    editingItem = null;
    currentImageUrl = null;
    $('item-id').value = '';
    $('item-title').value = '';
    $('item-brand').value = '';
    $('item-size').value = '';
    $('item-descriptor').value = '';
    $('item-price').value = '';
    $('item-status').value = 'draft';
    $('item-url').value = '';
    $('item-image').value = '';
    $('item-form-title').textContent = 'Add a Piece';
    $('cancel-item-edit').classList.add('ds-hidden');
    status($('item-status-note'), '');
  }

  function beginEdit(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    editingItem = item;
    currentImageUrl = item.image_url || null;
    $('item-id').value = item.id;
    $('item-title').value = item.title || '';
    $('item-brand').value = item.brand || '';
    $('item-size').value = item.size || '';
    $('item-descriptor').value = item.descriptor || '';
    $('item-price').value = item.price ?? '';
    $('item-status').value = item.status || 'draft';
    $('item-url').value = item.destination_url || '';
    $('item-form-title').textContent = 'Edit Piece';
    $('cancel-item-edit').classList.remove('ds-hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('cancel-item-edit').addEventListener('click', resetItemForm);

  async function uploadImage(file) {
    if (!allowedImageTypes.has(file.type)) throw new Error('Upload a JPEG, PNG, or WebP image.');
    if (file.size > maxImageBytes) throw new Error('Images must be 10 MB or smaller.');
    const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const ext = rawExt || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await client.storage.from('boutique-media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });
    if (error) throw error;
    const { data: publicData } = client.storage.from('boutique-media').getPublicUrl(data.path);
    return publicData.publicUrl;
  }

  itemForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!user) return;
    const saveBtn = $('save-item');
    saveBtn.disabled = true;
    status($('item-status-note'), 'Saving piece…');
    try {
      const file = $('item-image').files?.[0];
      if (file) currentImageUrl = await uploadImage(file);
      const priceRaw = $('item-price').value.trim();
      const destinationValue = $('item-url').value.trim();
      if (destinationValue) {
        let destination;
        try {
          destination = new URL(destinationValue);
        } catch {
          throw new Error('Listing destination must be a valid HTTPS URL.');
        }
        if (destination.protocol !== 'https:' || destination.username || destination.password) {
          throw new Error('Listing destination must be a valid HTTPS URL.');
        }
      }
      const payload = {
        user_id: user.id,
        title: $('item-title').value.trim(),
        brand: $('item-brand').value.trim() || null,
        descriptor: $('item-descriptor').value.trim() || null,
        size: $('item-size').value.trim() || null,
        price: priceRaw === '' ? null : Number(priceRaw),
        image_url: currentImageUrl,
        destination_url: destinationValue || null,
        status: $('item-status').value,
        updated_at: new Date().toISOString()
      };
      if (!payload.title) throw new Error('Item title is required.');

      let result;
      if (editingItem) {
        result = await client.from('boutique_items').update(payload).eq('id', editingItem.id).eq('user_id', user.id);
      } else {
        result = await client.from('boutique_items').insert(payload);
      }
      if (result.error) throw result.error;
      resetItemForm();
      await loadInventory();
      renderInventory();
      renderBuilderChoices();
      renderPreview();
      status($('item-status-note'), 'Saved.');
    } catch (error) {
      status($('item-status-note'), error.message || 'Could not save the piece.', true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function togglePublish(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const next = item.status === 'published' ? 'draft' : 'published';
    const { error } = await client.from('boutique_items').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
    if (error) return alert(error.message);
    await loadInventory();
    renderInventory();
    renderBuilderChoices();
    renderPreview();
  }

  function renderBuilderChoices() {
    const available = inventory.filter(item => item.status !== 'archived');
    if (!available.length) {
      builderItems.innerHTML = '<div class="ds-empty">Add inventory first.</div>';
      return;
    }
    builderItems.innerHTML = available.map(item => `
      <label class="ds-select-tile ds-product-card">
        <input type="checkbox" value="${esc(item.id)}" ${selectedIds.includes(item.id) ? 'checked' : ''} aria-label="Select ${esc(item.title)}" />
        <div class="ds-product-image-wrap">${item.image_url ? `<img class="ds-product-image" src="${esc(item.image_url)}" alt="${esc(item.title)}" />` : '<div class="ds-product-placeholder">DS</div>'}</div>
        <div class="ds-product-copy"><div class="ds-product-title">${esc(item.title)}</div><div class="ds-product-price">${money(item.price)}</div></div>
      </label>`).join('');
    builderItems.querySelectorAll('input[type="checkbox"]').forEach(box => box.addEventListener('change', () => {
      if (box.checked) {
        if (selectedIds.length >= 4) {
          box.checked = false;
          status($('builder-status'), 'Choose up to four pieces.', true);
          return;
        }
        selectedIds.push(box.value);
      } else {
        selectedIds = selectedIds.filter(id => id !== box.value);
      }
      status($('builder-status'), '');
      renderPreview();
    }));
  }

  function previewItemMarkup(item) {
    return `<div class="ds-story-item">${item.image_url ? `<img class="ds-story-img" crossorigin="anonymous" src="${esc(item.image_url)}" alt="${esc(item.title)}" />` : '<div class="ds-story-img ds-product-placeholder">DS</div>'}<div class="ds-story-item-copy"><div class="ds-story-item-title">${esc(item.title)}</div>${item.price !== null ? `<div class="ds-story-item-price">${money(item.price)}</div>` : ''}</div></div>`;
  }

  function renderPreview() {
    $('preview-title').textContent = $('campaign-title').value.trim() || 'STORY SALE';
    $('preview-subtitle').textContent = $('campaign-subtitle').value.trim() || 'CURATED VINTAGE EDITS';
    $('preview-cta').textContent = $('campaign-cta').value.trim() || 'TAP TO SHOP';
    const template = document.querySelector('input[name="template"]:checked')?.value || 'terrazzo_grid';
    $('preview-terrazzo').style.display = template === 'clean_grid' ? 'none' : 'block';
    $('story-art').style.background = template === 'clean_grid' ? '#f7f5ef' : '';
    const chosen = selectedIds.map(id => inventory.find(i => i.id === id)).filter(Boolean).slice(0,4);
    previewGrid.innerHTML = chosen.length ? chosen.map(previewItemMarkup).join('') : '<div class="ds-empty" style="padding:24px 0">Select pieces for the edit.</div>';
  }

  ['campaign-title','campaign-subtitle','campaign-cta'].forEach(id => $(id).addEventListener('input', renderPreview));
  document.querySelectorAll('input[name="template"]').forEach(input => input.addEventListener('change', renderPreview));

  function campaignPayload(published) {
    const title = $('campaign-title').value.trim() || 'STORY SALE';
    const template = document.querySelector('input[name="template"]:checked')?.value || 'terrazzo_grid';
    return {
      user_id: user.id,
      title,
      subtitle: $('campaign-subtitle').value.trim() || 'CURATED VINTAGE EDITS',
      cta: $('campaign-cta').value.trim() || 'TAP TO SHOP',
      template,
      published,
      published_at: published ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
  }

  async function saveCampaign(published) {
    if (!selectedIds.length) throw new Error('Select at least one piece.');
    let campaign;
    if (currentCampaignId) {
      const { data, error } = await client.from('story_campaigns').update(campaignPayload(published)).eq('id', currentCampaignId).eq('user_id', user.id).select().single();
      if (error) throw error;
      campaign = data;
      const del = await client.from('story_campaign_items').delete().eq('campaign_id', currentCampaignId);
      if (del.error) throw del.error;
    } else {
      const title = $('campaign-title').value.trim() || 'STORY SALE';
      const slug = `${safeSlug(title)}-${Date.now().toString(36)}`;
      const { data, error } = await client.from('story_campaigns').insert({ ...campaignPayload(published), slug }).select().single();
      if (error) throw error;
      campaign = data;
      currentCampaignId = campaign.id;
    }

    const rows = selectedIds.slice(0,4).map((itemId, position) => ({ campaign_id: campaign.id, item_id: itemId, position }));
    const { error: itemError } = await client.from('story_campaign_items').insert(rows);
    if (itemError) throw itemError;
    await loadCampaigns();
    renderPublished();
    return campaign;
  }

  $('save-draft').addEventListener('click', async () => {
    status($('builder-status'), 'Saving draft…');
    try {
      const campaign = await saveCampaign(false);
      status($('builder-status'), `Draft saved: ${campaign.slug}`);
    } catch (error) {
      status($('builder-status'), error.message, true);
    }
  });

  $('publish-story').addEventListener('click', async () => {
    status($('builder-status'), 'Publishing Story Sale…');
    try {
      const campaign = await saveCampaign(true);
      const url = new URL('story.html', location.href);
      url.searchParams.set('s', campaign.slug);
      status($('builder-status'), `Published. Your Story link is ${url.href}`);
      try { await navigator.clipboard.writeText(url.href); } catch (_) {}
    } catch (error) {
      status($('builder-status'), error.message, true);
    }
  });

  $('download-story').addEventListener('click', async () => {
    if (!window.html2canvas) return status($('builder-status'), 'Story export library is unavailable.', true);
    status($('builder-status'), 'Rendering your 9:16 Story…');
    try {
      const node = $('story-art');
      const canvas = await window.html2canvas(node, { scale: 3, useCORS: true, backgroundColor: '#f7f5ef', logging: false });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
      if (!blob) throw new Error('Story export failed.');
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${safeSlug($('campaign-title').value)}-dressup-sesh.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
      status($('builder-status'), 'Story downloaded. Add your Instagram Link sticker over the CTA when posting.');
    } catch (error) {
      status($('builder-status'), 'Could not export this Story. Try images uploaded through the Back Room so they are export-safe.', true);
    }
  });

  function renderPublished() {
    const published = campaigns.filter(c => c.published);
    if (!published.length) {
      publishedList.innerHTML = '<div class="ds-empty">Published Story Sales will appear here.</div>';
      return;
    }
    publishedList.innerHTML = published.map(c => {
      const url = new URL('story.html', location.href);
      url.searchParams.set('s', c.slug);
      return `<div class="ds-published-row"><div><h3>${esc(c.title)}</h3><div class="ds-published-meta">${esc(c.subtitle)} · ${c.published_at ? new Date(c.published_at).toLocaleString() : 'Published'}</div></div><div class="ds-row-actions"><a class="ds-mini-btn" style="display:grid;place-items:center;text-decoration:none" href="${esc(url.href)}" target="_blank" rel="noopener">Open</a><button class="ds-mini-btn" type="button" data-copy-link="${esc(url.href)}">Copy link</button></div></div>`;
    }).join('');
    publishedList.querySelectorAll('[data-copy-link]').forEach(btn => btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.copyLink); btn.textContent = 'Copied'; } catch (_) { prompt('Copy this link:', btn.dataset.copyLink); }
    }));
  }

  startForOwner(window.DRESSUP_BACKROOM_OWNER?.user).catch(error => status(authStatus, error.message || 'Could not load the Back Room.', true));
})();
