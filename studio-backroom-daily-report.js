(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const content = $('daily-report-data');
  const status = $('daily-report-status');
  const refresh = $('daily-report-refresh');
  const comparison = $('daily-report-window');
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' });
  const timestamp = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short'
  });
  const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const estimate = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 4
  });
  const number = new Intl.NumberFormat('en-US');
  const metrics = [
    ['Traffic and customer activity', [
      ['Tracked site visits', 'site_visits', '#traffic-heading'],
      ['New accounts, excluding owner', 'new_accounts', '#finance/accounts'],
      ['New customer accounts', 'new_customers', '#finance/accounts'],
      ['Marked Customer', 'classified_customers', '#finance/accounts'],
      ['Customer emails verified', 'verified_customers', '#finance/accounts'],
      ['Active customers', 'active_customers', '#finance/daily'],
      ['Customer trial access enabled', 'trial_access_enabled', '#beta/funnel'],
      ['Customer trials started, recorded', 'trials_started', '#beta/funnel'],
      ['Customer trials finished, recorded', 'trials_finished', '#beta/funnel'],
      ['Customer feedback received', 'customer_feedback', '#beta/testers']
    ]],
    ['Studio usage · all accounts', [
      ['Listing Upgrades started', 'upgrades_started', '#finance/usage'],
      ['Listing copy', 'copies', '#finance/usage'],
      ['Background removals', 'backgrounds', '#finance/usage'],
      ['Creative images', 'creatives', '#finance/usage'],
      ['Estimated API cost', 'cost_micros', '#finance/usage'],
      ['OpenAI estimated cost', 'openai_cost_micros', '#finance/usage'],
      ['Replicate estimated cost', 'replicate_cost_micros', '#finance/usage']
    ]],
    ['Stripe ledger · recorded live USD', [
      ['Payments collected', 'collected_cents', '#finance/revenue'],
      ['Refunds issued', 'refunded_cents', '#finance/refunds']
    ]]
  ];
  let request = 0;
  let snapshot = null;

  function element(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }

  function formatMetric(key, period) {
    const value = period[key];
    if (key.endsWith('_micros')) {
      if (period.finished_operations === 0) return 'No logged usage';
      if (value == null) return 'No estimates';
      return estimate.format(value / 1e6);
    }
    if (value == null) return 'Unavailable';
    return key.endsWith('_cents') ? dollars.format(value / 100) : number.format(value);
  }

  function render(data) {
    const today = data.periods.today;
    const period = data.periods[comparison.value];
    const label = comparison.options[comparison.selectedIndex].textContent;
    $('daily-report-comparison').textContent = label;
    const rows = document.createDocumentFragment();
    for (const [group, items] of metrics) {
      const divider = element('tr', '');
      divider.className = 'daily-report-group';
      const heading = element('th', group);
      heading.colSpan = 3;
      divider.append(heading);
      rows.append(divider);
      for (const [name, key, href] of items) {
        const row = element('tr', '');
        const title = element('th', '');
        const link = element('a', name);
        link.href = href;
        title.scope = 'row';
        title.append(link);
        row.append(title, element('td', formatMetric(key, today)), element('td', formatMetric(key, period)));
        rows.append(row);
      }
    }
    $('daily-report-rows').replaceChildren(rows);

    const totals = data.totals;
    const cards = [
      ['Total Studio accounts', totals.all_accounts],
      ['Classified customers', totals.customer_accounts],
      ['Test accounts', totals.test_accounts],
      ['Owner accounts', totals.owner_accounts],
      ['Unclassified accounts', totals.unclassified_accounts],
      ['Active paid customers in Stripe records', totals.paying_customers],
      ['Active Stripe subscriptions across all groups', totals.active_subscriptions],
      ['Customer feedback received, all time', totals.customer_submitted]
    ];
    $('daily-report-totals').replaceChildren(...cards.map(([name, value]) => {
      const card = element('div', '');
      card.append(element('dt', name), element('dd', number.format(value)));
      return card;
    }));

    const coverage = [
      `${label} starts ${date.format(new Date(period.starts_at))}. Estimated cost covers ${number.format(today.priced_operations)} of ${number.format(today.finished_operations)} finished operations today and ${number.format(period.priced_operations)} of ${number.format(period.finished_operations)} in the comparison window.`
    ];
    if (data.tracking_started_at && new Date(data.tracking_started_at) > new Date(period.starts_at)) {
      coverage.push(`Traffic tracking began ${date.format(new Date(data.tracking_started_at))}.`);
    }
    if (totals.customer_feedback_undated) {
      coverage.push(`${number.format(totals.customer_feedback_undated)} older customer survey responses have no recorded submission date and appear only in the all-time total.`);
    }
    $('daily-report-coverage').textContent = coverage.join(' ');
    $('daily-report-billing').textContent = data.stripe_reconciled_through
      ? `Stripe ledger reconciled through ${timestamp.format(new Date(data.stripe_reconciled_through))}. Later entries reflect recorded activity and may be incomplete. Check Stripe for current payment and subscription status.`
      : 'Stripe ledger reconciliation is pending. Check Stripe for current payment and subscription status.';
    const campaignItems = data.campaigns.filter(campaign => campaign.spend_cents > 0);
    $('daily-report-campaigns').replaceChildren(...campaignItems.map(campaign =>
      element('li', `${campaign.label} · ${campaign.channel} · ${dollars.format(campaign.spend_cents / 100)} recorded`)
    ));
    if (!campaignItems.length) $('daily-report-campaigns').append(element('li', 'No campaign amounts recorded.'));
    content.hidden = false;
    status.textContent = `Updated ${timestamp.format(new Date(data.as_of))}.`;
  }

  async function load() {
    if (!window.DRESSUP_STUDIO_ADMIN || !window.DRESSUP_SUPABASE) return;
    const ticket = ++request;
    refresh.disabled = true;
    status.textContent = 'Refreshing the daily report…';
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_daily_report');
      if (ticket !== request || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      if (!data?.periods?.today || !data.periods.last_30_days || !data.periods.this_month || !data.totals) {
        throw new Error('Invalid daily report');
      }
      snapshot = data;
      render(data);
    } catch (error) {
      if (ticket !== request) return;
      if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else {
        content.hidden = true;
        snapshot = null;
        status.textContent = 'The daily report could not load. Refresh to try again.';
      }
    } finally {
      if (ticket === request) refresh.disabled = false;
    }
  }

  function clear() {
    request++;
    snapshot = null;
    content.hidden = true;
    refresh.disabled = false;
    status.textContent = 'Owner verification required.';
    for (const id of ['daily-report-rows', 'daily-report-totals', 'daily-report-campaigns', 'daily-report-coverage', 'daily-report-billing']) {
      $(id).replaceChildren();
    }
  }

  comparison.addEventListener('change', () => { if (snapshot && !refresh.disabled) render(snapshot); });
  refresh.addEventListener('click', load);
  window.addEventListener('studio:admin-ready', load);
  window.addEventListener('studio:classifications-saved', load);
  window.addEventListener('studio:finance-updated', load);
  window.addEventListener('studio:campaigns-saved', load);
  window.addEventListener('studio:admin-locked', clear);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
  if (window.DRESSUP_STUDIO_ADMIN) void load();
})();
