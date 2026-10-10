(() => {
  'use strict';
  const valid = value => /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value || '');
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
  const read = key => { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* best effort */ } };
  const params = new URLSearchParams(location.search);
  const incoming = (params.get('source') || params.get('ref') || '').toLowerCase();
  const saved = read('studio_first_source');
  const source = valid(saved) ? saved : valid(incoming) ? incoming : 'direct';
  if (!valid(saved) && source !== 'direct') write('studio_first_source', source);
  let visitor = read('studio_campaign_visitor');
  if (!uuid(visitor)) { visitor = crypto.randomUUID(); write('studio_campaign_visitor', visitor); }
  const endpoint = 'https://zlcjrwhdtrhtobmgpafw.supabase.co/functions/v1/record-campaign-event';
  const send = payload => { void fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), keepalive: true,
  }).catch(() => {}); };
  window.DS_CAMPAIGN_SOURCE = source === 'direct' ? '' : source;
  window.DS_TRACK_CAMPAIGN = event => {
    if (!['landing_view','beta_view','intake_start','step_two','email_requested'].includes(event)) return;
    send({ code: source, visitor_id: visitor, event });
  };
  // No reset pages, Back Room, full URLs, query strings or tokens are sent.
  const aliases = { '/index.html': '/', '/beta/index.html': '/beta/', '/studio-home.html': '/',
    '/support/index.html': '/support/', '/privacy/index.html': '/privacy/', '/terms/index.html': '/terms/' };
  const path = aliases[location.pathname] || location.pathname;
  const paths = new Set(['/', '/studio.html', '/beta/', '/support/', '/privacy/', '/terms/']);
  let memoryVisit = null;
  function trackView() {
    if (!paths.has(path)) return;
    const now = Date.now();
    let visit = memoryVisit;
    try { visit = JSON.parse(read('studio_site_visit')) || visit; } catch (_) { /* invalid stored value */ }
    if (!visit || !uuid(visit.id) || !Number.isFinite(visit.last_seen) || now < visit.last_seen || now - visit.last_seen >= 30 * 60 * 1000)
      visit = { id: crypto.randomUUID(), last_seen: now };
    visit.last_seen = now; memoryVisit = visit;
    write('studio_site_visit', JSON.stringify(visit));
    send({ code: source, visitor_id: visitor, event: 'site_view', visit_id: visit.id, event_id: crypto.randomUUID(), path });
  }
  trackView();
  window.addEventListener('pageshow', event => { if (event.persisted) trackView(); });
  if (path === '/' || path === '/beta/') window.DS_TRACK_CAMPAIGN(path === '/beta/' ? 'beta_view' : 'landing_view');
})();
