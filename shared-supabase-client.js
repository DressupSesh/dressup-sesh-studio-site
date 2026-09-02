(() => {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return;
  if (window.__DRESSUP_SHARED_SUPABASE_PATCHED__) return;

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  let sharedClient = null;

  window.supabase.createClient = (url, key, options) => {
    if (!sharedClient) {
      sharedClient = originalCreateClient(url, key, options);
      window.DRESSUP_SUPABASE = sharedClient;
    }
    return sharedClient;
  };

  window.__DRESSUP_SHARED_SUPABASE_PATCHED__ = true;
})();
