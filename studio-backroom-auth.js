(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.DRESSUP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    $('auth-status').textContent = 'Studio sign-in could not load. Refresh the page to try again.';
    $('password-sign-in').disabled = true;
    return;
  }
  const client = window.DRESSUP_SUPABASE || window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  window.DRESSUP_SUPABASE = client;
  let factorId = null;
  let generation = 0;
  let checking = false;
  let verifyAgain = false;
  const status = (id, message, error = false) => {
    $(id).textContent = message;
    $(id).classList.toggle('error', error);
  };
  const captcha = window.DRESSUP_TURNSTILE?.create('owner-turnstile', {
    action: 'owner_auth', theme: 'light', onError: message => status('auth-status', message, true)
  });
  function lock() {
    generation++;
    window.DRESSUP_STUDIO_ADMIN = null;
    $('backroom-app').classList.add('ds-hidden');
    $('mfa-screen').classList.add('ds-hidden');
    $('mfa-code').value = '';
    $('mfa-secret').textContent = '';
    $('mfa-qr').removeAttribute('src');
    window.dispatchEvent(new Event('studio:admin-locked'));
  }
  function showLogin(message = '', error = false, session = false) {
    lock();
    $('auth-screen').classList.remove('ds-hidden');
    $('sign-out').classList.toggle('ds-hidden', !session);
    status('auth-status', message, error);
  }
  async function verify() {
    if (checking) { verifyAgain = true; return; }
    checking = true;
    const ticket = generation;
    try {
      const { data, error } = await client.auth.getUser();
      if (ticket !== generation) return;
      if (error || !data?.user) { showLogin(); return; }
      const role = await client.rpc('is_backroom_owner_role');
      if (ticket !== generation) return;
      if (role.error) throw role.error;
      if (role.data !== true) { showLogin('This account is not the Studio owner. Sign out and use your owner account.', true, true); return; }
      const access = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (access.error) throw access.error;
      if (ticket !== generation) return;
      if (access.data?.currentLevel === 'aal2') {
        const verified = await client.rpc('is_backroom_owner');
        if (ticket !== generation) return;
        if (verified.error || verified.data !== true) throw new Error('Owner verification failed.');
        window.DRESSUP_STUDIO_ADMIN = { id: data.user.id };
        $('auth-screen').classList.add('ds-hidden');
        $('mfa-screen').classList.add('ds-hidden');
        $('mfa-secret').textContent = '';
        $('mfa-qr').removeAttribute('src');
        $('mfa-code').value = '';
        $('backroom-app').classList.remove('ds-hidden');
        $('sign-out').classList.remove('ds-hidden');
        window.dispatchEvent(new Event('studio:admin-ready'));
        return;
      }
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      if (ticket !== generation) return;
      let factor = (factors.data?.totp || []).find(f => f.status === 'verified');
      $('mfa-qr').classList.add('ds-hidden');
      $('mfa-enroll-help').textContent = 'Use the same authenticator code as your shop owner account.';
      if (!factor) {
        for (const pending of factors.data?.totp || []) {
          if (pending.status === 'unverified') await client.auth.mfa.unenroll({ factorId: pending.id });
        }
        const enrollment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Dressup Sesh Owner' });
        if (enrollment.error) throw enrollment.error;
        if (ticket !== generation) return;
        factor = enrollment.data;
        $('mfa-qr').src = factor.totp.qr_code;
        $('mfa-qr').classList.remove('ds-hidden');
        $('mfa-secret').textContent = factor.totp.secret;
        $('mfa-enroll-help').textContent = 'Scan the QR code with your authenticator app. Store the setup secret securely, then enter the six-digit code.';
      }
      factorId = factor.id;
      $('auth-screen').classList.add('ds-hidden');
      $('mfa-screen').classList.remove('ds-hidden');
      $('sign-out').classList.remove('ds-hidden');
      $('mfa-code').focus();
    } catch (_) {
      if (ticket === generation) showLogin('Owner access could not be verified. Please try signing in again.', true, true);
    } finally {
      checking = false;
      if (verifyAgain) { verifyAgain = false; setTimeout(() => { void verify(); }, 0); }
    }
  }
  function getCaptcha() {
    const token = captcha?.getToken();
    if (captcha?.enabled && !token) throw new Error('Complete the security check, then try again.');
    return token;
  }
  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('password-sign-in').disabled = true;
    try {
      const token = getCaptcha();
      status('auth-status', 'Verifying owner access…');
      const { error } = await client.auth.signInWithPassword({ email: $('auth-email').value.trim(), password: $('auth-password').value, options: { captchaToken: token } });
      if (error) throw error;
      $('auth-password').value = '';
      await verify();
    } catch (error) { status('auth-status', error.message || 'Sign-in failed. Try again.', true); }
    finally { captcha?.reset(); $('password-sign-in').disabled = false; }
  });
  $('mfa-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!factorId) return;
    $('mfa-verify').disabled = true;
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: $('mfa-code').value.trim() });
      if (error) throw error;
      await verify();
    } catch (_) { status('mfa-status', 'Verification failed. Enter the latest authenticator code and try again.', true); }
    finally { $('mfa-verify').disabled = false; }
  });
  $('password-reset').addEventListener('click', async () => {
    if (!$('auth-email').reportValidity() || !$('auth-email').value.trim()) return;
    $('password-reset').disabled = true;
    try {
      const token = getCaptcha();
      const { error } = await client.auth.resetPasswordForEmail($('auth-email').value.trim(), { redirectTo: new URL('password-reset.html', location.href).href, captchaToken: token });
      if (error) throw error;
      status('auth-status', 'If this email belongs to an account, a reset link is on its way. Return to this Studio Back Room afterward.');
    } catch (error) { status('auth-status', error.message || 'Reset email could not be sent.', true); }
    finally { captcha?.reset(); $('password-reset').disabled = false; }
  });
  $('sign-out').addEventListener('click', async () => {
    showLogin('Signing out…');
    try { const { error } = await client.auth.signOut(); if (error) throw error; status('auth-status', 'Signed out.'); }
    catch (_) { showLogin('Sign-out could not be completed. Try again.', true, true); }
  });
  client.auth.onAuthStateChange((event, session) => {
    // Never await another Auth method inside Supabase's auth callback.
    if (event === 'SIGNED_OUT' || !session) { showLogin(); return; }
    if (event === 'TOKEN_REFRESHED') setTimeout(() => { lock(); void verify(); }, 0);
  });
  window.addEventListener('studio:admin-denied', () => showLogin('Your owner session needs verification. Sign in again.', true, true));
  window.addEventListener('pagehide', lock);
  window.addEventListener('pageshow', event => { if (event.persisted) void verify(); });
  void verify();
})();
