(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('finance-status')) return;
  let generation = 0, request = 0, busy = false;
  const client = () => window.DRESSUP_SUPABASE;
  const authorized = () => !!window.DRESSUP_STUDIO_ADMIN;
  const status = (message, error = false) => { $('finance-status').textContent = message; $('finance-status').classList.toggle('error', error); };
  const current = (ticket, operation) => ticket === generation && operation === request && authorized();
  const money = (cents, currency) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(Number(cents) / 100); } catch { return `${Number(cents) / 100} ${currency}`; } };
  const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
  const controls = disabled => {
    for (const id of ['finance-refresh', 'finance-sync', 'finance-from', 'finance-to']) if ($(id)) $(id).disabled = disabled || !authorized();
    for (const button of $('finance-refunds')?.querySelectorAll('button') || []) button.disabled = disabled || !authorized();
  };
  async function rpc(name, body) {
    const result = await client().rpc(name, body);
    if (result.error) { if (result.error.code === '42501') window.dispatchEvent(new Event('studio:admin-denied')); throw result.error; }
    return result.data;
  }
  async function syncFailure(result) {
    let body = result.data || {};
    const response = result.error?.context;
    if (response && typeof response.json === 'function') {
      try { body = await (typeof response.clone === 'function' ? response.clone() : response).json(); } catch { /* No JSON error body. */ }
    }
    const code = body?.code;
    const messages = {
      UNAUTHORIZED: 'Your owner session expired. Sign in again, then sync the same dates.',
      FORBIDDEN: 'Verify your owner account with your authenticator, then sync again.',
      LIVE_STRIPE_NOT_CONFIGURED: 'The server is not connected to live Stripe. This is a configuration issue, not your account’s Test label.',
      LIVE_MODE_REQUIRED: 'The import expects live Stripe payments. Stripe test-mode payments are kept separate.',
      FINANCE_SYNC_BUSY: 'Another Stripe import is running. Wait for it to finish, then refresh records.',
      INVALID_DATE_RANGE: 'Choose valid start and through dates, up to one year apart.',
      SYNC_TIME_LIMIT_NARROW_RANGE: 'The import reached its time limit. Retry a smaller date window.',
      SYNC_PAGE_LIMIT_NARROW_RANGE: 'The import reached its record limit. Retry a smaller date window.',
      FINANCE_RECORD_FAILED: 'Stripe was reached, but a record could not be saved. Existing records are preserved; this needs a backend check.',
      SYNC_FAILED: 'The Stripe import failed. Existing records are preserved; this needs a connection or backend check.'
    };
    if (code && messages[code]) return messages[code];
    if (response?.status === 401) return messages.UNAUTHORIZED;
    if (response?.status === 403) return messages.FORBIDDEN;
    return 'The browser could not reach the Stripe sync. Refresh the Back Room once and retry; changing dates will not fix a connection error.';
  }
  function render(data) {
    const summary = $('finance-summary'); if (summary) {
      summary.replaceChildren();
      for (const total of data.totals || []) {
        const block = element('div');block.className = 'finance-currency';
        block.append(element('h3', `${total.currency.toUpperCase()} · Imported Stripe activity`));
        const list = element('dl');
        for (const [label, value] of [['Charges after payment reversals', total.charge_gross_cents], ['Refunds after refund failures', total.refund_gross_cents], ['Stripe fees', total.stripe_fees_cents], ['Charges − refunds − fees', total.charge_refund_fee_net_cents]]) list.append(element('dt', label), element('dd', money(value, total.currency)));
        block.append(list, element('p', 'Account-wide cash activity for imported dates. Excludes generation costs; transfers, payouts, and opening balances are separate. This is not profit or your current Stripe balance.'));
        summary.append(block);
      }
      if (!data.totals?.length) summary.append(element('p', 'Fees are unknown until Stripe balance activity is imported.'));
      if (data.fee_rows?.length) {
        const detail = element('details'), table = element('table'), head = element('thead'), heading = element('tr'), body = element('tbody');
        detail.append(element('summary', 'Recent recorded fees'));
        for (const label of ['Date', 'Type', 'Embedded fee', 'Standalone amount']) heading.append(element('th', label)); head.append(heading);
        for (const fee of data.fee_rows) { const row = element('tr');for (const text of [new Date(fee.occurred_at).toLocaleString(), fee.type, money(fee.fee_cents, fee.currency), fee.reporting_category === 'fee' ? money(fee.amount_cents, fee.currency) : 'Included in charge']) row.append(element('td', text)); body.append(row); }
        table.append(head, body);detail.append(table);summary.append(detail);
      }
    }
    const coverage = $('finance-coverage'); if (coverage) {
      coverage.replaceChildren();
      const complete = (data.runs || []).filter(run => run.status === 'completed');
      if (!complete.length) coverage.append(element('p', 'No completed history reconciliation yet. Webhook rows alone do not establish date coverage.'));
      for (const run of (data.runs || []).slice(0, 6)) coverage.append(element('p', `${run.status === 'completed' ? 'Completed import' : run.status === 'running' ? 'Import running' : 'Incomplete import'}: ${new Date(run.from_at).toLocaleString()} → ${new Date(run.to_at).toLocaleString()}${run.finished_at ? ` · checked ${new Date(run.finished_at).toLocaleString()}` : ''}${run.error_code ? ` · ${run.error_code}` : ''}`));
      coverage.append(element('p', 'Chosen start and through dates are inclusive in UTC; displayed coverage ends are exclusive. Refresh records reads the app; Sync Stripe records checks current Stripe data. Fee availability can lag by up to 96 hours.'));
    }
    const refunds = $('finance-refunds'); if (refunds) {
      refunds.replaceChildren();
      if (!data.refunds?.length) refunds.append(element('p', 'No refunds imported yet, so there are no credit-removal buttons to show. Open Fees & sync and complete Sync Stripe records first.'));
      for (const refund of data.refunds || []) {
        const row = element('article');row.className = 'finance-refund';
        row.append(element('h3', `${money(refund.amount_cents, refund.currency)} · ${refund.transaction_kind.replaceAll('_', ' ')}`), element('p', `${new Date(refund.occurred_at).toLocaleString()} · ${refund.status} · ${refund.refund_id}`));
        row.append(element('p', refund.account_email || (refund.user_id ? `Account ${refund.user_id}` : 'Account not linked — verify the payment before reviewing credits.')));
        if (refund.transaction_kind === 'subscription') {
          const blocked = refund.membership_access?.blocked;
          row.append(element('p', blocked === true
            ? 'Workflow access suspended. Available monthly and saved credits are held until a valid membership resumes. Cancel the subscription in Stripe separately to stop renewal.'
            : blocked === false
              ? 'This refund does not suspend the current membership invoice. A newer payment or subscription may have restored access. Cancellation and renewal remain separate Stripe actions.'
              : 'Membership access could not be confirmed. Sync Stripe records and refresh before checking the account.'));
        }
        if (refund.review_action) row.append(element('p', refund.review_action === 'keep' ? 'Reviewed: credits kept.' : `Reviewed: ${refund.credits_revoked} unused purchased credits removed.`));
        else if (refund.status === 'succeeded' && refund.transaction_kind === 'creative_pack') {
          const keep = element('button', 'Keep credits');keep.type = 'button'; keep.addEventListener('click', () => void review(refund, 'keep', 0)); row.append(keep);
          const eligible = Number(refund.credit_limit?.eligible || 0);
          if (eligible > 0) {
            const button = element('button', `Remove ${eligible} unused pack credits`);button.type = 'button';button.addEventListener('click', () => void review(refund, 'revoke', eligible));row.append(button);
            row.append(element('p', 'Only the bounded unused purchase allowance is eligible. Carried trial bonuses and unrelated purchases are preserved.'));
          } else if (refund.transaction_kind === 'creative_pack') row.append(element('p', 'No safely linked unused pack credits are eligible. Credits may have been used or the original grant may not be linked; review the purchase and usage before changing balances.'));
        }
        refunds.append(row);
      }
    }
  }
  async function load() {
    if (!authorized() || busy) return;
    const ticket = generation, operation = ++request;busy = true;controls(true);status('Loading finance records…');
    try { const data = await rpc('studio_admin_finance');if (!current(ticket, operation)) return;render(data);status('Recorded finance activity loaded. Sync Stripe records to check it against Stripe.'); }
    catch (error) { if (current(ticket, operation)) status(error.message || 'Finance records could not load.', true); }
    finally { if (ticket === generation && operation === request) { busy = false;controls(false); } }
  }
  async function sync() {
    if (!authorized() || busy) return;
    const from = $('finance-from')?.value, to = $('finance-to')?.value;
    if (!from || !to || from > to) { status('Choose valid start and end dates.', true);return; }
    const ticket = generation, operation = ++request;busy = true;controls(true);status('Syncing Stripe records. Customer billing and credits are unchanged.');
    try {
      const result = await client().functions.invoke('studio-sync-stripe', { body: { from, to } });
      if (!current(ticket, operation)) return;
      if (result.error || result.data?.status !== 'completed') throw new Error(await syncFailure(result));
      const data = await rpc('studio_admin_finance');if (!current(ticket, operation)) return;render(data);
      status(`Stripe history imported: ${result.data.counts.refunds} refunds and ${result.data.counts.balances} balance records checked. Credits unchanged.`);
      window.dispatchEvent(new Event('studio:finance-updated'));
    } catch (error) { if (current(ticket, operation)) status(error.message || 'Import could not complete.', true); }
    finally { if (ticket === generation && operation === request) { busy = false;controls(false); } }
  }
  async function review(refund, action, credits) {
    if (!authorized() || busy) return;
    const message = action === 'revoke' ? `Remove ${credits} unused purchased creative credits for this refunded pack? Trial bonuses and other credits will stay unchanged.` : 'Mark this refund reviewed and keep its current credits? This will not cancel a subscription.';
    if (!window.confirm(message)) return;
    const ticket = generation, operation = ++request;busy = true;controls(true);status('Saving refund review…');
    try {
      await rpc('studio_admin_refund_review', { p_livemode: true, p_refund_id: refund.refund_id, p_action: action, p_credits: credits, p_note: action === 'keep' ? 'Owner chose to keep credits.' : 'Owner removed bounded unused purchased credits.' });
      if (!current(ticket, operation)) return;
      const data = await rpc('studio_admin_finance');if (!current(ticket, operation)) return;render(data);
      status(action === 'keep' ? 'Refund reviewed; credits kept.' : `${credits} unused purchased creative credits removed. Review saved.`);
      window.dispatchEvent(new Event('studio:finance-updated'));
    } catch (error) { if (current(ticket, operation)) status(error.code === '40001' ? 'Credits or review changed. Refresh before reviewing again.' : error.message || 'Refund review could not save.', true); }
    finally { if (ticket === generation && operation === request) { busy = false;controls(false); } }
  }
  $('finance-refresh')?.addEventListener('click', () => void load());
  $('finance-sync')?.addEventListener('click', () => void sync());
  if ($('finance-from') && !$('finance-from').value) $('finance-from').value = '2026-08-01';
  if ($('finance-to') && !$('finance-to').value) $('finance-to').value = new Date().toISOString().slice(0, 10);
  window.addEventListener('studio:admin-ready', () => { generation++;request++;busy = false;void load(); });
  window.addEventListener('studio:admin-locked', () => { generation++;request++;busy = false;for (const id of ['finance-summary', 'finance-coverage', 'finance-refunds']) $(id)?.replaceChildren();controls(true);status('Owner verification required.'); });
  controls(true);if (authorized()) void load();
})();
