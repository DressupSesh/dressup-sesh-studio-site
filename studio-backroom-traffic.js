(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const count = value => Number(value || 0).toLocaleString('en-US');
  const date = value => new Date(value).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
  let request = 0;
  const metrics = ['traffic-today', 'traffic-visits', 'traffic-new', 'traffic-views'];
  function status(message, error = false) { $('traffic-status').textContent = message; $('traffic-status').classList.toggle('error', error); }
  function reset() {
    request++;
    metrics.forEach(id => { $(id).textContent = '—'; });
    for (const id of ['traffic-visit-window','traffic-new-window','traffic-view-window','traffic-caption']) $(id).textContent = '';
    $('traffic-pages').replaceChildren(); $('traffic-sources').replaceChildren();
    status('Owner verification required.');
  }
  function rows(id, values, label) {
    const body = $(id); body.replaceChildren();
    for (const value of values) {
      const row = document.createElement('tr');
      for (const text of [label(value), count(value.visits), count(value.page_views)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      body.append(row);
    }
    if (!values.length) {
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 3; cell.textContent = 'No recorded visits in this window yet.'; row.append(cell); body.append(row);
    }
  }
  async function load() {
    if (!window.DRESSUP_STUDIO_ADMIN || !window.DRESSUP_SUPABASE) return;
    const ticket = ++request;
    metrics.forEach(id => { $(id).textContent = '—'; });
    $('traffic-pages').replaceChildren(); $('traffic-sources').replaceChildren(); $('traffic-caption').textContent = '';
    status('Loading site visits…');
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_site_traffic', { p_days: Number($('days').value) });
      if (ticket !== request || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      if (!data?.summary || !Array.isArray(data.pages) || !Array.isArray(data.sources)) throw new Error('Invalid traffic response');
      const s = data.summary;
      $('traffic-today').textContent = count(s.visits_today);
      $('traffic-visits').textContent = count(s.visits);
      $('traffic-new').textContent = count(s.new_browsers);
      $('traffic-views').textContent = count(s.page_views);
      for (const id of ['traffic-visit-window', 'traffic-new-window', 'traffic-view-window']) $(id).textContent = `Last ${count(data.days)} days`;
      $('traffic-caption').textContent = `${count(s.browsers)} distinct browsers in this window. Measurement started ${date(data.tracking_started_at)} Pacific. ${s.last_visit_at ? `Latest page view ${date(s.last_visit_at)} Pacific.` : 'No visits recorded yet.'}`;
      rows('traffic-pages', data.pages, value => value.path);
      rows('traffic-sources', data.sources, value => value.label || value.code);
      status(`Updated ${date(data.as_of)} Pacific. Use Refresh visits for the latest counts.`);
    } catch (error) {
      if (ticket !== request || !window.DRESSUP_STUDIO_ADMIN) return;
      metrics.forEach(id => { $(id).textContent = '—'; });
      if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else status('Site visits could not load. Your account and billing reports remain separate. Try Refresh visits.', true);
    }
  }
  $('traffic-refresh').addEventListener('click', () => { void load(); });
  $('filters').addEventListener('submit', () => { void load(); });
  $('days').addEventListener('change', () => { void load(); });
  window.addEventListener('studio:admin-ready', () => { void load(); });
  window.addEventListener('studio:admin-locked', reset);
  window.addEventListener('pagehide', reset);
  if (window.DRESSUP_STUDIO_ADMIN) void load();
})();
