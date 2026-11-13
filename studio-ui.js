(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const track = $('#landing-slides');
  const buttons = $$('[data-slide]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goTo = index => track.scrollTo({left: track.clientWidth * Math.max(0, Math.min(buttons.length - 1, index)), behavior: reduced ? 'auto' : 'smooth'});
  buttons.forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.slide))));
  function position() {
    if (!track.clientWidth) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    buttons.forEach((button, i) => { if (i === index) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
    $('#carousel-count').textContent = `${String(index + 1).padStart(2, '0')} / 07`;
  }
  track.addEventListener('scroll', position, {passive: true});
  window.addEventListener('resize', position);
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault(); goTo(Math.round(track.scrollLeft / track.clientWidth) + (event.key === 'ArrowRight' ? 1 : -1));
  });
  $('#open-pro-waitlist').addEventListener('click', () => $('#pro-waitlist-dialog').showModal());
  $('#close-pro-waitlist').addEventListener('click', () => $('#pro-waitlist-dialog').close());
  const practices = {
    photos: ['Start clear. Save before clearing.', 'Upload one item at a time, including a full view and detail photos. Label tags and measurements; use Reference only for information photos. Remove Backgrounds, then review edges and item details. On a phone, use Save All to Phone and finish saving in the share sheet. On a computer, use the download controls. Copy your listing separately. Clear All · New Item removes the current photos, copy, creatives, and directions, so save first.'],
    listing: ['Check the facts, then copy.', 'Listing Copy reuses your uploaded photos and reference images. Add known facts in Optional item details. Verify brand, size, measurements, material, condition, and any retail-price claims before posting. Use the copy button, then paste into your marketplace. Copying something else replaces the clipboard. Save your text before Clear All · New Item.'],
    creative: ['Keep the product true to the original.', 'Choose a format and optional direction. An inspiration photo guides pose, setting, or layout; your product photos define the item. Check color, pattern, shape, and details before saving. On a phone, finish the save in the share sheet and check Photos or Files. On a computer, find the file in your downloads. Save versions you want before Clear All · New Item.']
  };
  $$('[data-best-practices]').forEach(button => button.addEventListener('click', () => {
    const [title,copy] = practices[button.dataset.bestPractices];
    $('#practices-title').textContent=title; $('#practices-copy').textContent=copy; $('#practices-dialog').showModal();
  }));
  $('#practices-close').addEventListener('click', () => $('#practices-dialog').close());
})();
