(() => {
  'use strict';
  const config = window.DRESSUP_CONFIG || {};
  const client = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let session = null;
  let valuableFeature = '';
  let busy = false;
  let alreadySubscribed = false;
  const studioUrl = '/studio.html';
  function showThanks() { show(alreadySubscribed ? 'paid-thanks-card' : 'decision-card'); }
  const referralSources = new Set(['poshmark', 'instagram', 'tiktok', 'pinterest', 'youtube', 'facebook', 'linkedin', 'search', 'friend', 'event', 'other']);

  function setError(message = '') { $('#survey-error').textContent = message; }
  function show(id) { ['loading-card', 'survey-card', 'decision-card', 'paid-thanks-card'].forEach(card => { $(`#${card}`).hidden = card !== id; }); }
  async function invoke(action, payload = {}) {
    if (!session) throw new Error('Sign in to continue.');
    const response = await fetch(`${config.supabaseUrl}/functions/v1/save-beta-survey`, {
      method: 'POST',
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'We could not save that yet. Please try again.');
    return data;
  }
  async function load() {
    const { data: sessionData } = await client.auth.getSession();
    session = sessionData.session;
    if (!session) { window.location.replace(`${studioUrl}?intent=signin`); return; }
    const response = await fetch(`${config.supabaseUrl}/functions/v1/get-beta-status`, {
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
    });
    const statusData = await response.json().catch(() => ({}));
    const state = statusData.status;
    if (!response.ok || !state?.feedback_available) { window.location.replace(studioUrl); return; }
    alreadySubscribed = state.paid === true;
    if (state.survey_state === 'submitted') { showThanks(); return; }
    if (!state.feedback_prompt_due) { window.location.replace(studioUrl); return; }
    show('survey-card');
  }
  $('#value-choices').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    valuableFeature = button.dataset.value || '';
    $$('#value-choices button').forEach(item => item.classList.toggle('selected', item === button));
    setError();
  });
  $('#survey-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const payload = {
      output_readiness: $('#output-readiness').value,
      most_valuable_feature: valuableFeature,
      friction: $('#friction').value.trim(),
      likely_monthly_volume: $('#likely-volume').value,
      price_fit: $('#price-fit').value,
      definite_yes: $('#definite-yes').value.trim(),
      how_heard: $('#how-heard').value || null,
      how_heard_detail: $('#how-heard-detail').value.trim() || null,
    };
    if (!payload.output_readiness || !payload.most_valuable_feature || !payload.likely_monthly_volume || !payload.price_fit) {
      setError('Choose an answer for each required question.'); return;
    }
    if ((payload.how_heard && !referralSources.has(payload.how_heard)) || (payload.how_heard_detail || '').length > 120 || (!payload.how_heard && payload.how_heard_detail)) {
      setError('Choose where you heard about Studio if you add a detail. Keep the optional detail to 120 characters.'); return;
    }
    busy = true; const button = $('#submit-survey'); button.disabled = true; button.textContent = 'Saving…';
    try { await invoke('submit', payload); showThanks(); }
    catch (error) { setError(error.message); button.disabled = false; button.innerHTML = 'Save my feedback <span>→</span>'; }
    finally { busy = false; }
  });
  $('#skip-survey').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#skip-survey').disabled = true;
    try { await invoke('skip'); window.location.replace(studioUrl); }
    catch (error) { setError(error.message); $('#skip-survey').disabled = false; busy = false; }
  });
  $('#continue-beta').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#continue-beta').disabled = true; $('#continue-beta').textContent = 'Opening checkout…';
    try { await invoke('continue'); window.location.assign(`${studioUrl}?intent=subscribe`); }
    catch (error) { window.alert(error.message); $('#continue-beta').disabled = false; $('#continue-beta').innerHTML = 'Continue to secure checkout <span>→</span>'; busy = false; }
  });
  $('#no-thanks').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#no-thanks').disabled = true;
    try { await invoke('no_thanks'); window.location.replace(studioUrl); }
    catch (error) { window.alert(error.message); $('#no-thanks').disabled = false; busy = false; }
  });
  $('#return-studio').addEventListener('click', () => window.location.replace(studioUrl));
  if (client) void load().catch(() => { window.location.replace(studioUrl); }); else window.location.replace(studioUrl);
})();
