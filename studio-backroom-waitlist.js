(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let generation = 0, snapshot = null;
  function clear() {
    generation++; snapshot = null;
    $('waitlist-rows').replaceChildren();
    $('waitlist-export').disabled = true;
    $('waitlist-status').textContent = '';
    $('waitlist-caption').textContent = 'Pro waitlist signups';
  }
  async function load() {
    clear();
    if (!window.DRESSUP_STUDIO_ADMIN || !window.DRESSUP_SUPABASE) return;
    const ticket = generation;
    $('waitlist-status').textContent = 'Loading waitlist…';
    try {
      const {data,error} = await window.DRESSUP_SUPABASE.rpc('studio_admin_pro_waitlist');
      if (ticket !== generation || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      if (!data || !Array.isArray(data.entries)) throw new Error('Invalid response');
      snapshot = data;
      for (const entry of data.entries) {
        const row = document.createElement('tr');
        for (const value of [entry.email,entry.source,new Date(entry.created_at).toLocaleString()]) {
          const cell = document.createElement('td'); cell.textContent = value || '—'; row.append(cell);
        }
        $('waitlist-rows').append(row);
      }
      $('waitlist-caption').textContent = `${data.total} signups · showing ${data.entries.length}`;
      $('waitlist-status').textContent = data.entries.length ? 'Private waitlist loaded.' : 'No Pro waitlist signups yet.';
      $('waitlist-export').disabled = !data.entries.length;
    } catch(error) {
      if (ticket !== generation) return;
      if (error.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else $('waitlist-status').textContent = 'The waitlist could not load. Please try again.';
    }
  }
  $('pro-waitlist-tab').addEventListener('click', () => {
    for (const name of ['finance','beta']) { $(name+'-pane').hidden = true; $(name+'-tab').setAttribute('aria-selected','false'); }
    $('pro-waitlist-pane').hidden = false; $('pro-waitlist-tab').setAttribute('aria-selected','true'); void load();
  });
  for(const name of ['finance','beta']) $(name+'-tab').addEventListener('click', () => {
    $('pro-waitlist-pane').hidden = true; $('pro-waitlist-tab').setAttribute('aria-selected','false'); clear();
  });
  $('waitlist-refresh').addEventListener('click', () => {void load();});
  $('waitlist-export').addEventListener('click', () => {
    if (!snapshot || !window.DRESSUP_STUDIO_ADMIN) return;
    const cell = value => { const v=String(value ?? ''); return '"'+(/^[=+@\-\t\r]/.test(v)?"'":"")+v.replaceAll('"','""')+'"'; };
    const rows=[['Email','Source','Joined'],...snapshot.entries.map(e=>[e.email,e.source,e.created_at])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url;a.download='studio-pro-waitlist.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('studio:admin-locked',clear);
  window.addEventListener('pagehide',clear);
})();
