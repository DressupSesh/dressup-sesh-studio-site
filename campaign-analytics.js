(() => {
  'use strict';
  const valid = value => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value || '');
  const params = new URLSearchParams(location.search);
  const incoming = (params.get('source') || params.get('ref') || '').toLowerCase();
  let saved = '';
  try { saved = localStorage.getItem('studio_first_source') || ''; } catch (_) { /* storage may be blocked */ }
  const source = valid(saved) ? saved : valid(incoming) ? incoming : 'direct';
  try { if (!valid(saved) && source !== 'direct') localStorage.setItem('studio_first_source', source); } catch (_) { /* anonymous reporting is best effort */ }
  let visitor = '';
  try { visitor = localStorage.getItem('studio_campaign_visitor') || ''; } catch (_) { /* storage may be blocked */ }
  if (!/^[0-9a-f-]{36}$/i.test(visitor)) {
    visitor = crypto.randomUUID();
    try { localStorage.setItem('studio_campaign_visitor', visitor); } catch (_) { /* session only */ }
  }
  window.DS_CAMPAIGN_SOURCE = source === 'direct' ? '' : source;
  window.DS_TRACK_CAMPAIGN = event => {
    if (!['landing_view','beta_view','intake_start','step_two','email_requested'].includes(event)) return;
    void fetch('https://zlcjrwhdtrhtobmgpafw.supabase.co/functions/v1/record-campaign-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: source, visitor_id: visitor, event }), keepalive: true,
    }).catch(() => {});
  };
  window.DS_TRACK_CAMPAIGN(document.body.dataset.page === 'beta' ? 'beta_view' : 'landing_view');
})();
