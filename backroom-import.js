(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const importBtn = document.getElementById('import-item-link');
  const urlInput = document.getElementById('item-url');
  const titleInput = document.getElementById('item-title');
  const brandInput = document.getElementById('item-brand');
  const sizeInput = document.getElementById('item-size');
  const descriptorInput = document.getElementById('item-descriptor');
  const priceInput = document.getElementById('item-price');
  const statusInput = document.getElementById('item-status');
  const imageInput = document.getElementById('item-image');
  const imagePreview = document.getElementById('imported-image-preview');
  const imageNote = document.getElementById('item-image-note');
  const statusEl = document.getElementById('item-status-note');

  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase || !importBtn || !urlInput) return;
  const client = window.DRESSUP_SUPABASE || window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  if (!window.DRESSUP_SUPABASE) window.DRESSUP_SUPABASE = client;

  const show = (message, error = false) => {
    if (!statusEl) return;
    statusEl.replaceChildren();
    if (!message) return;
    const box = document.createElement('div');
    box.className = `ds-status${error ? ' error' : ''}`;
    box.textContent = message;
    statusEl.appendChild(box);
  };

  async function placeImportedImage(url) {
    if (!url || !imageInput) return;
    try {
      const imageUrl = new URL(url);
      const projectUrl = new URL(cfg.supabaseUrl);
      const expectedPath = '/storage/v1/object/public/boutique-media/';
      if (imageUrl.origin !== projectUrl.origin || !imageUrl.pathname.startsWith(expectedPath)) {
        throw new Error('The importer returned an untrusted image location.');
      }
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('The imported image could not be downloaded.');
      const blob = await res.blob();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('The imported file is not a supported image.');
      if (blob.size > 10 * 1024 * 1024) throw new Error('The imported image is larger than 10 MB.');
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const file = new File([blob], `poshmark-import.${ext}`, { type: blob.type || 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      imageInput.files = dt.files;
    } catch (error) {
      throw error;
    }
  }

  function cleanDescriptor(text = '') {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    if (value.length <= 220) return value;
    const clipped = value.slice(0, 220);
    const lastPeriod = clipped.lastIndexOf('.');
    return lastPeriod > 40 ? clipped.slice(0, lastPeriod + 1) : clipped;
  }

  importBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return show('Paste a Poshmark listing link first.', true);

    importBtn.disabled = true;
    show('Pulling listing details…');
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Back Room session is active but no access token was returned. Sign out once, then sign back in.');

      const { data, error } = await client.functions.invoke('import-poshmark-item', {
        body: { url },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (error) {
        let message = error.message || 'Could not import that listing.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          }
        } catch (_) {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      if (data.canonicalUrl) urlInput.value = data.canonicalUrl;
      if (data.title) titleInput.value = data.title;
      if (data.brand) brandInput.value = data.brand;
      if (data.size && sizeInput) sizeInput.value = data.size;
      if (data.description && descriptorInput && !descriptorInput.value) descriptorInput.value = cleanDescriptor(data.description);
      if (data.price !== null && data.price !== undefined) priceInput.value = data.price;
      if (statusInput) statusInput.value = data.listingStatus === 'sold' ? 'sold' : 'published';

      if (data.imageUrl) {
        if (imagePreview) {
          imagePreview.src = data.imageUrl;
          imagePreview.hidden = false;
        }
        if (imageNote) imageNote.textContent = 'Thumbnail pulled from the Poshmark listing. Upload another image only if you want to replace it.';
        await placeImportedImage(data.imageUrl);
      }

      show(data.listingStatus === 'sold'
        ? 'Listing pulled in and appears sold. Review it, then Save Piece if you still want it in inventory.'
        : 'Listing pulled in and set to Published. Review it, then tap Save Piece to add it to the Rack.');
    } catch (error) {
      show(error.message || 'Could not import that listing.', true);
    } finally {
      importBtn.disabled = false;
    }
  });
})();
