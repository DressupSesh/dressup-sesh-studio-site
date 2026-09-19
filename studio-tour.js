(() => {
  'use strict';
  const dialog = document.querySelector('#studio-tour-dialog');
  const launch = document.querySelector('#studio-tour-button');
  const close = document.querySelector('#studio-tour-close');
  const back = document.querySelector('#studio-tour-back');
  const next = document.querySelector('#studio-tour-next');
  const progress = document.querySelector('#studio-tour-progress');
  const title = document.querySelector('#studio-tour-title');
  const copy = document.querySelector('#studio-tour-copy');
  if (!dialog || !launch) return;

  const steps = [
    { tab: 'photos', target: '#dropzone', title: 'Start with the photos buyers will see.', copy: 'Upload the complete product set once. Dressup Sesh uses it across photo cleanup, listing copy and creative images.' },
    { tab: 'photos', target: '#process-button', title: 'Clean only the product photos.', copy: 'Remove backgrounds from the images intended for the listing. You can retry or edit an individual result without starting the item over.' },
    { tab: 'listing', target: '#listing-reference-picker', title: 'Give factual details priority.', copy: 'Add measurement shots, labels, tags and item details in Reference Photos. They inform the copy first and are never cleaned or saved as listing photos.' },
    { tab: 'creative', target: '#creative-generate', title: 'Create one useful visual at a time.', copy: 'Choose the format and add optional direction. Nothing is generated—or charged against a credit—until you press the create button.' },
    { tab: 'photos', target: '.workflow-tools', title: 'Save the finished item your way.', copy: 'Use the computer icon for a complete ZIP, the phone icon for the iPhone save sheet, and the copy icon for finished listing text.' },
  ];
  let index = 0;
  let focused = null;

  function clearFocus() {
    focused?.classList.remove('tour-focus');
    focused = null;
  }
  function render() {
    clearFocus();
    const step = steps[index];
    document.querySelector(`[data-tab="${step.tab}"]`)?.click();
    progress.textContent = `${String(index + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
    title.textContent = step.title;
    copy.textContent = step.copy;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? 'DONE' : 'NEXT';
    focused = document.querySelector(step.target);
    focused?.classList.add('tour-focus');
  }
  function finish() { clearFocus(); dialog.close(); }
  launch.addEventListener('click', () => { index = 0; render(); dialog.showModal(); });
  close.addEventListener('click', finish);
  back.addEventListener('click', () => { if (index > 0) { index -= 1; render(); } });
  next.addEventListener('click', () => { if (index === steps.length - 1) finish(); else { index += 1; render(); } });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('close', clearFocus);
})();
