(() => {
  'use strict';

  const config = window.DRESSUP_CONFIG || {};
  const client = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;
  const storageKey = 'dressupSeshBetaIntake';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const source = (() => {
    const value = new URLSearchParams(window.location.search).get('ref') || new URLSearchParams(window.location.search).get('source') || '';
    return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : '';
  })();
  const state = { step: 1, relationship: '', platforms: new Set(), submitting: false };
  const captcha = window.DRESSUP_TURNSTILE?.create('beta-turnstile', {
    action: 'studio_beta_signup',
    onError: message => { $('#step-two-error').textContent = message; },
  }) || { enabled: false, getToken: () => undefined, reset: () => {} };

  function draft() {
    return {
      display_name: $('#display-name').value.trim(),
      resale_relationship: state.relationship,
      platforms: [...state.platforms],
      ideal_monthly_listing_volume: $('#monthly-volume').value,
      email: $('#beta-email').value.trim().toLowerCase(),
      source_code: source,
    };
  }

  function remember(value = draft()) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Browser storage is optional. */ }
  }

  function recall() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }

  function forget() {
    try { localStorage.removeItem(storageKey); } catch { /* Nothing to clear. */ }
  }

  function applyDraft(value) {
    if (!value) return;
    $('#display-name').value = String(value.display_name || '');
    $('#monthly-volume').value = String(value.ideal_monthly_listing_volume || '');
    $('#beta-email').value = String(value.email || '');
    state.relationship = String(value.resale_relationship || '');
    state.platforms = new Set(Array.isArray(value.platforms) ? value.platforms : []);
    $$('#relationship-choices button').forEach(button => button.classList.toggle('selected', button.dataset.value === state.relationship));
    $$('#platform-choices button').forEach(button => button.classList.toggle('selected', state.platforms.has(button.dataset.value)));
  }

  function showStep(step) {
    state.step = step;
    $$('[data-step]').forEach(panel => { panel.hidden = Number(panel.dataset.step) !== step; });
    $('#progress-copy').textContent = `Question ${step} of 2`;
    $('#progress-bar').style.width = `${step * 50}%`;
    $('#back-step').hidden = step === 1;
    $('#step-one-error').textContent = '';
    $('#step-two-error').textContent = '';
    if (step === 2) $('#beta-email').focus();
  }

  function openForm() {
    $('#beta-intro').hidden = true;
    $('#beta-card').hidden = false;
    showStep(1);
    $('#display-name').focus();
  }

  function validateStepOne() {
    const name = $('#display-name').value.trim();
    if (!name || !state.relationship) {
      $('#step-one-error').textContent = 'Add your name and choose the resale description that fits best.';
      return false;
    }
    remember();
    return true;
  }

  function validateStepTwo() {
    const value = draft();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email);
    if (!state.platforms.size || !value.ideal_monthly_listing_volume || !validEmail) {
      $('#step-two-error').textContent = 'Choose at least one platform, your monthly volume, and a valid email.';
      return false;
    }
    if (captcha.enabled && !captcha.getToken()) {
      $('#step-two-error').textContent = 'Complete the security check, then continue.';
      return false;
    }
    return true;
  }

  async function saveProfile(session, value) {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/save-beta-profile`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: value.display_name,
        resale_relationship: value.resale_relationship,
        platforms: value.platforms,
        ideal_monthly_listing_volume: value.ideal_monthly_listing_volume,
        source_code: value.source_code || null,
      }),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.error || 'We could not save your beta profile. Please try again.');
    }
  }

  async function continueIntoStudio(session) {
    const value = recall();
    if (!value || !session || state.submitting) return;
    state.submitting = true;
    $('#beta-intro').hidden = true;
    $('#beta-card').hidden = true;
    $('#beta-success').hidden = false;
    $('#success-copy').textContent = 'Saving your beta profile and opening your three-item Studio trialâ¦';
    try {
      await saveProfile(session, value);
      forget();
      window.location.replace('../?beta=welcome');
    } catch (error) {
      state.submitting = false;
      $('#success-copy').textContent = error.message || 'We could not finish your beta setup. Return to the form and try again.';
    }
  }

  $('#start-beta').addEventListener('click', openForm);
  $('#back-step').addEventListener('click', () => showStep(1));
  $('#next-step').addEventListener('click', () => { if (validateStepOne()) showStep(2); });
  $('#relationship-choices').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    state.relationship = button.dataset.value || '';
    $$('#relationship-choices button').forEach(item => item.classList.toggle('selected', item === button));
    $('#step-one-error').textContent = '';
  });
  $('#platform-choices').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    const value = button.dataset.value || '';
    if (state.platforms.has(value)) state.platforms.delete(value); else state.platforms.add(value);
    button.classList.toggle('selected', state.platforms.has(value));
    $('#step-two-error').textContent = '';
  });
  $('#beta-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateStepTwo() || !client || state.submitting) return;
    state.submitting = true;
    const button = $('#send-beta-email');
    button.disabled = true;
    button.textContent = 'Sending secure emailâ¦';
    const value = draft();
    remember(value);
    const redirect = new URL(window.location.href);
    redirect.search = source ? `?ref=${encodeURIComponent(source)}` : '';
    redirect.hash = '';
    const { error } = await client.auth.signInWithOtp({
      email: value.email,
      options: { shouldCreateUser: true, emailRedirectTo: redirect.toString(), captchaToken: captcha.getToken() },
    });
    captcha.reset();
    if (error) {
      state.submitting = false;
      button.disabled = false;
      button.innerHTML = 'Send my secure sign-in email <span>â</span>';
      $('#step-two-error').textContent = error.message || 'We could not send that email. Please try again.';
      return;
    }
    $('#beta-card').hidden = true;
    $('#beta-success').hidden = false;
    $('#success-copy').textContent = `We sent a secure sign-in email to ${value.email}. Open the newest one on this device to enter your three-item trial.`;
  });

  applyDraft(recall());
  client?.auth.getSession().then(({ data }) => { if (data.session && recall()) void continueIntoStudio(data.session); });
  client?.auth.onAuthStateChange((_event, session) => { if (session && recall()) void continueIntoStudio(session); });
})();
