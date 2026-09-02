(() => {
  const cfg = window.DRESSUP_CONFIG || {};
  const form = document.getElementById('reset-form');
  const status = document.getElementById('reset-status');
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase || !form || !status) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  const show = (message, error = false) => {
    status.replaceChildren();
    const box = document.createElement('div');
    box.className = `ds-status${error ? ' error' : ''}`;
    box.textContent = message;
    status.appendChild(box);
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('confirm-password').value;
    if (p1 !== p2) return show('Passwords do not match.', true);
    if (p1.length < 14 || !/[a-z]/.test(p1) || !/[A-Z]/.test(p1) || !/\d/.test(p1) || !/[^A-Za-z0-9]/.test(p1)) {
      return show('Use at least 14 characters with uppercase, lowercase, a number, and a symbol.', true);
    }
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) return show('Open this page from the password reset email.', true);
    const { data: isOwner, error: roleError } = await client.rpc('is_backroom_owner_role');
    if (roleError || isOwner !== true) {
      await client.auth.signOut();
      return show('This account does not have owner access.', true);
    }
    const { error } = await client.auth.updateUser({ password: p1 });
    if (error) return show(error.message, true);
    show('Password saved. Returning to the Back Room…');
    setTimeout(() => { location.href = 'backroom.html'; }, 700);
  });
})();
