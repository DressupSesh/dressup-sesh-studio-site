(() => {
  'use strict';
  const states = new Map();
  const all = selector => Array.from(document.querySelectorAll(selector));
  function select(group, key, focus = false) {
    const state = states.get(group);
    const button = state?.buttons.find(b => b.dataset.moduleTarget === key);
    if (!button) return false;
    state.key = key;
    for (const tab of state.buttons) {
      const selected = tab === button;
      tab.setAttribute('aria-selected', String(selected));tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of state.panels) panel.hidden = panel.dataset.moduleId !== key;
    for (const shared of all('[data-module-shared-group]')) {
      if (shared.dataset.moduleSharedGroup === group) shared.hidden = !shared.dataset.moduleSharedFor.split(' ').includes(key);
    }
    if (focus) button.focus();
    return true;
  }
  function open(group, key, focus = false) {
    if (!states.has(group) || !states.get(group).buttons.some(b => b.dataset.moduleTarget === key)) return;
    const main = document.getElementById(`${group}-tab`);
    if (main?.getAttribute('aria-selected') !== 'true') main?.click();
    select(group, key, focus);
    history.replaceState(null, '', `#${group}/${key}`);
  }
  for (const nav of all('[data-module-tabs]')) {
    const group = nav.dataset.moduleTabs;
    const buttons = Array.from(nav.querySelectorAll('[data-module-target]'));
    const panels = all('[data-module-group]').filter(p => p.dataset.moduleGroup === group);
    states.set(group, { buttons, panels, key: buttons[0]?.dataset.moduleTarget });
    select(group, buttons[0]?.dataset.moduleTarget);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-module-target]');
      if (button && nav.contains(button)) open(group, button.dataset.moduleTarget);
    });
    nav.addEventListener('keydown', event => {
      const current = buttons.indexOf(event.target);if (current < 0) return;
      const last = buttons.length - 1;
      const next = event.key === 'ArrowRight' ? (current + 1) % buttons.length
        : event.key === 'ArrowLeft' ? (current + last) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
      if (next < 0) return;event.preventDefault();open(group, buttons[next].dataset.moduleTarget, true);
    });
  }
  document.querySelector('.backroom-tabs')?.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');if (!tab) return;
    const group = tab.id.replace(/-tab$/, '');const state = states.get(group);
    if (state) {select(group,state.key);history.replaceState(null,'',`#${group}/${state.key}`);}
    else history.replaceState(null,'',`#${group}`);
  });
  document.getElementById('show-unclassified')?.addEventListener('click', () => open('finance','accounts'));
  const route = () => {const match = /^#(finance|beta|prompt)\/([a-z-]+)$/.exec(location.hash);if (match) open(match[1],match[2]);};
  window.addEventListener('hashchange',route);route();
})();
