(() => {
  const sitekey = String(window.DRESSUP_CONFIG?.turnstileSiteKey || '').trim();
  let apiPromise;

  function loadApi() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not initialize.'));
      script.onerror = () => reject(new Error('Turnstile could not be loaded.'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function create(containerId, { action = 'auth', theme = 'auto', onError } = {}) {
    const container = document.getElementById(containerId);
    let token = '';
    let widgetId = null;
    const enabled = Boolean(sitekey && container);

    if (!enabled) {
      if (container) container.hidden = true;
      return { enabled: false, getToken: () => undefined, reset: () => {} };
    }

    container.hidden = false;
    loadApi()
      .then(api => {
        widgetId = api.render(container, {
          sitekey,
          action,
          theme,
          size: 'flexible',
          appearance: 'always',
          callback: value => { token = value; },
          'expired-callback': () => { token = ''; },
          'error-callback': () => {
            token = '';
            onError?.('Security check could not load. Refresh the page and try again.');
          }
        });
      })
      .catch(() => onError?.('Security check could not load. Refresh the page and try again.'));

    return {
      enabled: true,
      getToken: () => token,
      reset: () => {
        token = '';
        if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
      }
    };
  }

  window.DRESSUP_TURNSTILE = { enabled: Boolean(sitekey), create };
})();
