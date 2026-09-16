(() => {
  'use strict';
  const config = window.DRESSUP_CONFIG || {};
  const client = window.supabase && config.supabaseUrl && config.supabasePublishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
  const $ = selector => document.querySelector(selector);
  const captcha = window.DRESSUP_TURNSTILE?.create('checkin-turnstile', { action: 'studio_beta_checkin', onError: message => { $('#checkin-auth-error').textContent = message; } }) || { enabled: false, getToken: () => undefined, reset: () => {} };
  let session = null, saving = false;

  function show(id) { ['checkin-loading', 'checkin-auth', 'checkin-form-card', 'checkin-thanks'].forEach(card => { $(`#${card}`).hidden = card !== id; }); }
  async function getStatus() {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/get-beta-status`, { headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.status?.enrolled || Number(data.status.trial_completed_items) > 0) throw new Error('This check-in is not available.');
  }
  async function load() {
    const { data } = await client.auth.getSession(); session = data.session;
    if (!session) { show('checkin-auth'); return; }
    try { await getStatus(); show('checkin-form-card'); }
    catch { window.location.replace('../../'); }
  }
  $('#checkin-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = $('#checkin-email').value.trim().toLowerCase();
    if (!email || saving) return;
    if (captcha.enabled && !captcha.getToken()) { $('#checkin-auth-error').textContent = 'Complete the security check, then continue.'; return; }
    saving = true; const button = $('#checkin-signin'); button.disabled = true; button.textContent = 'Sendingâ¦';
    const redirect = new URL(window.location.href); redirect.search = ''; redirect.hash = '';
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect.toString(), captchaToken: captcha.getToken() } });
    captcha.reset(); saving = false;
    if (error) { button.disabled = false; button.innerHTML = 'Email me a secure sign-in link <span>â</span>'; $('#checkin-auth-error').textContent = error.message || 'We could not send that email.'; return; }
    $('#checkin-auth-error').textContent = 'Check your newest email and open the sign-in link on this device.'; button.textContent = 'Email sent';
  });
  $('#checkin-form').addEventListener('submit', async event => {
    event.preventDefault();
    const response = $('#checkin-response').value.trim();
    if (!response || saving) return;
    saving = true; const button = $('#save-checkin'); button.disabled = true; button.textContent = 'Savingâ¦';
    try {
      const result = await fetch(`${config.supabaseUrl}/functions/v1/save-beta-checkin`, { method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ response }) });
      const body = await result.json().catch(() => ({})); if (!result.ok) throw new Error(body.error || 'We could not save that yet.'); show('checkin-thanks');
    } catch (error) { $('#checkin-error').textContent = error.message; button.disabled = false; button.innerHTML = 'Send feedback <span>â</span>'; saving = false; }
  });
  if (client) void load(); else window.location.replace('../../');
})();
