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
    photos: ['One upload, all three workflows.', 'Add your item photos here. Optional labels identify measurements, front, back, details, or fabric close ups. Mark information-only images Reference only to exclude them from background removal, finished downloads, and Creative. Save your finished work before clearing the item or refreshing.'],
    listing: ['Let the photos supply the facts.', 'Listing Copy reuses your Photos upload. Labeled and Reference only images appear in Reference Photos automatically, with priority for factual details. Add anything else in Optional item details. Check the generated title, description, and measurements before posting.'],
    creative: ['Show the same item in context.', 'Creative reuses your item photos, excluding Reference only images. Choose a format, add optional direction or an inspiration photo, and generate one visual at a time. Check that the item’s details remain accurate.']
  };
  $$('[data-best-practices]').forEach(button => button.addEventListener('click', () => {
    const [title,copy] = practices[button.dataset.bestPractices];
    $('#practices-title').textContent=title; $('#practices-copy').textContent=copy; $('#practices-dialog').showModal();
  }));
  $('#practices-close').addEventListener('click', () => $('#practices-dialog').close());
})();
