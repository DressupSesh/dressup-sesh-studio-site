(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.DRESSUP_SUPABASE || window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  if (!window.DRESSUP_SUPABASE) window.DRESSUP_SUPABASE = client;

  const authScreen = document.getElementById('auth-screen');
  const mfaScreen = document.getElementById('mfa-screen');
  const app = document.getElementById('backroom-app');
  const signOut = document.getElementById('sign-out');
  const authStatus = document.getElementById('auth-status');
  const mfaStatus = document.getElementById('mfa-status');
  const authForm = document.getElementById('auth-form');
  const mfaForm = document.getElementById('mfa-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const mfaCodeInput = document.getElementById('mfa-code');
  const mfaQr = document.getElementById('mfa-qr');
  const mfaSecret = document.getElementById('mfa-secret');
  const mfaEnrollHelp = document.getElementById('mfa-enroll-help');
  const signInButton = document.getElementById('password-sign-in');
  const mfaButton = document.getElementById('mfa-verify');
  const resetButton = document.getElementById('password-reset');
  const ownerCaptcha = window.DRESSUP_TURNSTILE?.create('owner-turnstile', {
    action: 'owner_auth',
    theme: 'light',
    onError: message => setStatus(authStatus, message, true)
  }) || { enabled: false, getToken: () => undefined, reset: () => {} };

  function captchaTokenOrMessage() {
    const token = ownerCaptcha.getToken();
    if (ownerCaptcha.enabled && !token) {
      setStatus(authStatus, 'Complete the security check, then try again.', true);
      return null;
    }
    return token;
  }
  let activeFactorId = null;
  let ownerCheckPromise = null;

  function setStatus(target, message, error = false) {
    if (!target) return;
    target.replaceChildren();
    if (!message) return;
    const box = document.createElement('div');
    box.className = `ds-status${error ? ' error' : ''}`;
    box.textContent = message;
    target.appendChild(box);
  }

  function hidePrivateViews() {
    window.DRESSUP_BACKROOM_OWNER = null;
    app?.classList.add('ds-hidden');
    mfaScreen?.classList.add('ds-hidden');
  }

  function showLogin(message = '', error = false, hasSession = false) {
    hidePrivateViews();
    authScreen?.classList.remove('ds-hidden');
    signOut?.classList.toggle('ds-hidden', !hasSession);
    setStatus(authStatus, message, error);
  }

  function showMfa(message = '') {
    hidePrivateViews();
    authScreen?.classList.add('ds-hidden');
    mfaScreen?.classList.remove('ds-hidden');
    signOut?.classList.remove('ds-hidden');
    setStatus(mfaStatus, message);
    mfaCodeInput?.focus();
  }

  function openBackroom(user) {
    window.DRESSUP_BACKROOM_OWNER = { user };
    authScreen?.classList.add('ds-hidden');
    mfaScreen?.classList.add('ds-hidden');
    app?.classList.remove('ds-hidden');
    signOut?.classList.remove('ds-hidden');
    setStatus(authStatus, '');
    setStatus(mfaStatus, '');
    window.dispatchEvent(new CustomEvent('dressup:owner-ready', { detail: { user } }));
  }

  async function hasOwnerRole() {
    const { data, error } = await client.rpc('is_backroom_owner_role');
    if (error) throw error;
    return data === true;
  }

  async function hasAal2OwnerAccess() {
    const { data, error } = await client.rpc('is_backroom_owner');
    if (error) throw error;
    return data === true;
  }

  async function prepareMfa() {
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;
    const verified = (data?.totp || []).find(factor => factor.status === 'verified');
    if (verified) {
      activeFactorId = verified.id;
      mfaQr?.classList.add('ds-hidden');
      if (mfaSecret) mfaSecret.textContent = '';
      if (mfaEnrollHelp) mfaEnrollHelp.textContent = 'Enter the 6-digit code from your authenticator app.';
      showMfa('Password accepted. Enter your authenticator code to continue.');
      return;
    }

    for (const factor of data?.totp || []) {
      if (factor.status === 'unverified') await client.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data: enrollment, error: enrollError } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Dressup Sesh Back Room'
    });
    if (enrollError) throw enrollError;
    activeFactorId = enrollment.id;
    if (mfaQr) {
      mfaQr.src = enrollment.totp.qr_code;
      mfaQr.classList.remove('ds-hidden');
    }
    if (mfaSecret) mfaSecret.textContent = enrollment.totp.secret;
    if (mfaEnrollHelp) mfaEnrollHelp.textContent = 'Scan this QR code with your authenticator app, then enter its 6-digit code. Save the secret somewhere secure before continuing.';
    showMfa('Set up two-step verification to secure the Back Room.');
  }

  async function verifyOwner(user) {
    if (!user) {
      showLogin();
      return false;
    }
    if (ownerCheckPromise) return ownerCheckPromise;
    ownerCheckPromise = (async () => {
      try {
        if (!(await hasOwnerRole())) {
          showLogin('This Studio account does not have Back Room owner access. Sign out, then use the owner account.', true, true);
          return false;
        }
        const { data: assurance, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        if (assurance?.currentLevel === 'aal2' && await hasAal2OwnerAccess()) {
          openBackroom(user);
          return true;
        }
        await prepareMfa();
        return false;
      } catch (_) {
        showLogin('Owner access could not be verified. Please try again.', true, true);
        return false;
      }
    })();
    try {
      return await ownerCheckPromise;
    } finally {
      ownerCheckPromise = null;
    }
  }

  async function enforceOwner() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return showLogin();
    await verifyOwner(data.user);
  }

  authForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = emailInput?.value.trim();
    const password = passwordInput?.value || '';
    if (!email || !password) return setStatus(authStatus, 'Enter the owner email and password.', true);
    const captchaToken = captchaTokenOrMessage();
    if (captchaToken === null) return;
    signInButton.disabled = true;
    setStatus(authStatus, 'Verifying owner access…');
    const { data, error } = await client.auth.signInWithPassword({ email, password, options: { captchaToken } });
    ownerCaptcha.reset();
    if (error) setStatus(authStatus, error.message, true);
    else await verifyOwner(data?.user);
    signInButton.disabled = false;
  });

  mfaForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const code = (mfaCodeInput?.value || '').replace(/\D/g, '');
    if (!activeFactorId || code.length !== 6) return setStatus(mfaStatus, 'Enter the 6-digit code from your authenticator app.', true);
    mfaButton.disabled = true;
    setStatus(mfaStatus, 'Verifying code…');
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: activeFactorId, code });
    if (error) {
      setStatus(mfaStatus, 'That code was not accepted. Wait for a new code and try again.', true);
      mfaButton.disabled = false;
      return;
    }
    const { data } = await client.auth.getUser();
    if (!data?.user || !(await hasAal2OwnerAccess().catch(() => false))) {
      setStatus(mfaStatus, 'Two-step verification succeeded, but owner access could not be confirmed.', true);
      mfaButton.disabled = false;
      return;
    }
    openBackroom(data.user);
    mfaButton.disabled = false;
  });

  resetButton?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email) return setStatus(authStatus, 'Enter the owner email first.', true);
    const captchaToken = captchaTokenOrMessage();
    if (captchaToken === null) return;
    resetButton.disabled = true;
    setStatus(authStatus, 'Sending a password reset email…');
    const redirectTo = new URL('password-reset.html', location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
    ownerCaptcha.reset();
    setStatus(authStatus, error ? error.message : 'If this is the owner account, its password reset email is on the way.', Boolean(error));
    resetButton.disabled = false;
  });

  signOut?.addEventListener('click', async () => {
    await client.auth.signOut();
    activeFactorId = null;
    showLogin('Signed out of the Back Room.');
  });

  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === 'SIGNED_OUT' || !session?.user) showLogin();
      else if (event === 'MFA_CHALLENGE_VERIFIED') verifyOwner(session.user);
    }, 0);
  });

  enforceOwner();
})();
