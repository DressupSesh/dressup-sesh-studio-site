import {getClient,workflowNotice} from '/studio-client.mjs';
import { ALLOWANCES, PLAN_NAMES, MARKETPLACES, listingLink, combinedCopy, reviewProblem, photoFilename } from './core.mjs';

const $ = selector => document.querySelector(selector);
const state = { photos: [], originals: [], original: null, mode: '', revision: 0, busy: false, prepared: null, plan: 'free' };
const copyOnly = document.body.dataset.tool === 'copy';
let draftID = null, activeJobs = {}, savingTimer = null, liveAccess = null, client = null, authCaptcha = null;
const fields = ['title', 'description', 'brand', 'size', 'condition', 'price'];
let editPhoto = null, editImage = null, rotation = 0, nativeInstall = null, nextPhotoID = 0;
const objectURLs = new Set();
const urlFor = blob => { const url = URL.createObjectURL(blob); objectURLs.add(url); return url; };
function revoke(url) { if (url) { URL.revokeObjectURL(url); objectURLs.delete(url); } }
function message(selector, text, error = false) { const node = $(selector); node.textContent = text; node.classList.toggle('error', error); }
function values() { return Object.fromEntries(fields.map(key => [key, $('#' + key).value])); }
function selected() { return state.photos.filter(photo => photo.selected); }
function invalidate() {
  state.revision++;
  if (draftID) { clearTimeout(savingTimer); savingTimer = setTimeout(() => persistDraft().catch(error => message('#draft-status', error.message, true)), 800); }
  $('#reviewed').checked = false;
  $('#quick-post').disabled = true;
  if (state.prepared) revoke(state.prepared.zipURL);
  state.prepared = null;
  $('#review-label').classList.remove('attention');
  message('#review-status', state.mode ? 'Review your latest changes to enable Quick Post.' : '');
  $('#title-count').textContent = `${$('#title').value.length} / 200`;
}
function usage() {
  if (copyOnly) { $('#plan-caption').textContent=liveAccess && ['member','pro','owner'].includes(liveAccess.tier) ? 'Unlimited listing copy' : 'Free member · 10 copy outputs / month'; $('#usage-caption').textContent=state.mode==='sample'?'Example · no allowance used':liveAccess?`${liveAccess.free_copy_remaining ?? 'Unlimited'} left this month`:'Sign in to see your allowance'; return; }
  if (liveAccess) { $('#plan-caption').textContent = `${liveAccess.tier === 'member' ? 'Member' : liveAccess.tier} · ${liveAccess.limit} upgrades / month`; $('#usage-caption').textContent = `${liveAccess.remaining} left · resets ${new Date(liveAccess.resets_at).toLocaleDateString()}`; return; }
  $('#plan-caption').textContent = `${PLAN_NAMES[state.plan]} · ${ALLOWANCES[state.plan]} upgrades / month`;
  $('#usage-caption').textContent = state.mode === 'sample' ? 'Example · no allowance used' : 'Sign in to see your allowance';
}
fields.forEach(key => $('#' + key).addEventListener('input', invalidate));

function clearWorkspace() {
  draftID = null; activeJobs = {}; clearTimeout(savingTimer);
  invalidate();
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  state.photos = []; state.originals = []; state.original = null; state.mode = '';
  fields.forEach(key => { $('#' + key).value = ''; });
  $('#photo-grid').replaceChildren(); $('#original-photos').replaceChildren();
  $('#workspace').hidden = true; $('#welcome').hidden = false;
  $('#copy-note').value = '';
  usage();
}
function reveal(original, mode) {
  state.mode = mode; state.original = original;
  fields.forEach(key => { $('#' + key).value = original[key] || ''; });
  $('#original-title').textContent = original.title;
  $('#original-description').textContent = original.description;
  $('#source-caption').textContent = mode === 'sample' ? '· jacket example' : '· your listing details';
  $('#result-label').textContent = mode === 'sample' ? 'JACKET EXAMPLE · REAL STUDIO OUTPUT' : 'YOUR UPLOADED LISTING';
  $('#result-note').textContent = mode === 'sample'
    ? 'Actual Studio results from this jacket. Review the photos and copy, then test saving. This example does not use your allowance.'
    : 'Your original listing is kept alongside your editable results. Check every detail before posting.';
  $('#bg-state').textContent = mode === 'sample' ? '1 / 1 ready' : 'Ready to run';
  $('#copy-state').textContent = mode === 'sample' ? 'Actual Studio copy' : 'Ready to run';
  $('#ghost-state').textContent = mode === 'sample' ? 'Image ready' : 'Ready to run';
  message('#copy-status', mode === 'sample' ? 'This is the actual copy generated for the jacket.' : 'Use your notes to refine the next draft.');
  $('#resume-workflows').hidden = mode === 'sample';
  $('#workspace').hidden = false; $('#welcome').hidden = true;
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
async function sampleAsset(path, label, kind, choose) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${label}. Please try again.`);
  return photoFrom(await response.blob(), label, kind, choose);
}
$('#sample').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true; $('#sample').disabled = true;
  message('#import-status', 'Loading the jacket example…');
  try {
    const photos = await Promise.all([
      sampleAsset('/assets/jacket-background-removed.jpeg', 'Clean background', 'Background removed · sample', true),
      sampleAsset('/assets/jacket-ghost-mannequin.jpeg', 'Ghost mannequin', 'AI styling image · sample', true),
      sampleAsset('/assets/jacket-before.jpeg', 'Original photo', 'Original · optional for export', false)
    ]);
    // Retain the current workspace if the sample cannot be loaded completely.
    clearWorkspace();
    // clearWorkspace revoked the new temporary object URLs too; recreate them.
    for (const photo of photos) photo.url = urlFor(photo.blob);
    state.photos = photos; state.originals = [photos[2]];
    reveal({"title": "Black Leather-Style Zip Front Jacket With Point Collar And Front Pockets", "description": "Black jacket with a zip-front closure, pointed collar, long sleeves, seam detailing, and two front welt pockets. The structured silhouette makes it an easy everyday outer layer.\n\nA versatile piece for moto-inspired, minimalist, casual, and downtown streetwear looks. Style with denim, boots, graphic tees, or layered over knitwear for an understated edgy outfit.\n\nGood condition. Visible creasing throughout the exterior consistent with wear.\n\nKeywords: black jacket, zip front jacket, leather-style jacket, moto-inspired jacket, casual outerwear, minimalist jacket, streetwear jacket, pointed collar jacket, everyday jacket\n\nEstimated era: 2010s\u20132020s\nApprox. original retail: $60\u2013$120", "brand": "", "size": "", "condition": "Good condition; exterior creasing.", "price": ""}, 'sample');
    message('#import-status', 'Jacket example loaded. No upgrade was charged.');
  } catch (error) { message('#import-status', error.message, true); }
  finally { state.busy = false; $('#sample').disabled = false; }
});
$('#import-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  try {
    const url = listingLink($('#listing-url').value.trim());
    if (!await requireAccount()) return;
    state.busy = true; $('#import-button').disabled = true;
    message('#import-status', 'Importing the listing photos and details…');
    const result = await api('', { action: 'import', id: crypto.randomUUID(), url });
    await loadDraft(result.draft);
    if (result.missingPhotos) message('#import-status', `${result.missingPhotos} photos could not be imported. Add the missing photos before posting.`, true);
    else message('#import-status', `${state.originals.length} photos imported. Compare with your original listing and add any missing photos.`);
    await runWorkflows();
  } catch (error) { message('#import-status', error.message, true); $('#manual').open = true; }
  finally { state.busy = false; $('#import-button').disabled = false; }
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
    if (!await requireAccount()) return;
    const photos = await readFiles($('#manual-photos').files, copyOnly ? 10 : 16);
    const references = copyOnly && $('#manual-references')?.files.length ? await readFiles($('#manual-references').files, 10 - photos.length) : [];
    references.forEach(p => { p.selected=false; p.reference=true; p.kind='Reference photo'; });
    const original = { title: $('#manual-title')?.value.trim() || '', description: $('#manual-description')?.value.trim() || '', brand: $('#manual-brand')?.value.trim() || '', reference_count: references.length };
    clearWorkspace();
    for (const photo of [...references,...photos]) photo.url = urlFor(photo.blob);
    state.photos = photos; state.originals = [...references,...photos].map(photo => ({ ...photo }));
    reveal(original, 'manual');
    const created = await api('', { action: 'create', id: crypto.randomUUID(), kind: copyOnly ? 'free_copy' : 'upgrade', source: original }); draftID = created.draft.id;
    for (const photo of state.originals) { const ref = await uploadAsset(photo.blob, true); Object.assign(photo, {asset: ref.id, id: ref.id}); }
    state.photos = state.originals.filter(p=>!p.reference).map(p => ({...p})); renderPhotos();
    history.replaceState(null, '', '?draft=' + draftID);
    await persistDraft(); await runWorkflows();
  } catch (error) { message('#manual-status', error.message, true); }
  finally { state.busy = false; $('#manual-load').disabled = false; }
});
$('#add-photo').addEventListener('change', async event => {
  if (!event.target.files.length) return;
  try { const photos = await readFiles(event.target.files, Math.max(0, 48 - state.photos.length)); state.photos.push(...photos); invalidate(); renderPhotos(); message('#photo-status', 'Photo added. Review your selection again.'); }
  catch (error) { message('#photo-status', error.message, true); }
  event.target.value = '';
});
function renderOriginals() {
  const container = $('#original-photos'); container.replaceChildren();
  for (const photo of state.originals) { const img = new Image(); img.src = urlFor(photo.originalBlob); img.alt = 'Original listing photo'; container.append(img); }
}
function action(label, handler, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className; button.addEventListener('click', handler); return button;
}
function renderPhotos() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  state.photos.forEach((photo, index) => {
    const card = document.createElement('article'); card.className = 'photo-card' + (photo.selected ? ' selected' : '');
    const frame = document.createElement('div'); frame.className = 'photo-preview';
    const img = new Image(); img.src = photo.url; img.alt = photo.label;
    img.addEventListener('error', () => { photo.failed = true; invalidate(); message('#photo-status', `${photo.label} could not be displayed. Replace it or deselect it before Quick Post.`, true); });
    const label = document.createElement('label'); label.className = 'photo-check';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = photo.selected; check.setAttribute('aria-label', 'Include ' + photo.label);
    check.addEventListener('change', () => { photo.selected = check.checked; invalidate(); card.classList.toggle('selected', photo.selected); });
    label.append(check, document.createTextNode('Save')); frame.append(img, label);
    const meta = document.createElement('div'); meta.className = 'photo-meta';
    const name = document.createElement('strong'); name.textContent = `${index + 1}. ${photo.label}`;
    const kind = document.createElement('small'); kind.textContent = photo.kind;
    const buttons = document.createElement('div'); buttons.className = 'photo-actions';
    buttons.append(action('Edit', () => openEditor(photo)));
    const undo = action('Undo', () => { photo.blob = photo.originalBlob; photo.asset = null; photo.job = null; revoke(photo.url); photo.url = urlFor(photo.blob); photo.failed = false; invalidate(); renderPhotos(); }); undo.disabled = photo.blob === photo.originalBlob; buttons.append(undo);
    const move = action('←', () => { if (index > 0) { [state.photos[index - 1], state.photos[index]] = [state.photos[index], state.photos[index - 1]]; invalidate(); renderPhotos(); } }); move.setAttribute('aria-label', 'Move ' + photo.label + ' earlier'); move.disabled = index === 0; buttons.append(move);
    buttons.append(action('Remove', () => { state.photos = state.photos.filter(p => p.id !== photo.id); revoke(photo.url); invalidate(); renderPhotos(); }, 'remove'));
    if (photo.job && draftID) buttons.append(action('Regenerate', () => regeneratePhoto(photo)));
    meta.append(name, kind, buttons); card.append(frame, meta); grid.append(card);
  });
  if (!state.photos.length) message('#photo-status', 'Add a photo to continue.');
}
$('#regenerate-copy').addEventListener('click', async () => { if (state.busy) return; if (!draftID) { message('#copy-status', 'The example shows actual saved output. Start your own listing to generate new copy.'); return; } state.busy=true; try { await generate('listing_copy', null, true); await persistDraft(); } catch (e) { message('#copy-status', e.message, true); } finally { state.busy=false; } });

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
    invalidate(); renderPhotos(); $('#editor-dialog').close(); message('#photo-status', 'Photo edit applied. Review your updated photos before Quick Post.');
  } catch (error) { message('#editor-status', error.message, true); }
  finally { $('#save-edit').disabled = false; }
});

$('#reviewed').addEventListener('change', async event => {
  if (!event.target.checked) { invalidate(); return; }
  if (state.busy) { event.target.checked = false; message('#review-status', 'Wait for processing to finish, then review your results.'); return; }
  const problem = reviewProblem({ ...values(), photos: state.photos });
  if (problem) { event.target.checked = false; $('#review-label').classList.add('attention'); message('#review-status', problem, true); return; }
  const revision = state.revision;
  message('#review-status', 'Preparing your selected photos…');
  try {
    const files = selected().map((photo, i) => new File([photo.blob], photoFilename(i, photo.blob.type), { type: photo.blob.type }));
    const copy = combinedCopy($('#title').value, $('#description').value);
    if (revision !== state.revision || !$('#reviewed').checked) return;
    state.prepared = { revision, files, copy, title: $('#title').value, description: $('#description').value };
    $('#quick-post').disabled = false;
    message('#review-status', copyOnly ? 'Your title and description are ready to copy.' : `${files.length} photo${files.length === 1 ? '' : 's'} and your copy are ready.`);
  } catch (error) { $('#reviewed').checked = false; message('#review-status', error.message, true); }
});
function copyText(text, status = '#post-copy-status') {
  const report = success => { message(status, success ? 'Copied. Your title and description are ready to paste.' : 'Copy was blocked. Use the copy button again or select the text under “Need separate fields?”.', !success); return success; };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => report(true), () => report(false));
  const area = $('#copy-fallback'); area.value = text; area.closest('details').open = true; area.focus(); area.select();
  try { return Promise.resolve(report(document.execCommand('copy'))); } catch { return Promise.resolve(report(false)); }
}
async function downloadZip() {
  if (!state.prepared) return;
  try {
    const zip = new window.JSZip(); state.prepared.files.forEach(file => zip.file(file.name, file)); zip.file('Listing Copy.txt', state.prepared.copy);
    const blob = await zip.generateAsync({type:'blob'}); const a = document.createElement('a'); a.href = urlFor(blob); a.download = 'Listing-Upgrade.zip'; a.click();
    message('#post-save-status', 'Optional ZIP download requested.');
  } catch { message('#post-save-status', 'ZIP could not be prepared. Save the individual photos below.', true); }
}
function individualPhotos() {
  const container = $('#individual-photos'); container.replaceChildren();
  state.prepared.files.forEach((file, index) => {
    const link = document.createElement('a'); link.href = urlFor(file); link.download = file.name; link.target = '_blank'; link.className = 'secondary'; link.textContent = `Save Photo ${index + 1}`; container.append(link);
  });
  container.hidden = false;
  message('#post-save-status', 'Tap each photo to save it. On iPhone, open a photo and use Share → Save Image if needed.');
}
function canShareFiles() { try { return !!(state.prepared && navigator.share && navigator.canShare?.({ files: state.prepared.files })); } catch { return false; } }
function sharePhotos() {
  if (!canShareFiles()) { individualPhotos(); return; }
  // Invoked directly from a click, with files prepared ahead of time for iOS user activation.
  navigator.share({ files: state.prepared.files }).then(() => message('#post-save-status', 'Share sheet completed. Confirm the photos were saved to your chosen location.'), error => {
    message('#post-save-status', error.name === 'AbortError' ? 'Save / share cancelled. Tap Save / share photos to try again, or save the individual photos below.' : 'Sharing was unavailable. Save the individual photos below or try again.', error.name !== 'AbortError');
  });
}
$('#quick-post').addEventListener('click', () => {
  if (!state.prepared || !$('#reviewed').checked || state.prepared.revision !== state.revision) { invalidate(); return; }
  $('#copy-fallback').value = state.prepared.copy;
  individualPhotos();
  $('#post-dialog').showModal();
  message('#post-save-status', 'Preparing your photo handoff…');
  copyText(state.prepared.copy);
  if(copyOnly){$('#individual-photos').hidden=true;message('#post-save-status','');}
  else if (canShareFiles() && /iPhone|iPad|Android/i.test(navigator.userAgent)) sharePhotos();
  else individualPhotos();
});
$('#copy-again').addEventListener('click', () => state.prepared && copyText(state.prepared.copy));
$('#copy-title').addEventListener('click', () => state.prepared && copyText(state.prepared.title).then(ok => { if (ok) message('#post-copy-status', 'Title copied.'); }));
$('#copy-description').addEventListener('click', () => state.prepared && copyText(state.prepared.description).then(ok => { if (ok) message('#post-copy-status', 'Description copied.'); }));
$('#save-phone').addEventListener('click', sharePhotos);
$('#save-zip').addEventListener('click', downloadZip);
for (const market of MARKETPLACES) {
  const link = document.createElement('a'); link.href = market.url; link.target = '_blank'; link.rel = 'noopener noreferrer external';
  const text = document.createElement('span'); text.textContent = market.name;
  const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
  link.append(text, arrow); $('#post-links').append(link);
}
$('#start-over').addEventListener('click', () => { if(state.busy){message('#result-note','Let the current workflows finish before starting another listing.');return;} $('#reset-dialog').showModal(); });
$('#confirm-reset').addEventListener('click', () => { clearWorkspace(); $('#reset-dialog').close(); $('#listing-url').value = ''; (copyOnly ? $('#manual-photos') : $('#listing-url')).focus(); message('#import-status', 'Ready for another listing.'); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

function deviceInstructions(device) {
  document.querySelectorAll('[data-device]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.device === device)));
  const steps = device === 'android'
    ? ['Open this page in <strong>Chrome</strong>.', 'Tap the <strong>three-dot menu</strong>, then <strong>Add to Home screen</strong> or <strong>Install app</strong>.', 'Confirm the name, then tap <strong>Add</strong> or <strong>Install</strong>.']
    : ['Open this page in <strong>Safari</strong>.', 'Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. You may need to tap More first.', 'Turn on <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.'];
  $('#install-steps').innerHTML = steps.map(text => `<li>${text}</li>`).join(''); // Static, developer-authored strings only.
}
function showInstall() { location.assign('/save-studio/'); }
$('#install-open').addEventListener('click', showInstall); $('#install-bottom').addEventListener('click', showInstall);
document.querySelectorAll('[data-device]').forEach(button => button.addEventListener('click', () => deviceInstructions(button.dataset.device)));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); nativeInstall = event; $('#native-install').hidden = false; });
$('#native-install').addEventListener('click', async () => { if (!nativeInstall) return; await nativeInstall.prompt(); nativeInstall = null; $('#native-install').hidden = true; });
window.addEventListener('appinstalled', () => { $('#native-install').hidden = true; });
usage();

async function authClient() {
  if (!client) {
    client = await getClient();
    client.auth.onAuthStateChange((_event, session) => { $('#account-open').textContent = session ? 'My account' : 'Sign in'; $('#sign-out').hidden = !session; if (session) setTimeout(refreshAccount, 0); });
  }
  return client;
}
async function requireAccount() {
  const c = await authClient(); const {data} = await c.auth.getSession();
  if (data.session) return true;
  openAccount(); message('#account-status', 'Sign in or create a free account to run the tools.'); return false;
}
function openAccount() {
  $('#account-dialog').showModal();
  if (!authCaptcha) authCaptcha = window.DRESSUP_TURNSTILE.create('account-captcha', {onError:text=>message('#account-status',text,true)});
}
$('#account-open').addEventListener('click', openAccount);
async function signIn(emailLink) {
  try {
    if (!$('#account-email').reportValidity()) return;
    const captchaToken = authCaptcha?.getToken(); if (authCaptcha?.enabled && !captchaToken) throw new Error('Complete the security check first.');
    const c = await authClient(), email = $('#account-email').value.trim();
    const result = emailLink
      ? await c.auth.signInWithOtp({email,options:{shouldCreateUser:true,captchaToken,emailRedirectTo:'https://dressupsesh.studio/studio/'}})
      : await c.auth.signInWithPassword({email,password:$('#account-password').value,options:{captchaToken}});
    authCaptcha?.reset(); if (result.error) throw result.error;
    message('#account-status', emailLink ? 'Check your email for the newest secure sign-in link.' : 'Signed in.');
    if (!emailLink) { $('#account-password').value=''; $('#account-dialog').close(); await refreshAccount(); }
  } catch(error) { message('#account-status', error.message, true); }
}
$('#account-form').addEventListener('submit', event=>{event.preventDefault();signIn(false);});
$('#email-link').addEventListener('click', ()=>signIn(true));
$('#sign-out').addEventListener('click', async()=>{await (await authClient()).auth.signOut();clearWorkspace();liveAccess=null;usage();$('#draft-list').replaceChildren();$('#account-dialog').close();});
$('#activate-trial').addEventListener('click', async()=>{try{if(!await requireAccount())return;await api('',{action:'trial'});message('#account-status','Trial activated. Open The Studio to use your 3-item trial.');await refreshAccount();}catch(e){message('#account-status',e.message,true);}});
async function api(query='', body, raw=false) {
  if (document.body.dataset.activation === 'pending') throw new Error('Live processing is awaiting activation. The jacket example is available to test editing and saving.');
  const c=await authClient(), {data}=await c.auth.getSession();
  if(!data.session)throw new Error('Sign in to continue.');
  const headers={apikey:window.DRESSUP_CONFIG.supabasePublishableKey,Authorization:'Bearer '+data.session.access_token};
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(window.DRESSUP_CONFIG.supabaseUrl+'/functions/v1/listing-upgrade'+query,{method:body?'POST':'GET',headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  if(!r.ok){const problem=await r.json().catch(()=>({}));throw new Error(problem.error||'This step could not be completed. Try again.');}
  return raw ? r : r.json();
}
async function refreshAccount() {
  try {
    const c=await authClient(), {data}=await c.auth.getSession(); if(!data.session)return;
    const result=await api(); liveAccess=result.access;usage();void workflowNotice();
    $('#activate-trial').hidden=!!liveAccess.trial_active;
    const list=$('#draft-list');list.replaceChildren();
    for(const draft of result.drafts){const button=action(draft.source.title||'Untitled listing',async()=>{if(state.busy)return;try{await persistDraft();await loadDraft((await api('?id='+draft.id)).draft);}catch(e){message('#draft-status',e.message,true);}},'secondary');list.append(button);}
    message('#draft-status', result.drafts.length ? 'Saved to your account. Reopen a draft to continue.' : 'Your drafts will appear here.');
  }catch(e){message('#draft-status', e.message, true);}
}
async function uploadAsset(blob, original=false) {
  const form=new FormData();form.set('action','asset');form.set('client_item_id',draftID);form.set('image',blob,'photo.jpg');if(original)form.set('original','1');return api('',form);
}
let saveChain=Promise.resolve();
function persistDraft() {
  if(!draftID)return Promise.resolve();
  const id=draftID, snapshot=values(), photos=state.photos.slice(), jobs=JSON.parse(JSON.stringify(activeJobs));
  const task=async()=>{
    for(const photo of photos)if(!photo.asset&&!photo.job){if(id!==draftID)return;const blob=photo.blob;const ref=await uploadAsset(blob);if(photo.blob===blob)photo.asset=ref.id;}
    if(id!==draftID)return;
    await api('',{action:'save',id,output:{values:snapshot,jobs,photos:photos.map(p=>({id:p.id,asset:p.asset,job:p.job,label:p.label,kind:p.kind,selected:p.selected,sourceId:p.sourceId}))}});
    message('#draft-status','Draft saved to your account.');
  };
  saveChain=saveChain.catch(()=>{}).then(task);return saveChain;
}
async function loadDraft(draft) {
  clearWorkspace();draftID=draft.id;activeJobs=draft.output.jobs||{};
  const originals=[];
  for(const ref of draft.originals){const r=await api(`?id=${draft.id}&asset=${ref.id}`,undefined,true);const photo=await photoFrom(await r.blob(),'Original photo','Original · optional for export',false);Object.assign(photo,{asset:ref.id,id:ref.id,reference:originals.length<(draft.source.reference_count||0)});originals.push(photo);}
  state.originals=originals;state.photos=[];
  for(const ref of draft.output.photos||[]){try{const photo=await restorePhoto(ref,draft.id);state.photos.push(photo);}catch{message('#photo-status','A saved photo could not be loaded. Run / resume workflows or reload before posting.',true);}}
  if(!state.photos.length)state.photos=originals.filter(p=>!p.reference).map(p=>({...p,selected:copyOnly}));
  reveal(draft.source,'live');
  if(draft.output.values) fields.forEach(key=>{ $('#'+key).value=draft.output.values[key]||''; });
  invalidate();
  history.replaceState(null,'','?draft='+draft.id);
  message('#draft-status','Saved draft opened. Run / resume to finish any pending workflows.');
  $('#result-label').textContent='YOUR LISTING UPGRADE';
}
async function restorePhoto(ref,id) {
  const r=await api(ref.job?`?job=${ref.job}&result=1`:`?id=${id}&asset=${ref.asset}`,undefined,true);
  let blob;if(ref.kind?.includes('Ghost')){const data=await r.json();blob=await (await fetch(`data:${data.mimeType||'image/jpeg'};base64,${data.image}`)).blob();}else blob=await r.blob();
  return Object.assign(await photoFrom(blob,ref.label,ref.kind,ref.selected),ref);
}
async function generate(operation, original=null, retry=false) {
  const id=draftID, key=operation+(original?':'+original.id:'');
  const previous=activeJobs[key];
  if (previous?.status === 'succeeded' && previous.applied && !retry) return;
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
    if(id!==draftID)return;
    result=await api('?job='+job.id);job.status=result.job.status;
    if(job.status==='succeeded')break;
    if(job.status==='failed'){if(result.job.error_code==='STATUS_UNKNOWN')job.status='unknown';await persistDraft();throw new Error(result.job.error||'Processing failed. Try this workflow again.');}
    await new Promise(resolve=>setTimeout(resolve,3500));
  }
  if(job.status!=='succeeded'){job.status='unknown';await persistDraft();throw new Error('Still processing. Reopen this draft and resume to check the result.');}
  const response=await api('?job='+job.id+'&result=1',undefined,true);
  if(operation==='listing_copy'){
    const result=await response.json(), lines=String(result.listing||'').trim().split('\n');
    $('#title').value=lines.shift()||'';$('#description').value=lines.join('\n').trim();message('#copy-state','Copy ready');
  }else{
    let blob;if(operation==='creative_image'){const data=await response.json();blob=await(await fetch(`data:${data.mimeType||'image/jpeg'};base64,${data.image}`)).blob();}else blob=await response.blob();
    const old=state.photos.find(p=>p.job && (p.job===previous?.id||p.job===job.id));
    const photo=await photoFrom(blob,operation==='creative_image'?'Ghost mannequin':`Clean photo ${state.originals.indexOf(original)+1}`,operation==='creative_image'?'Ghost mannequin · AI styling':'Background removed',true);
    Object.assign(photo,{job:job.id,sourceId:original?.id});
    if(old)state.photos[state.photos.indexOf(old)]=photo;else state.photos.push(photo);
    renderPhotos();message(statusNode,operation==='creative_image'?'Image ready':`${Object.entries(activeJobs).filter(([k,v])=>k.startsWith('background_remove')&&v.status==='succeeded').length} / ${state.originals.length} ready`);
  }
  job.applied=true; invalidate();await persistDraft();
}
async function runWorkflows() {
  if(!draftID||!state.originals.length)throw new Error('Add your listing photos first.');
  state.busy=true;$('#resume-workflows').disabled=true;fields.forEach(key=>$('#'+key).disabled=true);invalidate();
  const tasks=copyOnly ? [['listing_copy',null]] : [['listing_copy',null],['creative_image',null],...state.originals.map(p=>['background_remove',p])];let errors=0;
  async function worker(){while(tasks.length){const [op,photo]=tasks.shift();const key=op+(photo?':'+photo.id:'');try{await generate(op,photo,activeJobs[key]?.status==='failed');}catch(e){errors++;message(op==='listing_copy'?'#copy-state':op==='creative_image'?'#ghost-state':'#bg-state',e.message,true);}}}
  try{await Promise.all([worker(),worker(),worker()]);message('#result-note',errors?'Some results need attention. Your completed results are saved; use Run / resume to continue.':(copyOnly?'Your copy is ready. Check the details, make your edits, then review to copy it.':'Your upgrade is ready. Edit your photos and copy, then check the review box.'));}
  finally{state.busy=false;fields.forEach(key=>$('#'+key).disabled=false);$('#resume-workflows').disabled=false;await persistDraft();await refreshAccount();}
}
async function regeneratePhoto(photo){
  if(state.busy)return;state.busy=true;
  try{await generate(photo.sourceId?'background_remove':'creative_image',state.originals.find(p=>p.id===photo.sourceId)||null,true);}
  catch(e){message('#photo-status',e.message,true);}finally{state.busy=false;}
}
$('#resume-workflows').addEventListener('click',()=>{if(!state.busy)runWorkflows().catch(e=>message('#result-note',e.message,true));});
if(location.hash === '#account') openAccount();
if(location.hash === '#install') showInstall();
window.addEventListener('beforeunload',event=>{if(state.busy){event.preventDefault();event.returnValue='';}});
refreshAccount().then(async()=>{const id=new URLSearchParams(location.search).get('draft');if(id&&liveAccess)try{await loadDraft((await api('?id='+encodeURIComponent(id))).draft);}catch(e){message('#draft-status',e.message,true);}});

document.querySelectorAll('[data-checkout]').forEach(button=>button.addEventListener('click',async()=>{
 try {
  if(document.body.dataset.activation==='pending')throw new Error('The updated plans are awaiting live activation. No payment has been started.');
  if(!await requireAccount())return;
  const c=await authClient(),{data}=await c.auth.getSession();
  const r=await fetch(window.DRESSUP_CONFIG.supabaseUrl+'/functions/v1/create-checkout-session',{method:'POST',headers:{apikey:window.DRESSUP_CONFIG.supabasePublishableKey,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({tier:button.dataset.checkout})});
  const result=await r.json();if(!r.ok||!result.url)throw new Error(result.error||'Could not open billing.');
  const url=new URL(result.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new Error('Invalid billing destination.');
  location.assign(url.href);
 }catch(e){message('#account-status',e.message,true);}
}));
