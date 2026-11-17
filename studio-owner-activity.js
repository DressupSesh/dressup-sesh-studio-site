(() => {
  'use strict';

  const root = document.getElementById('owner-activity');
  const refresh = root.querySelector('[data-refresh]');
  const markRead = root.querySelector('[data-read]');
  const status = root.querySelector('[data-status]');
  const form = root.querySelector('form');
  const { month, total } = form.elements;
  const publish = form.querySelector('button');
  const saveStatus = root.querySelector('[data-save-status]');
  const zone = 'America/Los_Angeles';
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: zone });
  const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone });
  const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let session = 0;
  let request = 0;
  let timer;
  let displayed;
  let snapshot;
  let published;
  let counterBusy = false;

  function reviewKey(feed, id) {
    return 'studio-reviewed-v1/' + window.DRESSUP_STUDIO_ADMIN.id + '/' + feed + '/' + id;
  }

  function drawFeed(data, marked = false) {
    // Independent keys preserve simultaneous reviews across tabs and distinguish
    // a first payment from the same account's earlier signup.
    const unread = {};
    for (const feed of ['paid', 'signups']) {
      try {
        unread[feed] = data[feed].filter(row => !localStorage.getItem(reviewKey(feed, row.id)));
      } catch {
        unread[feed] = data[feed];
      }
    }
    snapshot = data;
    displayed = unread;
    for (const [feed, dateField] of [['paid', 'occurred_at'], ['signups', 'created_at']]) {
      const list = root.querySelector('[data-feed="' + feed + '"]');
      list.replaceChildren();
      for (const row of unread[feed]) {
        const item = document.createElement('li');
        item.textContent = (row.email || 'Account') + ' · ' + dateFormat.format(new Date(row[dateField]));
        list.append(item);
      }
      if (!unread[feed].length) {
        const empty = document.createElement('li');
        empty.className = 'caption';
        empty.textContent = feed === 'paid' ? 'No new paid accounts.' : 'No new signups.';
        list.append(empty);
      }
    }
    const count = unread.paid.length + unread.signups.length;
    const summary = count ? count + ' account ' + (count === 1 ? 'update' : 'updates') + ' to review.' : 'You’re all caught up.';
    status.textContent = (marked ? 'Marked as read. ' : '') + summary + ' Checked at ' + timeFormat.format(new Date(data.as_of)) + '.';
    markRead.disabled = count === 0;
  }

  function markDisplayedRead() {
    if (!window.DRESSUP_STUDIO_ADMIN || !displayed || markRead.disabled) return;
    try {
      for (const feed of ['paid', 'signups']) {
        for (const row of displayed[feed]) localStorage.setItem(reviewKey(feed, row.id), '1');
      }
      drawFeed(snapshot, true);
    } catch {
      status.textContent = 'Could not save the review on this device. Allow browser storage and try again.';
    }
  }

  async function updateFeed() {
    if (!window.DRESSUP_STUDIO_ADMIN) return;
    const current = ++request;
    refresh.disabled = true;
    status.textContent = 'Checking for new accounts…';
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_owner_activity');
      if (current !== request || !window.DRESSUP_STUDIO_ADMIN) return;
      if (error) throw error;
      drawFeed(data);
    } catch (error) {
      if (current !== request) return;
      if (error?.code === '42501') {
        window.dispatchEvent(new Event('studio:admin-denied'));
        return;
      }
      status.textContent = 'Could not check for new accounts. Tap Refresh to retry.';
    } finally {
      if (current === request) refresh.disabled = false;
    }
  }

  function drawCounter() {
    const matches = published && month.value === published.month && total.value !== '' && Number(total.value) === published.total;
    publish.textContent = matches ? '✓ Published' : 'Publish monthly total';
    publish.disabled = counterBusy || Boolean(matches);
    month.disabled = total.disabled = counterBusy;
    if (matches) {
      const label = monthFormat.format(new Date(month.value + '-01T12:00:00Z'));
      saveStatus.textContent = label + ' · ' + published.total + (published.total === 1 ? ' listing' : ' listings') + ' published to My story.';
    } else {
      saveStatus.textContent = 'Enter the total number of listings posted for the selected month.';
    }
  }

  async function loadCounter() {
    const current = session;
    counterBusy = true;
    drawCounter();
    saveStatus.textContent = 'Checking the published total…';
    try {
      const { data, error } = await window.DRESSUP_SUPABASE.rpc('studio_founder_counter');
      if (current !== session) return;
      if (error) throw error;
      if (data?.month && data.total != null) {
        published = { month: data.month.slice(0, 7), total: Number(data.total) };
        month.value = published.month;
        total.value = published.total;
      }
      counterBusy = false;
      drawCounter();
    } catch {
      if (current !== session) return;
      counterBusy = false;
      drawCounter();
      saveStatus.textContent = 'Could not check the published total. Confirm the month and count before publishing.';
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.DRESSUP_STUDIO_ADMIN || publish.disabled || !form.reportValidity()) return;
    const current = session;
    const submitted = { month: month.value, total: Number(total.value) };
    counterBusy = true;
    drawCounter();
    publish.textContent = 'Publishing…';
    saveStatus.textContent = '';
    try {
      const { error } = await window.DRESSUP_SUPABASE.rpc('studio_founder_counter_save', {
        p_month: submitted.month + '-01', p_total: submitted.total
      });
      if (current !== session) return;
      if (error) throw error;
      published = submitted;
      counterBusy = false;
      drawCounter();
    } catch {
      if (current !== session) return;
      counterBusy = false;
      drawCounter();
      saveStatus.textContent = 'Could not confirm publication. Check owner verification and try again.';
    }
  });

  function clear() {
    session++;
    request++;
    clearInterval(timer);
    displayed = published = snapshot = undefined;
    counterBusy = true;
    root.querySelectorAll('[data-feed]').forEach(list => list.replaceChildren());
    refresh.disabled = markRead.disabled = true;
    status.textContent = 'Owner verification required.';
    month.value = total.value = '';
    drawCounter();
    saveStatus.textContent = '';
  }

  function start() {
    clear();
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: zone }).formatToParts(new Date());
    month.value = parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
    void loadCounter();
    void updateFeed();
    timer = setInterval(() => { if (!document.hidden) void updateFeed(); }, 60000);
  }

  refresh.addEventListener('click', () => updateFeed());
  markRead.addEventListener('click', markDisplayedRead);
  window.addEventListener('storage', event => {
    if (snapshot && window.DRESSUP_STUDIO_ADMIN && (!event.key || event.key.startsWith('studio-reviewed-v1/'))) drawFeed(snapshot);
  });
  form.addEventListener('input', drawCounter);
  form.addEventListener('change', drawCounter);
  window.addEventListener('studio:admin-ready', start);
  window.addEventListener('studio:admin-locked', clear);
  window.addEventListener('pagehide', clear);
  for (const name of ['studio:classifications-saved', 'studio:finance-updated']) {
    window.addEventListener(name, () => updateFeed());
  }
  if (window.DRESSUP_STUDIO_ADMIN) start();
})();
