(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = cents => (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const count = value => Number(value || 0).toLocaleString('en-US');
  let ticket = 0;
  const status = message => { $('campaign-status').textContent = message; };
  const cell = (row, value) => { const td = document.createElement('td'); td.textContent = String(value); row.append(td); return td; };
  function clear() { ticket++; $('campaign-rows').replaceChildren(); status(''); }
  async function load() {
    if (!window.DRESSUP_STUDIO_ADMIN) return;
    const current = ++ticket;
    status('Loading outreach results…');
    const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_campaign_report');
    if (current !== ticket || !window.DRESSUP_STUDIO_ADMIN) return;
    if (error || !Array.isArray(data?.campaigns)) {
      status('Could not load outreach results. Refresh after the campaign migration is deployed.'); return;
    }
    const body = $('campaign-rows'); body.replaceChildren();
    for (const c of data.campaigns) {
      const row = document.createElement('tr'), first = document.createElement('td');
      const title = document.createElement('strong'); title.textContent = c.label;
      const code = document.createElement('small'); code.textContent = `${c.channel} · ${c.code}`;
      first.append(title, document.createElement('br'), code);
      if (c.code !== 'direct') {
        const link = document.createElement('a');
        link.href = `https://dressupsesh.studio/beta/?source=${encodeURIComponent(c.code)}`;
        link.textContent = 'Copy invite link';
        link.addEventListener('click', async event => {
          event.preventDefault();
          try { await navigator.clipboard.writeText(link.href); status(`Copied link for ${c.label}.`); }
          catch (_) { status(`Copy this link: ${link.href}`); }
        });
        first.append(document.createElement('br'), link);
      }
      row.append(first);
      cell(row, count(c.visitors)); cell(row, `${count(c.intake_starts)} / ${count(c.email_requests)} email requests`);
      cell(row, count(c.verified)); cell(row, `${count(c.first_item)} / ${count(c.third_item)}`);
      cell(row, count(c.paying_users)); cell(row, money(c.net_collected_cents)); cell(row, money(c.spend_cents));
      const net = Number(c.net_collected_cents || 0), spend = Number(c.spend_cents || 0);
      cell(row, spend ? `${(net / spend).toFixed(2)}× · ${money(net - spend)} after spend` : 'No spend entered');
      body.append(row);
    }
    status(`Updated ${new Date(data.as_of).toLocaleString()}. First recorded beta source is used for paid attribution; prior visits cannot be reconstructed.`);
  }
  $('campaign-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.DRESSUP_STUDIO_ADMIN) return;
    const code = $('campaign-code').value.trim().toLowerCase();
    const spend = Math.round(Number($('campaign-spend').value) * 100);
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(code) || !Number.isSafeInteger(spend)) { status('Check the code and spend.'); return; }
    status('Saving push…');
    const { error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_save_campaign', {
      p_code: code, p_label: $('campaign-label').value.trim(), p_channel: $('campaign-channel').value.trim(), p_spend_cents: spend,
    });
    if (error) { status('Could not save this push. Check the details and your owner MFA session.'); return; }
    $('campaign-form').reset(); await load();
  });
  $('campaign-refresh').addEventListener('click', () => { void load(); });
  $('beta-tab').addEventListener('click', () => { void load(); });
  window.addEventListener('studio:admin-locked', clear);
  window.addEventListener('pagehide', clear);
})();
