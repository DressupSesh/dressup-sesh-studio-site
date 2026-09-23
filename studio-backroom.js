(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = { background_remove: 'Background removal', listing_copy: 'Listing copy', creative_image: 'Creative images' };
  const groups = { customer: 'Customers', test: 'Test accounts', unclassified: 'Unclassified accounts', owner: 'Owner', all: 'All accounts (includes testing)' };
  let page = 0, request = 0, snapshot = null;
  let betaRequest = 0, betaSnapshot = null, betaLoaded = false;
  const number = value => Number(value || 0).toLocaleString('en-US');
  const dollars = value => (Number(value) / 1000000).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const money = value => (Number(value || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const date = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function emptyRow(body, message, columns) {
    const row = node('tr'), cell = node('td', message);
    cell.colSpan = columns; row.append(cell); body.append(row);
  }
  function notify(message, error = false) {
    $('dashboard-status').textContent = message;
    $('dashboard-status').classList.toggle('error', error);
  }
  function clear() {
    request++; snapshot = null;
    $('dashboard-data').hidden = true;
    $('export').disabled = true;
    for (const id of ['usage-list', 'daily-rows', 'account-rows', 'recent-activity', 'recent-billing']) $(id).replaceChildren();
    for (const id of ['accounts-total','confirmed-total','active-total','paid-total','finance-window','collected-total','refunded-total','net-collected','live-mrr','subscription-collected','addon-collected','paid-transactions','finance-started','live-subscriptions','live-cancelling','refund-reviews','unmatched-transactions','failure-rate','pending-count','retry-rate','retry-coverage','cost-total','cost-coverage']) $(id).textContent = '—';
  }
  function render(data) {
    const s = data.summary, f = data.financial || {};
    $('accounts-total').textContent = number(s.accounts);
    $('accounts-new').textContent = `${number(s.new_accounts)} new in activity window`;
    $('confirmed-total').textContent = number(s.confirmed);
    $('active-total').textContent = number(s.active_users);
    $('paid-total').textContent = number(s.active_plan_records);
    $('paid-note').textContent = `${number(s.cancelling)} scheduled to cancel · account state`;
    $('items-count').textContent = `${number(s.items_with_success)} items processed`;
    $('finance-window').textContent = `Last ${number(data.days)} days`;
    $('collected-total').textContent = money(f.live_collected_cents);
    $('refunded-total').textContent = money(f.live_refunded_cents);
    $('net-collected').textContent = money(Number(f.live_collected_cents || 0) - Number(f.live_refunded_cents || 0));
    $('live-mrr').textContent = money(f.live_mrr_cents);
    $('subscription-collected').textContent = money(f.subscription_collected_cents);
    $('addon-collected').textContent = money(f.addon_collected_cents);
    $('paid-transactions').textContent = number(f.paid_transactions);
    $('finance-started').textContent = f.data_started_at ? date(f.data_started_at) : 'No records yet';
    $('live-subscriptions').textContent = number(f.active_live_subscriptions);
    $('live-cancelling').textContent = number(f.cancelling_live_subscriptions);
    $('refund-reviews').textContent = number(f.refund_credit_reviews);
    $('unmatched-transactions').textContent = number(f.unmatched_live_transactions);
    $('snapshot-caption').textContent = `${groups[data.audience]} · Activity since ${new Date(data.window_start).toISOString().slice(0,10)} UTC · Updated ${date(data.as_of)}. Account and plan totals are current, not limited to new signups.`;
    $('classification-note').hidden = !data.unclassified_total;
    $('classification-text').textContent = `${number(data.unclassified_total)} accounts have not been classified. They are excluded from Customer totals until you label them.`;
    const usage = $('usage-list'); usage.replaceChildren();
    let failed = 0, succeeded = 0, pending = 0, stalled = 0, cost = 0, covered = 0, attempts = 0, background = null;
    for (const u of data.usage) {
      if (u.operation === 'background_remove') background = u;
      failed += Number(u.failed); succeeded += Number(u.succeeded); pending += Number(u.pending); stalled += Number(u.stalled);
      attempts += Number(u.attempts); covered += Number(u.cost_covered); cost += Number(u.cost_micros || 0);
      const row = node('div', undefined, 'usage-row'), label = node('div', names[u.operation] || u.operation);
      const retryText = u.operation === 'background_remove' ? ` · ${number(u.retries)} tracked retries` : '';
      label.append(node('small', `${number(u.failed)} failed${retryText} · ${u.avg_seconds === null ? 'No timing data' : `${number(u.avg_seconds)} sec avg.`}`));
      row.append(label, node('strong', number(u.succeeded))); usage.append(row);
    }
    $('failure-rate').textContent = failed + succeeded ? `${(100 * failed / (failed + succeeded)).toFixed(1)}% (${number(failed)} failed)` : 'No completed operations';
    $('pending-count').textContent = `${number(pending)} / ${number(stalled)}`;
    const retryCovered = Number(background?.retry_covered || 0), retries = Number(background?.retries || 0), backgroundAttempts = Number(background?.attempts || 0);
    $('retry-rate').textContent = retryCovered ? `${(100 * retries / retryCovered).toFixed(1)}% (${number(retries)} ${retries === 1 ? 'retry' : 'retries'})` : 'No tracked photos yet';
    $('retry-coverage').textContent = `${number(retryCovered)} / ${number(backgroundAttempts)} background attempts`;
    $('cost-total').textContent = covered ? dollars(cost) : 'Not recorded';
    $('cost-coverage').textContent = `${number(covered)} / ${number(attempts)} operations`;
    const daily = $('daily-rows'); daily.replaceChildren();
    for (const d of data.daily) {
      const row = node('tr');
      for (const key of ['day','signups','bg','copy','creative','failed','collected_cents','refunded_cents']) {
        row.append(node('td', key === 'day' ? d[key] : key.endsWith('_cents') ? money(d[key]) : number(d[key])));
      }
      daily.append(row);
    }
    const body = $('account-rows'); body.replaceChildren();
    for (const a of data.accounts) {
      const row = node('tr'), email = node('td', a.email || 'Email unavailable', 'account-email');
      email.append(node('small', a.email_confirmed_at ? 'Email confirmed' : 'Awaiting confirmation'));
      const plan = node('td', a.plan);
      plan.append(node('small', a.subscription_status || 'No subscription'));
      if (a.cancel_at_period_end) plan.append(node('small', 'Cancellation scheduled'));
      if (a.current_period_end) plan.append(node('small', `Period ends ${date(a.current_period_end)}`));
      row.append(email, node('td', a.audience), plan);
      for (const key of ['background_remaining','copy_remaining','creative_remaining']) row.append(node('td', a.plan === 'owner' ? 'Unlimited' : number(a[key])));
      row.append(node('td', date(a.last_sign_in_at)));
      const action = node('td');
      if (a.plan === 'owner') action.textContent = 'Owner';
      else {
        const select = node('select'); select.setAttribute('aria-label', `Analytics group for ${a.email}`);
        for (const key of ['unclassified','customer','test']) { const option = node('option', key[0].toUpperCase()+key.slice(1)); option.value = key; select.append(option); }
        select.value = a.audience;
        const save = node('button', 'Save'); save.type = 'button'; save.setAttribute('aria-label', `Save analytics group for ${a.email}`);
        save.addEventListener('click', async () => {
          if (select.value === a.audience) return;
          if (!window.confirm(`Classify ${a.email} as ${select.value}? This only changes analytics grouping.`)) return;
          const ticket = request;
          save.disabled = true;
          try {
            const { error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_classify', { p_user_id: a.id, p_audience: select.value });
            if (ticket !== request || !window.DRESSUP_STUDIO_ADMIN) return;
            if (error) throw error;
            await load();
          } catch (error) {
            if (ticket !== request) return;
            if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
            else notify('Classification could not be saved. Your billing and credits were not changed.', true);
          } finally { save.disabled = false; }
        });
        action.append(select, save);
      }
      row.append(action); body.append(row);
    }
    if (!data.accounts.length) emptyRow(body, 'No accounts in this group match your search.', 8);
    $('previous').disabled = data.page === 0;
    $('next').disabled = (data.page+1)*data.page_size >= data.account_total;
    $('page-caption').textContent = `${number(data.account_total)} matching accounts · Page ${data.page+1}`;
    const recent = $('recent-activity'); recent.replaceChildren();
    for (const e of data.recent) {
      const li = node('li', `${names[e.operation] || e.operation} · ${e.status}`, `status-${e.status}`);
      const retry = Number(e.retry_ordinal || 0) > 1 ? ` · retry ${number(e.retry_ordinal)}` : '';
      const estimate = e.estimated_cost_micros == null ? '' : ` · ${dollars(e.estimated_cost_micros)} est.`;
      li.append(node('small', `${e.email || 'Account'} · ${date(e.created_at)}${retry}${estimate}`)); recent.append(li);
    }
    if (!data.recent.length) recent.append(node('li', 'No operations in this group and time window.'));
    const billing = $('recent-billing'); billing.replaceChildren();
    for (const e of data.recent_billing || []) {
      const amount = Number(e.amount_cents || 0);
      const label = e.kind === 'refund' ? 'Refund' : e.kind === 'creative_pack' ? 'Creative pack' : e.kind === 'subscription' ? 'Subscription' : 'Payment';
      const li = node('li', `${label} · ${amount < 0 ? '−' : ''}${money(Math.abs(amount))}`, `status-${e.status}`);
      li.append(node('small', `${e.status} · ${date(e.occurred_at)}`)); billing.append(li);
    }
    if (!(data.recent_billing || []).length) billing.append(node('li', 'No live billing records yet.'));
    $('dashboard-data').hidden = false;
    $('export').disabled = false;
  }
  async function load() {
    if (!window.DRESSUP_STUDIO_ADMIN || !window.DRESSUP_SUPABASE) return;
    const ticket = ++request;
    snapshot = null; $('dashboard-data').hidden = true; $('export').disabled = true;
    notify('Loading Studio analytics…');
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_dashboard', { p_days: Number($('days').value), p_audience: $('audience').value, p_search: $('account-search').value.trim(), p_page: page });
      if (ticket !== request || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      if (!data || !data.summary || !data.financial || !Array.isArray(data.accounts)) throw new Error('Invalid analytics response');
      if (page > 0 && data.account_total <= page * data.page_size) { page = 0; await load(); return; }
      snapshot = data; render(data); notify('Studio records loaded. Revenue and refunds are live-mode only; usage follows the selected account group.');
    } catch (error) {
      if (ticket !== request) return;
      clear();
      if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else notify('Analytics could not load. If this is a new deployment, confirm the Studio Back Room database migration is installed, then refresh.', true);
    }
  }
  const betaNames = {
    profile_completed: 'Profile completed', account_verified: 'Account verified', trial_started: 'Trial started',
    first_item: 'First item', three_items: 'Three items', survey_submitted: 'Survey', paid_continuation: 'Continue paid beta'
  };
  const labels = {closet_to_list: 'Closet to list', secondhand_occasional: 'Buys secondhand / sometimes sells', exploring_selling: 'Exploring selling', in_person: 'In person', '1_5': '1–5', '6_15': '6–15', '16_30': '16–30', '31_plus': '31+', '6_20': '6–20', '21_50': '21–50', '51_100': '51–100', '101_plus': '101+'};
  const pretty = value => labels[value] || String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  function betaNotify(message, error = false) {
    $('beta-status').textContent = message;
    $('beta-status').classList.toggle('error', error);
  }
  function clearBeta() {
    betaRequest++; betaSnapshot = null; betaLoaded = false;
    $('beta-data').hidden = true;
    $('beta-export').disabled = true;
    $('beta-tester-rows').replaceChildren();
    $('beta-funnel').replaceChildren();
  }
  function addDetailFact(list, label, value) {
    const wrap = node('div'), term = node('dt', label), definition = node('dd', value);
    wrap.append(term, definition); list.append(wrap);
  }
  function showBetaDetail(tester) {
    const content = $('beta-detail-content'); content.replaceChildren();
    content.append(node('p', 'BETA TESTER', 'eyebrow'), node('h2', tester.display_name || tester.email || 'Tester'));
    const facts = node('dl', undefined, 'facts beta-detail-facts');
    addDetailFact(facts, 'Email', tester.email || '—');
    addDetailFact(facts, 'Resale relationship', pretty(tester.resale_relationship));
    addDetailFact(facts, 'Platforms', Array.isArray(tester.platforms) ? tester.platforms.map(pretty).join(', ') : '—');
    addDetailFact(facts, 'Ideal monthly listings', pretty(tester.ideal_monthly_listing_volume));
    addDetailFact(facts, 'Source', tester.source_code || 'Direct / not captured');
    addDetailFact(facts, 'Signed up', date(tester.signup_date));
    addDetailFact(facts, 'Trial', `${pretty(tester.trial_stage)} · ${number(tester.trial_completed_items)} of 3 items`);
    addDetailFact(facts, 'Survey', pretty(tester.survey_state));
    addDetailFact(facts, 'Paid decision', pretty(tester.paid_beta_decision));
    addDetailFact(facts, 'Issue flag', tester.issue_flag ? 'Flagged for follow-up' : 'No issue flagged');
    content.append(facts);
    const survey = tester.survey_response;
    if (survey && typeof survey === 'object') {
      content.append(node('h3', 'Survey response'));
      const answers = node('dl', undefined, 'facts beta-detail-facts');
      addDetailFact(answers, 'Output readiness', pretty(survey.output_readiness));
      addDetailFact(answers, 'Most valuable feature', pretty(survey.most_valuable_feature));
      addDetailFact(answers, 'Friction', survey.friction || '—');
      addDetailFact(answers, 'Likely monthly volume', pretty(survey.likely_monthly_volume));
      addDetailFact(answers, '$12.99 fit', pretty(survey.price_fit));
      addDetailFact(answers, 'Would make it a definite yes', survey.definite_yes || '—');
      content.append(answers);
    }
    if (tester.nonstarter_response) content.append(node('p', `Non-starter check-in: ${tester.nonstarter_response}`, 'notice'));
    const dialog = $('beta-detail');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  async function setBetaIssue(tester) {
    const next = !tester.issue_flag;
    const verb = next ? 'Flag' : 'Clear the flag for';
    if (!window.confirm(`${verb} ${tester.email || tester.display_name} for beta follow-up?`)) return;
    try {
      const { error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_set_beta_issue', { p_user_id: tester.user_id, p_issue_flag: next });
      if (error) throw error;
      await loadBeta();
    } catch (error) {
      if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else betaNotify('The issue flag could not be saved. Refresh and try again.', true);
    }
  }
  function renderBeta(data) {
    $('beta-caption').textContent = `${number(data.tester_total)} beta testers match these filters · Updated ${date(data.as_of)}.`;
    $('beta-tester-count').textContent = `${number(data.tester_total)} testers`;
    const funnel = $('beta-funnel'); funnel.replaceChildren();
    for (const key of ['profile_completed', 'account_verified', 'trial_started', 'first_item', 'three_items', 'survey_submitted', 'paid_continuation']) {
      const card = node('div', undefined, 'beta-funnel-step');
      card.append(node('span', betaNames[key]), node('strong', number(data.funnel[key]))); funnel.append(card);
    }
    const body = $('beta-tester-rows'); body.replaceChildren();
    for (const tester of data.testers) {
      const row = node('tr');
      const identity = node('td', tester.display_name || 'Unnamed tester', 'account-email'); identity.append(node('small', tester.email || 'Email unavailable'));
      row.append(identity, node('td', Array.isArray(tester.platforms) ? tester.platforms.map(pretty).join(', ') : '—'), node('td', tester.source_code || '—'));
      const trial = node('td', `${number(tester.trial_completed_items)} / 3`); trial.append(node('small', pretty(tester.trial_stage))); row.append(trial);
      row.append(node('td', pretty(tester.survey_state)), node('td', pretty(tester.paid_beta_decision)));
      const issue = node('td');
      const issueButton = node('button', tester.issue_flag ? 'Flagged' : 'Flag issue'); issueButton.type = 'button'; issueButton.classList.toggle('issue-active', Boolean(tester.issue_flag));
      issueButton.addEventListener('click', () => { void setBetaIssue(tester); }); issue.append(issueButton); row.append(issue);
      const detail = node('td'), detailButton = node('button', 'View'); detailButton.type = 'button'; detailButton.addEventListener('click', () => showBetaDetail(tester)); detail.append(detailButton); row.append(detail);
      body.append(row);
    }
    if (!data.testers.length) emptyRow(body, 'No beta testers match these filters yet.', 8);
    $('beta-data').hidden = false;
    $('beta-export').disabled = false;
  }
  async function loadBeta() {
    if (!window.DRESSUP_STUDIO_ADMIN || !window.DRESSUP_SUPABASE) return;
    const ticket = ++betaRequest;
    betaSnapshot = null; $('beta-data').hidden = true; $('beta-export').disabled = true;
    betaNotify('Loading private beta records…');
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_admin_beta_dashboard', {
        p_platform: $('beta-platform').value, p_relationship: $('beta-relationship').value,
        p_volume: $('beta-volume').value, p_source: $('beta-source').value.trim(),
        p_stage: $('beta-stage').value, p_paid_choice: $('beta-paid-choice').value
      });
      if (ticket !== betaRequest || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      if (!data || !data.funnel || !Array.isArray(data.testers)) throw new Error('Invalid beta dashboard response');
      betaSnapshot = data; betaLoaded = true; renderBeta(data); betaNotify('Beta records loaded. Tester information is owner-only.');
    } catch (error) {
      if (ticket !== betaRequest) return;
      clearBeta();
      if (error?.code === '42501') window.dispatchEvent(new Event('studio:admin-denied'));
      else betaNotify('Beta records could not load. If this is a new deployment, confirm the beta database migration is installed, then refresh.', true);
    }
  }
  function activateTab(tab) {
    const beta = tab === 'beta';
    $('finance-pane').hidden = beta; $('beta-pane').hidden = !beta;
    $('finance-tab').setAttribute('aria-selected', String(!beta)); $('beta-tab').setAttribute('aria-selected', String(beta));
    if (beta && !betaLoaded) void loadBeta();
  }
  $('filters').addEventListener('submit', e => { e.preventDefault(); page = 0; void load(); });
  for (const id of ['days','audience']) $(id).addEventListener('change', () => { page = 0; void load(); });
  $('search-form').addEventListener('submit', e => { e.preventDefault(); page = 0; void load(); });
  $('previous').addEventListener('click', () => { page = Math.max(0,page-1); void load(); });
  $('next').addEventListener('click', () => { page++; void load(); });
  $('show-unclassified').addEventListener('click', () => { $('audience').value = 'unclassified'; page = 0; $('account-search').value = ''; void load(); });
  $('finance-tab').addEventListener('click', () => activateTab('finance'));
  $('beta-tab').addEventListener('click', () => activateTab('beta'));
  $('beta-filters').addEventListener('submit', event => { event.preventDefault(); void loadBeta(); });
  $('beta-export').addEventListener('click', () => {
    if (!betaSnapshot || !window.DRESSUP_STUDIO_ADMIN) return;
    const rows = [['Beta testers · owner-only export'], ['As of', betaSnapshot.as_of], [], ['Profile completed', betaSnapshot.funnel.profile_completed], ['Account verified', betaSnapshot.funnel.account_verified], ['Trial started', betaSnapshot.funnel.trial_started], ['First item', betaSnapshot.funnel.first_item], ['Three items', betaSnapshot.funnel.three_items], ['Survey submitted', betaSnapshot.funnel.survey_submitted], ['Paid continuation', betaSnapshot.funnel.paid_continuation], [], ['Name', 'Email', 'Resale type', 'Platforms', 'Ideal listings', 'Source', 'Signup date', 'Trial items', 'Trial stage', 'Survey state', 'Output readiness', 'Most valuable feature', 'Friction', 'Likely volume', '$12.99 fit', 'Definite yes', 'Paid choice', 'Issue flag']];
    for (const t of betaSnapshot.testers) { const s = t.survey_response || {}; rows.push([t.display_name, t.email, t.resale_relationship, Array.isArray(t.platforms) ? t.platforms.join('; ') : '', t.ideal_monthly_listing_volume, t.source_code, t.signup_date, t.trial_completed_items, t.trial_stage, t.survey_state, s.output_readiness, s.most_valuable_feature, s.friction, s.likely_monthly_volume, s.price_fit, s.definite_yes, t.paid_beta_decision, t.issue_flag ? 'yes' : 'no']); }
    const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return `"${text.replaceAll('"','""')}"`; };
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `studio-beta-testers-${betaSnapshot.as_of.slice(0,10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('export').addEventListener('click', () => {
    if (!snapshot || !window.DRESSUP_STUDIO_ADMIN) return;
    const rows = [['Studio analytics summary · excludes account emails'],['Group',snapshot.audience],['As of',snapshot.as_of],['Window start (UTC)',snapshot.window_start],[],['Account metric','Value'],...Object.entries(snapshot.summary),[],['Live financial metric','Value'],...Object.entries(snapshot.financial),[],['Operation','Succeeded','Failed','In progress','Stalled','Retries','Retry-covered operations','Recorded estimate USD','Cost-covered operations','Total operations'],...snapshot.usage.map(u => [u.operation,u.succeeded,u.failed,u.pending,u.stalled,u.retries,u.retry_covered,u.cost_micros === null ? 'Unknown' : Number(u.cost_micros)/1000000,u.cost_covered,u.attempts]),[],['Financial totals are business-wide live USD before Stripe fees. Cost estimates are incomplete; missing estimates are unknown, not zero.'],[],['UTC date','New accounts','Backgrounds','Copy','Creative','Failed','Collected USD','Refunded USD'],...snapshot.daily.map(d=>[d.day,d.signups,d.bg,d.copy,d.creative,d.failed,Number(d.collected_cents||0)/100,Number(d.refunded_cents||0)/100])];
    const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return `"${text.replaceAll('"','""')}"`; };
    const blob = new Blob(['\ufeff' + rows.map(row=>row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `studio-summary-${snapshot.audience}-${snapshot.as_of.slice(0,10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener('studio:admin-ready', () => { void load(); });
  window.addEventListener('studio:admin-locked', () => { clear(); clearBeta(); });
  window.addEventListener('pagehide', () => { clear(); clearBeta(); });
  if (window.DRESSUP_STUDIO_ADMIN) void load();
})();
