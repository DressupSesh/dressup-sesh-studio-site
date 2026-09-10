(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const form = document.getElementById('studio-reset-form');
  const submit = document.getElementById('studio-reset-submit');
  const status = document.getElementById('studio-reset-message');
  const password = document.getElementById('studio-new-password');
  const confirmation = document.getElementById('studio-confirm-password');
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase || !form || !submit || !status) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  let recoveryReady = false;

  const show = (message, error = false) => {
    status.textContent = message;
    status.style.color = error ? '#8a241f' : '';
  };

  client.auth.onAuthStateChange((event, session) => {
    if (event !== 'PASSWORD_RECOVERY' || !session?.user) return;
    recoveryReady = true;
    submit.disabled = false;
    show('Reset link verified. Choose your new password.');
    history.replaceState({}, document.title, location.pathname);
  });

  setTimeout(() => {
    if (!recoveryReady) show('This reset link is invalid or expired. Return to Studio and request a new one.', true);
  }, 2500);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!recoveryReady) return show('Open this page from the newest Studio password reset email.', true);
    const p1 = password.value;
    const p2 = confirmation.value;
    if (p1 !== p2) return show('Passwords do not match.', true);
    if (p1.length < 9 || !/[a-z]/.test(p1) || !/[A-Z]/.test(p1) || !/\d/.test(p1) || !/[^A-Za-z0-9]/.test(p1)) {
      return show('Use at least 9 characters with uppercase, lowercase, a number, and a symbol.', true);
    }

    submit.disabled = true;
    show('Saving your new password…');
    const { error } = await client.auth.updateUser({ password: p1 });
    if (error) {
      submit.disabled = false;
      return show(error.message, true);
    }
    await client.auth.signOut({ scope: 'local' });
    show('Password saved. Returning to Studio…');
    setTimeout(() => { location.href = './?password-reset=success'; }, 900);
  });
})();
