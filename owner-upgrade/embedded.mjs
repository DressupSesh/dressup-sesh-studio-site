import { ALLOWANCES, PLAN_NAMES, MARKETPLACES, listingLink, combinedCopy, reviewProblem, photoFilename } from './core.mjs?v=compare-20261113';
export async function mountUpgrade(host, options) {
 if(!host) return;
 host.attachShadow({mode:'open'});
 const response=await fetch('/owner-upgrade/workspace.html?v=draft-recovery-20261113', {signal:options.signal});
 if(!response.ok)throw new Error('Listing Upgrade could not load. Refresh to try again.');
 host.shadowRoot.innerHTML=await response.text(); // Static, same-origin application template.
 function setDraftURL(id) {
   const url=new URL(location.href);
   if(id){url.searchParams.set('draft',id);url.searchParams.set('tab','upgrade');}
   else url.searchParams.delete('draft');
   history.replaceState(null,'',url);
 }

const root=host.shadowRoot;
const $ = selector => root.querySelector(selector);
const state = { photos: [], originals: [], original: null, mode: '', revision: 0, busy: false, prepared: null, plan: 'free' };
const copyOnly = false;
let draftID = null, activeJobs = {}, savingTimer = null, liveAccess = null, client = options.client, authCaptcha = null;
const fields = ['title', 'description', 'brand', 'size', 'condition', 'price'];
let editPhoto = null, editImage = null, rotation = 0, nativeInstall = null, nextPhotoID = 0;
let saveAttempt = null, savePhotoURLs = [];
let loadingDraft = false, draftWritable = false, draftEpoch = 0, unrestoredPhotos = [], openingDraft = null;
const objectURLs = new Set();
const urlFor = blob => { const url = URL.createObjectURL(blob); objectURLs.add(url); return url; };
function revoke(url) { if (url) { URL.revokeObjectURL(url); objectURLs.delete(url); } }
function message(selector, text, error = false) { const node = $(selector); node.textContent = text; node.classList.toggle('error', error); }
function values() { return Object.fromEntries(fields.map(key => [key, $('#' + key).value])); }
function selected() { return state.photos.filter(photo => photo.selected); }
function invalidate(save = true) {
  state.revision++;
  if (draftID && save && !loadingDraft) { clearTimeout(savingTimer); savingTimer = setTimeout(() => persistDraft().catch(error => message('#draft-status', error.message, true)), 800); }
  $('#reviewed').checked = false;
  $('#quick-post').disabled = true;
  state.prepared = null;
  resetQuickSave();
  $('#review-label').classList.remove('attention');
  message('#review-status', state.mode ? 'Review your latest changes to enable Quick Save.' : '');
  $('#title-count').textContent = `${$('#title').value.length} / 200`;
}
function usage() {
  if (liveAccess?.tier === 'owner') { $('#plan-caption').textContent='Owner · Unlimited upgrades'; $('#usage-caption').textContent='Unlimited access'; return; }
  if (liveAccess) { $('#plan-caption').textContent = `${liveAccess.tier === 'member' ? 'Member' : liveAccess.tier} · ${liveAccess.limit} upgrades / month`; $('#usage-caption').textContent = `${liveAccess.remaining} left · resets ${new Date(liveAccess.resets_at).toLocaleDateString()}`; return; }
  $('#plan-caption').textContent = `${PLAN_NAMES[state.plan]} · ${ALLOWANCES[state.plan]} upgrades / month`;
  $('#usage-caption').textContent = 'Sign in to see your allowance';
}
fields.forEach(key => $('#' + key).addEventListener('input', invalidate));

function clearWorkspace() {
  draftEpoch++; loadingDraft = false; draftWritable = false; unrestoredPhotos = [];
  draftID = null; activeJobs = {}; setDraftURL(null); clearTimeout(savingTimer);
  invalidate();
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  state.photos = []; state.originals = []; state.original = null; state.mode = '';
  fields.forEach(key => { $('#' + key).value = ''; });
  $('#photo-grid').replaceChildren(); $('#original-photos').replaceChildren();
  $('#workspace').hidden = true; $('#welcome').hidden = false; $('#import-panel').hidden=false;
  $('#copy-note').value = '';
  usage();
}
function reveal(original, mode) {
  state.mode = mode; state.original = original;
  fields.forEach(key => { $('#' + key).value = original[key] || ''; });
  $('#original-title').textContent = original.title || 'No title imported';
  $('#original-description').textContent = original.description || 'No description imported';
  message('#result-note','Review the main photo and copy before saving.');
  $('#copy-state').textContent='Ready to run'; $('#ghost-state').textContent='Ready to run';
  message('#copy-status','Use your notes to refine the next draft.');
  $('#workspace').hidden = false; $('#welcome').hidden = true; $('#import-panel').hidden=true; $('#recent-drafts').open=false;
  renderPhotos(); renderOriginals(); invalidate(); usage();
  $('#workspace-heading').focus({ preventScroll: true });
  $('#workspace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
async function photoFrom(blob, label, kind, choose = true) {
  if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size === 0 || blob.size > 12 * 1024 * 1024) {
    throw new Error('Use a JPG, PNG, or WebP photo under 12 MB.');
  }
  const url = urlFor(blob), probe = new Image(); probe.src = url;
  try { await probe.decode(); } catch { revoke(url); throw new Error('That photo could not be opened. Try a different image.'); }
  if (probe.naturalWidth * probe.naturalHeight > 48_000_000) { revoke(url); throw new Error('That image is too large. Use a smaller copy.'); }
  return { id: `photo-${++nextPhotoID}`, blob, originalBlob: blob, url, label, kind, selected: choose, failed: false };
}
$('#import-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  try {
    const url = listingLink($('#listing-url').value.trim());
    if (!await requireAccount({ action: 'import', url })) return;
    state.busy = true; $('#import-button').disabled = true;
    message('#import-status', 'Importing the listing photos and details…');
    const result = await api('', { action: 'import', id: crypto.randomUUID(), url });
    await loadDraft(result.draft);
    message('#import-status', `${state.originals.length} source photo${state.originals.length === 1 ? '' : 's'} imported. ${result.missingPhotos ? 'Some photos were unavailable. ' : ''}We’ll create one new main photo and refreshed copy.`);
    await runWorkflows();
  } catch (error) { message($('#workspace').hidden ? '#import-status' : '#result-note', error.message, true); $('#manual').open = true; }
  finally { state.busy = false; await refreshAccount(); }
});
async function readFiles(fileList, room = 16) {
  const files = Array.from(fileList);
  if (!files.length) throw new Error('Choose at least one product photo.');
  if (files.length > room) throw new Error(`Choose up to ${room} more photos.`);
  const prepared = [];
  try { for (const file of files) prepared.push(await photoFrom(file, file.name, 'Your uploaded photo', true)); }
  catch (error) { for (const p of prepared) revoke(p.url); throw error; }
  return prepared;
}
$('#manual-load').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true; $('#manual-load').disabled = true;
  try {
    const input = { photos: Array.from($('#manual-photos').files), references: Array.from($('#manual-references')?.files || []), title: $('#manual-title')?.value || '', description: $('#manual-description')?.value || '', brand: $('#manual-brand')?.value || '' };
    if (!input.photos.length) throw new Error('Choose at least one product photo.');
    if (input.photos.length + input.references.length > (copyOnly ? 10 : 16)) throw new Error('Choose fewer photos before continuing.');
    if (!await requireAccount({ action: 'upload', ...input })) return;
    const photos = await readFiles(input.photos, copyOnly ? 10 : 16);
    const references = copyOnly && input.references.length ? await readFiles(input.references, 10 - photos.length) : [];
    references.forEach(p => { p.selected=false; p.reference=true; p.kind='Reference photo'; });
    const original = { title: input.title.trim(), description: input.description.trim(), brand: input.brand.trim(), reference_count: references.length };
    clearWorkspace();
    for (const photo of [...references,...photos]) photo.url = urlFor(photo.blob);
    state.photos = photos; state.originals = [...references,...photos].map(photo => ({ ...photo }));
    reveal(original, 'manual');
    const created = await api('', { action: 'create', id: crypto.randomUUID(), kind: copyOnly ? 'free_copy' : 'upgrade', source: original }); draftID = created.draft.id;
    for (const photo of state.originals) { const ref = await uploadAsset(photo.blob, true); Object.assign(photo, {asset: ref.id, id: ref.id}); }
    draftWritable = true;
    state.photos = state.originals.filter(p=>!p.reference).map(p => ({...p})); renderPhotos();
    setDraftURL(draftID);
    await persistDraft(); await runWorkflows();
  } catch (error) { message($('#workspace').hidden ? '#manual-status' : '#result-note', error.message, true); }
  finally { state.busy = false; await refreshAccount(); }
});
function renderOriginals() {
  const container = $('#original-photos'); container.replaceChildren();
  const main = state.originals.find(p => !p.reference);
  if (main) { const img = new Image(); img.src = main.url; img.alt = 'Original listing main photo'; container.append(img); }
  $('#reference-status').textContent = `${state.originals.length} source photo${state.originals.length === 1 ? '' : 's'} available. Up to 6 guide the main image; up to 10 guide the copy.`;
}
function action(label, handler, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className; button.addEventListener('click', handler); return button;
}
function renderPhotos() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  const photo = state.photos.filter(p => p.kind?.includes('Ghost mannequin')).at(-1);
  state.photos.forEach(p => { p.selected = p === photo; });
  if (!photo) { const placeholder = document.createElement('p'); placeholder.className='photo-placeholder'; placeholder.textContent='Your ghost mannequin main photo will appear here.'; grid.append(placeholder); return; }
  const card = document.createElement('article'); card.className = 'photo-card';
  const frame = document.createElement('div'); frame.className = 'photo-preview';
  const img = new Image(); img.src = photo.url; img.alt = 'New ghost mannequin main photo';
  img.addEventListener('error', () => { photo.failed = true; invalidate(); message('#photo-status', 'The new main photo could not be displayed. Reopen the draft or regenerate before saving.', true); });
  frame.append(img);
  const buttons = document.createElement('div'); buttons.className = 'photo-actions';
  buttons.append(action('Edit photo', () => { if(!state.busy) void openEditor(photo); }));
  const undo = action('Undo edit', () => { if(state.busy)return; photo.blob=photo.originalBlob; photo.asset=null; photo.job=null; revoke(photo.url); photo.url=urlFor(photo.blob); photo.failed=false; invalidate(); renderPhotos(); }); undo.disabled=photo.blob===photo.originalBlob; buttons.append(undo);
  buttons.append(action('Regenerate', () => regeneratePhoto(photo)));
  card.append(frame,buttons); grid.append(card);
}
$('#regenerate-copy').addEventListener('click', async () => { if (state.busy) return; if (!draftID) return; state.busy=true; invalidate(); try { await generate('listing_copy', null, true); await persistDraft(); } catch (e) { message('#copy-status', e.message, true); } finally { state.busy=false; } });

async function openEditor(photo) {
  editPhoto = photo; editImage = new Image(); editImage.src = photo.url;
  try { await editImage.decode(); rotation = 0; resetSliders(); drawEditor(); $('#editor-dialog').showModal(); message('#editor-status', ''); }
  catch { message('#photo-status', 'The photo could not be opened for editing.', true); }
}
function resetSliders() { $('#zoom').value = '1'; $('#pan-x').value = '0'; $('#pan-y').value = '0'; }
function drawEditor() {
  if (!editImage) return;
  const canvas = $('#edit-canvas'), context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  const quarter = rotation % 180 !== 0;
  const width = quarter ? editImage.naturalHeight : editImage.naturalWidth;
  const height = quarter ? editImage.naturalWidth : editImage.naturalHeight;
  const scale = Math.min(canvas.width / width, canvas.height / height) * Number($('#zoom').value);
  context.save(); context.translate(canvas.width / 2 + Number($('#pan-x').value) * canvas.width, canvas.height / 2 + Number($('#pan-y').value) * canvas.height);
  context.rotate(rotation * Math.PI / 180); context.scale(scale, scale); context.drawImage(editImage, -editImage.naturalWidth / 2, -editImage.naturalHeight / 2); context.restore();
}
['zoom', 'pan-x', 'pan-y'].forEach(id => $('#' + id).addEventListener('input', drawEditor));
$('#rotate').addEventListener('click', () => { rotation = (rotation + 90) % 360; drawEditor(); });
$('#reset-edit').addEventListener('click', () => { rotation = 0; resetSliders(); drawEditor(); });
$('#save-edit').addEventListener('click', async () => {
  $('#save-edit').disabled = true;
  const target = editPhoto;
  try {
    const blob = await new Promise(resolve => $('#edit-canvas').toBlob(resolve, 'image/jpeg', 0.94));
    if (!blob) throw new Error('Could not save the photo edit.');
    target.asset = null; target.job = null; target.blob = blob; target.failed = false; revoke(target.url); target.url = urlFor(blob);
    invalidate(); renderPhotos(); $('#editor-dialog').close(); message('#photo-status', 'Photo edit applied. Review your updated photos before Quick Save.');
  } catch (error) { message('#editor-status', error.message, true); }
  finally { $('#save-edit').disabled = false; }
});

$('#reviewed').addEventListener('change', async event => {
  if (!event.target.checked) { invalidate(); return; }
  if (state.busy) { event.target.checked = false; message('#review-status', 'Wait for processing to finish, then review your results.'); return; }
  const problem = reviewProblem({ ...values(), photos: state.photos });
  if (problem) { event.target.checked = false; $('#review-label').classList.add('attention'); message('#review-status', problem, true); return; }
  const revision = state.revision;
  message('#review-status', 'Preparing your main photo…');
  try {
    const files = selected().map((photo, i) => new File([photo.blob], photoFilename(i, photo.blob.type), { type: photo.blob.type }));
    const copy = combinedCopy($('#title').value, $('#description').value);
    if (revision !== state.revision || !$('#reviewed').checked) return;
    state.prepared = { revision, files, copy, title: $('#title').value, description: $('#description').value };
    $('#quick-post').disabled = false;
    message('#review-status', copyOnly ? 'Your title and description are ready to copy.' : `${files.length} photo${files.length === 1 ? '' : 's'} and your copy are ready.`);
  } catch (error) { $('#reviewed').checked = false; message('#review-status', error.message, true); }
});
function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) return Promise.resolve(navigator.clipboard.writeText(text)).then(() => true, () => false);
    const area = $('#copy-fallback'), help = $('#save-help'), wasOpen = help.open;
    area.value = text; help.open = true; area.focus(); area.select();
    const copied = document.execCommand('copy');
    if (copied) help.open = wasOpen;
    return Promise.resolve(copied);
  } catch { return Promise.resolve(false); }
}
function resetQuickSave() {
  saveAttempt = null;
  for (const url of savePhotoURLs) revoke(url);
  savePhotoURLs = [];
  $('#individual-photos').replaceChildren();
  $('#copy-fallback').value = '';
  $('#save-help').open = false;
  $('#post-dialog').close();
  $('#quick-post').textContent = 'Quick Save ↗';
  $('#quick-post').removeAttribute('aria-busy');
  $('#save-listing').textContent = 'Save photo + copy text';
  $('#save-listing').removeAttribute('aria-label');
  $('#save-listing').disabled = false;
  $('#save-listing').removeAttribute('aria-busy');
  $('#save-listing').classList.remove('received');
  message('#post-status', '');
}
function individualPhotos(prepared) {
  for (const url of savePhotoURLs) revoke(url);
  savePhotoURLs = [];
  const container = $('#individual-photos'); container.replaceChildren();
  prepared.files.forEach(file => {
    const link = document.createElement('a'); link.href = urlFor(file); savePhotoURLs.push(link.href);
    link.download = file.name; link.target = '_blank'; link.rel = 'noopener'; link.className = 'secondary'; link.textContent = 'Open / download photo'; container.append(link);
  });
}
function shouldShareFiles(prepared) {
  const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  try { return !!(mobile && navigator.share && navigator.canShare?.({ files: prepared.files })); } catch { return false; }
}
function currentSave(attempt) { return saveAttempt === attempt && state.prepared === attempt.prepared && !options.signal?.aborted; }
function renderSave(attempt) {
  if (!currentSave(attempt)) return;
  const pending = attempt.copy === 'pending' || attempt.photo === 'pending';
  const photoAccepted = ['pending', 'shared', 'requested'].includes(attempt.photo);
  const received = attempt.copy === 'done' && photoAccepted;
  attempt.pending = pending;
  attempt.received = received;
  const button = $('#save-listing');
  button.disabled = pending || received;
  button.setAttribute('aria-busy', String(pending));
  button.classList.toggle('received', received);
  button.textContent = received ? '✓' : pending ? 'Saving photo + copying text…' : 'Try Quick Save again';
  if (received) button.setAttribute('aria-label', 'Save requested and title and description copied');
  else button.removeAttribute('aria-label');
  $('#quick-post').disabled = pending;
  $('#quick-post').setAttribute('aria-busy', String(pending));
  $('#quick-post').textContent = received ? '✓ Quick Save' : 'Quick Save ↗';
  const photoNote = { pending: 'Choose Save Image to save to Photos.', shared: 'If you chose Save Image, your photo is saved to Photos.', requested: 'Your photo file is ready to save.', cancelled: 'Photo save cancelled.', failed: 'Photo save could not start.' }[attempt.photo];
  const copyNote = { pending: 'Copying title + description…', done: 'Title + description copied.', failed: 'Text was not copied. Try again or use Help below.' }[attempt.copy];
  message('#post-status', `${copyNote} ${photoNote}`, attempt.copy === 'failed' || attempt.photo === 'failed');
}
function quickSave({again = false} = {}) {
  if (options.signal?.aborted) return;
  const prepared = state.prepared;
  if (!prepared || !$('#reviewed').checked || prepared.revision !== state.revision) { invalidate(); return; }
  if (!$('#post-dialog').open) $('#post-dialog').showModal();
  if (saveAttempt?.pending || (saveAttempt?.received && !again)) return;
  const previousPhoto = saveAttempt?.photo;
  const attempt = { prepared, copy: 'pending', photo: 'pending', pending: true };
  saveAttempt = attempt;
  $('#copy-fallback').value = prepared.copy;
  individualPhotos(prepared);
  message('#help-status', '');
  renderSave(attempt);
  // Start both APIs within the original click. Awaiting clipboard first loses iOS share activation.
  copyText(prepared.copy).then(ok => { if (currentSave(attempt)) { attempt.copy = ok ? 'done' : 'failed'; renderSave(attempt); } });
  if (!again && ['requested', 'shared'].includes(previousPhoto)) { attempt.photo = previousPhoto; renderSave(attempt); return; }
  if (shouldShareFiles(prepared)) {
    try {
      Promise.resolve(navigator.share({ files: prepared.files })).then(() => {
        if (currentSave(attempt)) { attempt.photo = 'shared'; renderSave(attempt); }
      }, error => {
        if (currentSave(attempt)) { attempt.photo = error.name === 'AbortError' ? 'cancelled' : 'failed'; renderSave(attempt); }
      });
    } catch { attempt.photo = 'failed'; renderSave(attempt); }
  } else {
    try { $('#individual-photos a').click(); attempt.photo = 'requested'; }
    catch { attempt.photo = 'failed'; }
    renderSave(attempt);
  }
}
$('#quick-post').addEventListener('click', () => quickSave());
$('#save-listing').addEventListener('click', () => quickSave());
$('#save-again').addEventListener('click', () => quickSave({again: true}));
$('#copy-again').addEventListener('click', () => {
  const prepared = state.prepared;
  if (!prepared || options.signal?.aborted) return;
  copyText(prepared.copy).then(ok => {
    if (state.prepared !== prepared || options.signal?.aborted) return;
    message('#help-status', ok ? 'Title + description copied.' : 'Select the text below and copy it manually.', !ok);
    if (saveAttempt) { saveAttempt.copy = ok ? 'done' : 'failed'; renderSave(saveAttempt); }
  });
});

for (const market of MARKETPLACES) {
  const link = document.createElement('a'); link.href = market.url; link.target = '_blank'; link.rel = 'noopener noreferrer external';
  const text = document.createElement('span'); text.textContent = market.name;
  const arrow = document.createElement('span'); arrow.className = 'external-arrow'; arrow.setAttribute('aria-hidden', 'true');
  link.append(text, arrow); $('#post-links').append(link);
}
$('#start-over').addEventListener('click', () => { if(state.busy){message('#result-note','Let the current workflows finish before starting another listing.');return;} $('#reset-dialog').showModal(); });
$('#confirm-reset').addEventListener('click', () => { clearWorkspace(); $('#reset-dialog').close(); $('#listing-url').value = ''; (copyOnly ? $('#manual-photos') : $('#listing-url')).focus(); message('#import-status', 'Ready for another listing.'); });
root.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {const dialog=button.closest('dialog');if(dialog.id==='account-dialog'){}dialog.close();}));
usage();
async function authClient() { return client; }
async function requireAccount() {
  const {data}=await client.auth.getSession();
  if(data.session)return true;
  options.openAuth();return false;
}
async function api(query='', body, raw=false) {
  if(options.signal?.aborted)throw new Error('Your account changed. Reopen Listing Upgrade.');
  if (document.body.dataset.activation === 'pending') throw new Error('Live processing is awaiting activation.');
  const c=await authClient(), {data}=await c.auth.getSession();
  if(!data.session)throw new Error('Sign in to continue.');
  const headers={apikey:window.DRESSUP_CONFIG.supabasePublishableKey,Authorization:'Bearer '+data.session.access_token};
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(window.DRESSUP_CONFIG.supabaseUrl+'/functions/v1/listing-upgrade'+query,{signal:options.signal,method:body?'POST':'GET',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  if(!r.ok){const problem=await r.json().catch(()=>({}));throw new Error(problem.error||'This step could not be completed. Try again.');}
  return raw ? r : r.json();
}
async function refreshAccount() {
  try {
    const c=await authClient(), {data}=await c.auth.getSession(); if(!data.session)return;
    const result=await api(); liveAccess=result.access;usage();
    options.onAccess(liveAccess);
    const exhausted = liveAccess.tier!=='owner' && (!liveAccess.allowed || liveAccess.remaining===0);
    $('#import-button').disabled=exhausted; $('#manual-load').disabled=exhausted;
    const list=$('#draft-list');list.replaceChildren();
    const upgradeDrafts=(result.drafts||[]).filter(draft=>draft.kind==='upgrade');
    for(const draft of upgradeDrafts){const button=action(draft.source.title||'Untitled listing',async()=>{if(state.busy||openingDraft)return;try{await persistDraft();await openDraft(draft.id);}catch(e){message('#draft-status',e.message,true);}},'secondary');list.append(button);}
    message('#draft-status', upgradeDrafts.length ? 'Saved to your account. Reopen a draft to continue.' : 'Your drafts will appear here.');
  }catch(e){message('#draft-status', e.message, true);}
}
async function uploadAsset(blob, original=false) {
  const form=new FormData();form.set('action','asset');form.set('client_item_id',draftID);form.set('image',blob,'photo.jpg');if(original)form.set('original','1');return api('',form);
}
let saveChain=Promise.resolve();
function persistDraft() {
  if(!draftID||!draftWritable||loadingDraft||options.signal?.aborted)return Promise.resolve();
  clearTimeout(savingTimer);
  const id=draftID, epoch=draftEpoch, snapshot=values(), photos=state.photos.slice(), jobs=JSON.parse(JSON.stringify(activeJobs)), missing=unrestoredPhotos.map(ref=>({...ref}));
  const task=async()=>{
    for(const photo of photos)if(!photo.asset&&!photo.job){if(id!==draftID||epoch!==draftEpoch)return;const blob=photo.blob;const ref=await uploadAsset(blob);if(photo.blob===blob)photo.asset=ref.id;}
    if(id!==draftID||epoch!==draftEpoch)return;
    await api('',{action:'save',id,output:{values:snapshot,jobs,photos:[...photos.map(p=>({id:p.id,asset:p.asset,job:p.job,label:p.label,kind:p.kind,selected:p.selected,sourceId:p.sourceId})),...missing]}});
    message('#draft-status','Draft saved to your account.');
  };
  saveChain=saveChain.catch(()=>{}).then(task);return saveChain;
}
async function openDraft(id) {
  if(openingDraft)return openingDraft;
  const task=(async()=>{const result=await api('?id='+encodeURIComponent(id));if(!options.signal?.aborted)await loadDraft(result.draft,result.jobs);})();
  openingDraft=task;
  try{return await task;}finally{if(openingDraft===task)openingDraft=null;}
}
function hasResult(operation) {
  return operation==='listing_copy' ? !!($('#title').value.trim() && $('#description').value.trim()) : state.photos.some(p=>p.kind?.includes('Ghost mannequin') && p.blob?.size && !p.failed);
}
async function loadDraft(draft, serverJobs=[]) {
  clearWorkspace();draftID=draft.id;activeJobs=structuredClone(draft.output?.jobs||{});
  const epoch=draftEpoch, wasBusy=state.busy, output=draft.output||{};
  const current=()=>epoch===draftEpoch && !options.signal?.aborted;
  loadingDraft=true;state.busy=true;$('#resume-workflows').disabled=true;
  let recovered=false, failed=false;
  try {
  for(const job of serverJobs||[]){
    if(!['listing_copy','creative_image'].includes(job.operation))continue;
    const previous=activeJobs[job.operation];
    activeJobs[job.operation]={id:job.id,status:job.status,applied:previous?.id===job.id && previous.applied===true};
  }
  const originals=[];
  for(const ref of draft.originals){const r=await api(`?id=${draft.id}&asset=${ref.id}`,undefined,true);const photo=await photoFrom(await r.blob(),'Original photo','Original · optional for export',false);if(!current()){revoke(photo.url);return;}Object.assign(photo,{asset:ref.id,id:ref.id,reference:originals.length<(draft.source.reference_count||0)});originals.push(photo);}
  state.originals=originals;state.photos=[];
  for(const ref of output.photos||[]){try{const photo=await restorePhoto(ref,draft.id);if(!current()){revoke(photo.url);return;}state.photos.push(photo);}catch{if(!current())return;unrestoredPhotos.push(ref);}}
  reveal(draft.source,'live');
  fields.forEach(key=>{ $('#'+key).value=output.values?.[key]||''; $('#'+key).disabled=true; });
  invalidate(false);
  setDraftURL(draft.id);
  for(const operation of ['listing_copy','creative_image']){
    if(activeJobs[operation]?.status!=='succeeded'||hasResult(operation))continue;
    // Keep an edited asset reference on a failed download; never replace it with an older generated photo.
    if(operation==='creative_image'&&unrestoredPhotos.some(p=>p.kind?.includes('Ghost')&&p.asset&&!p.job)){failed=true;continue;}
    try{await generate(operation);if(!current())return;recovered=true;}
    catch(error){if(!current())return;failed=true;message(operation==='listing_copy'?'#copy-state':'#ghost-state','Could not restore the saved result. Tap Resume to retry.',true);}
  }
  if(hasResult('listing_copy'))message('#copy-state','Copy ready');
  if(hasResult('creative_image'))message('#ghost-state','Image ready');
  if(unrestoredPhotos.length){failed=true;message('#photo-status','A saved photo could not load. Its saved reference is kept. Tap Resume to retry.',true);}
  message('#result-note',failed?'A saved result could not load. Tap Resume to restore it.':recovered?'Your saved photo and copy have been restored. Review them before saving.':'Saved draft opened. Resume any unfinished work.');
  draftWritable=true;
  } finally {
    if(current()){loadingDraft=false;state.busy=wasBusy;fields.forEach(key=>$('#'+key).disabled=false);$('#resume-workflows').disabled=false;}
  }
  if(current()&&recovered)await persistDraft();
}
async function restorePhoto(ref,id) {
  const r=await api(ref.job?`?job=${ref.job}&result=1`:`?id=${id}&asset=${ref.asset}`,undefined,true);
  let blob;if(ref.job && ref.kind?.includes('Ghost')){const data=await r.json();blob=await (await fetch(`data:${data.mimeType||'image/jpeg'};base64,${data.image}`)).blob();}else blob=await r.blob();
  return Object.assign(await photoFrom(blob,ref.label,ref.kind,ref.selected),ref);
}
async function generate(operation, original=null, retry=false) {
  const id=draftID, epoch=draftEpoch, key=operation+(original?':'+original.id:'');
  const previous=activeJobs[key];
  if (previous?.status === 'succeeded' && previous.applied && !retry && hasResult(operation)) return;
  if(retry && previous?.status==='unknown')throw new Error('This request has an unknown status. Resume it or contact support before retrying.');
  if(!previous || retry) activeJobs[key]={id:crypto.randomUUID(),status:'pending'};
  const job=activeJobs[key];
  const form=new FormData();form.set('action','job');form.set('job_id',job.id);form.set('client_item_id',id);form.set('operation',operation);
  if(original){form.set('client_photo_id',original.id);form.set('image',original.originalBlob,'item.jpg');}
  else {state.originals.slice(0,operation==='listing_copy'?10:6).forEach(p=>form.append('images',p.originalBlob,'item.jpg'));form.set('additional_info',`${combinedCopy(state.original?.title,state.original?.description)}\n${$('#copy-note').value}`);form.set('reference_count',String(state.original?.reference_count||0));form.set('type','ghost');form.set('product_count',String(Math.min(6,state.originals.length)));}
  await persistDraft();
  if(job.status!=='succeeded')await api('',form);
  const statusNode=operation==='listing_copy'?'#copy-state':operation==='creative_image'?'#ghost-state':'#bg-state';
  message(statusNode,'Processing…');
  let result;
  for(let n=0;n<100;n++){
    if(id!==draftID||epoch!==draftEpoch||options.signal?.aborted)return;
    result=await api('?job='+job.id);job.status=result.job.status;
    if(job.status==='succeeded')break;
    if(job.status==='failed'){if(result.job.error_code==='STATUS_UNKNOWN')job.status='unknown';await persistDraft();throw new Error(result.job.error||'Processing failed. Try this workflow again.');}
    await new Promise(resolve=>setTimeout(resolve,3500));
  }
  if(job.status!=='succeeded'){job.status='unknown';await persistDraft();throw new Error('Still processing. Reopen this draft and resume to check the result.');}
  const response=await api('?job='+job.id+'&result=1',undefined,true);
  if(id!==draftID||epoch!==draftEpoch||options.signal?.aborted)return;
  if(operation==='listing_copy'){
    const result=await response.json(), lines=String(result.listing||'').trim().split('\n');
    const title=lines.shift()||'',description=lines.join('\n').trim();
    if(!title.trim()||!description)throw new Error('The saved copy is incomplete. Try Resume again.');
    if(id!==draftID||epoch!==draftEpoch||options.signal?.aborted)return;
    const restoring=previous?.applied&&!retry;
    if(!restoring||!$('#title').value.trim())$('#title').value=title;
    if(!restoring||!$('#description').value.trim())$('#description').value=description;
    message('#copy-state','Copy ready');
  }else{
    let blob;if(operation==='creative_image'){const data=await response.json();blob=await(await fetch(`data:${data.mimeType||'image/jpeg'};base64,${data.image}`)).blob();}else blob=await response.blob();
    const old=state.photos.find(p=>p.job && (p.job===previous?.id||p.job===job.id));
    const photo=await photoFrom(blob,operation==='creative_image'?'Ghost mannequin':`Clean photo ${state.originals.indexOf(original)+1}`,operation==='creative_image'?'Ghost mannequin · AI styling':'Background removed',true);
    if(id!==draftID||epoch!==draftEpoch||options.signal?.aborted){revoke(photo.url);return;}
    Object.assign(photo,{job:job.id,sourceId:original?.id});
    if(old){revoke(old.url);state.photos[state.photos.indexOf(old)]=photo;}else state.photos.push(photo);
    unrestoredPhotos=unrestoredPhotos.filter(ref=>ref.job!==job.id);
    renderPhotos();message(statusNode,operation==='creative_image'?'Image ready':`${Object.entries(activeJobs).filter(([k,v])=>k.startsWith('background_remove')&&v.status==='succeeded').length} / ${state.originals.length} ready`);
  }
  job.applied=true; invalidate();await persistDraft();
}
async function runWorkflows() {
  if(!draftID||!state.originals.length)throw new Error('Add your listing photos first.');
  state.busy=true;$('#resume-workflows').disabled=true;fields.forEach(key=>$('#'+key).disabled=true);invalidate();
  for(const ref of [...unrestoredPhotos]){try{const photo=await restorePhoto(ref,draftID);state.photos.push(photo);unrestoredPhotos=unrestoredPhotos.filter(p=>p!==ref);}catch{/* Keep the reference for another Resume. */}}
  renderPhotos();
  const tasks=[['listing_copy',null],['creative_image',null]];let errors=0;
  async function worker(){while(tasks.length){const [op,photo]=tasks.shift();const key=op+(photo?':'+photo.id:'');try{if(op==='creative_image'&&unrestoredPhotos.some(p=>p.kind?.includes('Ghost')&&p.asset&&!p.job))throw new Error('Your saved photo could not load. Resume to retry; your edit is still saved.');await generate(op,photo,activeJobs[key]?.status==='failed');}catch(e){errors++;message(op==='listing_copy'?'#copy-state':op==='creative_image'?'#ghost-state':'#bg-state',e.message,true);}}}
  try{await Promise.all([worker(),worker()]);message('#result-note',errors?'Some results need attention. Your completed results are saved; use Run / resume to continue.':(copyOnly?'Your copy is ready. Check the details, make your edits, then review to copy it.':'Your upgrade is ready. Edit your main photo and copy, then check the review box.'));}
  finally{state.busy=false;fields.forEach(key=>$('#'+key).disabled=false);$('#resume-workflows').disabled=false;await persistDraft();await refreshAccount();}
}
async function regeneratePhoto(photo){
  if(state.busy)return;state.busy=true;invalidate();
  try{await generate('creative_image',null,true);}
  catch(e){message('#photo-status',e.message,true);}finally{state.busy=false;}
}
$('#resume-workflows').addEventListener('click',()=>{if(!state.busy)runWorkflows().catch(e=>message('#result-note',e.message,true));});


window.addEventListener('beforeunload',event=>{if(state.busy){event.preventDefault();event.returnValue='';}}, {signal:options.signal});
async function updateSession() {
 const {data}=await client.auth.getSession();
 if(!data.session){clearWorkspace();liveAccess=null;usage();$('#draft-list').replaceChildren();options.onAccess(null);return;}
 await refreshAccount();
 const id=new URLSearchParams(location.search).get('draft');
 if(id&&liveAccess&&!draftID)try{await openDraft(id);}catch(e){message('#draft-status',e.message,true);}
}
window.addEventListener('studio:session',()=>{void updateSession();}, {signal:options.signal});
window.addEventListener('studio:allowances-refresh',()=>{void refreshAccount();}, {signal:options.signal});
options.signal?.addEventListener('abort',()=>{clearTimeout(savingTimer);draftID=null;state.busy=false;for(const dialog of root.querySelectorAll('dialog[open]'))dialog.close();for(const url of objectURLs)URL.revokeObjectURL(url);objectURLs.clear();},{once:true});
await updateSession();
}
