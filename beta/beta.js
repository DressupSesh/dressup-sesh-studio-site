(() => {
  'use strict';
  const config = window.DRESSUP_CONFIG || {};
  const client = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const params = new URLSearchParams(window.location.search);
  const source = (() => {
    const value = params.get('ref') || params.get('source') || '';
    return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : '';
  })();
  const handoff = (() => {
    const value = params.get('handoff') || '';
    return /^[0-9a-f-]{36}$/i.test(value) ? value : '';
  })();
  const state = { step: 1, relationship: '', platforms: new Set(), submitting: false, handoffDone: false };
  const captcha = window.DRESSUP_TURNSTILE?.create('beta-turnstile', {
    action: 'studio_beta_signup', onError: message => { $('#step-two-error').textContent = message; },
  }) || { enabled: false, getToken: () => undefined, reset: () => {} };

  function intake() {
    return {
      display_name: $('#display-name').value.trim(), resale_relationship: state.relationship,
      platforms: [...state.platforms], ideal_monthly_listing_volume: $('#monthly-volume').value,
      email: $('#beta-email').value.trim().toLowerCase(), source_code: source || null,
    };
  }
  function showStep(step) {
    state.step = step;
    $$('[data-step]').forEach(panel => { panel.hidden = Number(panel.dataset.step) !== step; });
    $('#progress-copy').textContent = `Question ${step} of 2`;
    $('#progress-bar').style.width = `${step * 50}%`;
    $('#back-step').hidden = step === 1;
    $('#step-one-error').textContent = ''; $('#step-two-error').textContent = '';
    if (step === 2) $('#beta-email').focus({ preventScroll: true });
  }
  function openForm() {
    $('#beta-intro').hidden = true; $('#beta-success').hidden = true; $('#beta-card').hidden = false;
    showStep(1); $('#display-name').focus({ preventScroll: true });
  }
  function showMessage(heading, copy, tone = 'normal') {
    $('#beta-intro').hidden = true; $('#beta-card').hidden = true; $('#beta-success').hidden = false;
    $('#beta-success').dataset.tone = tone; $('#success-title').textContent = heading; $('#success-copy').textContent = copy;
  }
  function validateStepOne() {
    if (!$('#display-name').value.trim() || !state.relationship) {
      $('#step-one-error').textContent = 'Add your name and choose the resale description that fits best.'; return false;
    }
    return true;
  }
  function validateStepTwo() {
    const value = intake(); const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email);
    if (!value.ideal_monthly_listing_volume || !validEmail) {
      $('#step-two-error').textContent = 'Choose your monthly volume and enter a valid email.'; return false;
    }
    if (captcha.enabled && !captcha.getToken()) {
      $('#step-two-error').textContent = 'Complete the security check, then continue.'; return false;
    }
    return true;
  }
  async function startSecureEmail(value) {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/begin-beta-signup`, {
      method: 'POST', headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...value, browser_auth: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'We could not send your secure email. Please try again.');
    if (!/^[0-9a-f-]{36}$/i.test(data.handoff || '')) throw new Error('We could not prepare your secure sign-in. Please try again.');
    const redirect = new URL('https://dressupsesh.studio/beta/');
    redirect.searchParams.set('handoff', data.handoff);
    const { error } = await client.auth.signInWithOtp({
      email: value.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirect.toString(),
        captchaToken: captcha.getToken() || undefined,
      },
    });
    if (error) throw error;
  }
  async function finishSecureEmail(session) {
    if (!handoff || !session || state.handoffDone) return;
    state.handoffDone = true;
    showMessage('Opening your Studio.', 'Your beta is confirmed. We are opening your three free items now.');
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/save-beta-profile`, {
        method: 'POST', headers: {
          apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json',
        }, body: JSON.stringify({ handoff }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'We could not finish your beta setup.');
      window.location.replace('../?beta=welcome');
    } catch (error) {
      state.handoffDone = false;
      showMessage('We need one more try.', error.message || 'Your beta setup could not finish. Use the latest email link or start again.', 'error');
    }
  }

  $('#start-beta').addEventListener('click', openForm);
  $('#back-step').addEventListener('click', () => showStep(1));
  $('#next-step').addEventListener('click', () => { if (validateStepOne()) showStep(2); });
  $('#relationship-choices').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]'); if (!button) return;
    state.relationship = button.dataset.value || '';
    $$('#relationship-choices button').forEach(item => item.classList.toggle('selected', item === button));
    $('#step-one-error').textContent = '';
  });
  $('#platform-choices').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]'); if (!button) return;
    const value = button.dataset.value || '';
    if (state.platforms.has(value)) state.platforms.delete(value); else state.platforms.add(value);
    button.classList.toggle('selected', state.platforms.has(value)); $('#step-two-error').textContent = '';
  });
  $('#beta-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!validateStepTwo() || !client || state.submitting) return;
    state.submitting = true;
    const button = $('#send-beta-email'); button.disabled = true; button.textContent = 'Sending secure email...';
    const value = intake();
    try {
      await startSecureEmail(value);
      showMessage('Check your email.', `We sent a secure sign-in link to ${value.email}. Open the newest email on any device to enter your three-item Studio trial.`);
    } catch (error) {
      state.submitting = false; button.disabled = false;
      button.innerHTML = 'Send my secure sign-in email <span aria-hidden="true">&rarr;</span>';
      $('#step-two-error').textContent = error.message || 'We could not send that email. Please try again.';
    } finally { captcha.reset(); }
  });
  client?.auth.getSession().then(({ data }) => { void finishSecureEmail(data.session); });
  client?.auth.onAuthStateChange((_event, session) => { void finishSecureEmail(session); });
})();
