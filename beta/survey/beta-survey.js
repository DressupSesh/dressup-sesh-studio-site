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

  function setError(message = '') { $('#survey-error').textContent = message; }
  function show(id) { ['loading-card', 'survey-card', 'decision-card'].forEach(card => { $(`#${card}`).hidden = card !== id; }); }
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
    if (!session) { window.location.replace('../../?intent=signin'); return; }
    const response = await fetch(`${config.supabaseUrl}/functions/v1/get-beta-status`, {
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
    });
    const statusData = await response.json().catch(() => ({}));
    const state = statusData.status;
    if (!response.ok || !state?.enrolled || state.trial_completed_items < 3) { window.location.replace('../../'); return; }
    if (state.paid_beta_decision || state.survey_state === 'submitted') { show('decision-card'); return; }
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
    };
    if (!payload.output_readiness || !payload.most_valuable_feature || !payload.likely_monthly_volume || !payload.price_fit) {
      setError('Choose an answer for each required question.'); return;
    }
    busy = true; const button = $('#submit-survey'); button.disabled = true; button.textContent = 'Savingâ¦';
    try { await invoke('submit', payload); show('decision-card'); }
    catch (error) { setError(error.message); button.disabled = false; button.innerHTML = 'Save my feedback <span>â</span>'; }
    finally { busy = false; }
  });
  $('#skip-survey').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#skip-survey').disabled = true;
    try { await invoke('skip'); window.location.replace('../../'); }
    catch (error) { setError(error.message); $('#skip-survey').disabled = false; busy = false; }
  });
  $('#continue-beta').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#continue-beta').disabled = true; $('#continue-beta').textContent = 'Opening checkoutâ¦';
    try { await invoke('continue'); window.location.assign('../../?intent=subscribe'); }
    catch (error) { window.alert(error.message); $('#continue-beta').disabled = false; $('#continue-beta').innerHTML = 'Continue to secure checkout <span>â</span>'; busy = false; }
  });
  $('#no-thanks').addEventListener('click', async () => {
    if (busy) return; busy = true; $('#no-thanks').disabled = true;
    try { await invoke('no_thanks'); window.location.replace('../../'); }
    catch (error) { window.alert(error.message); $('#no-thanks').disabled = false; busy = false; }
  });
  if (client) void load(); else window.location.replace('../../');
})();
