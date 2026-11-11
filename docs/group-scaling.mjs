// Use IGV's quantitative track state so scaling survives session exports.
export function signalTrackViews(browser) {
  return browser.trackViews.filter(view => view.track?.type === 'wig' && !view.track.disposed);
}

export async function scaleSelectedTracks(browser, range) {
  const views = signalTrackViews(browser).filter(view => view.track.selected);
  if (!views.length) throw new Error('Select signal tracks using their checkboxes.');
  let min, max;
  if (range) {
    min = String(range.min).trim(); max = String(range.max).trim();
    if (!min || !max || !Number.isFinite(Number(min)) || !Number.isFinite(Number(max)) || Number(min) >= Number(max)) {
      throw new Error('Enter finite minimum and maximum values, with minimum below maximum.');
    }
    min = Number(min); max = Number(max);
  }
  const group = range ? undefined : `scale-${crypto.randomUUID()}`;
  for (const {track} of views) {
    track.autoscale = false;
    track.config.autoscale = false;
    if (range) {
      delete track.config.autoscaleGroup;
      track.config.min = min; track.config.max = max;
      track.setDataRange({min, max});
    } else {
      track.autoscaleGroup = group;
      track.config.autoscaleGroup = group;
    }
  }
  // Recompute every group, including any remaining members of an earlier group.
  await browser.updateViews();
  return views.length;
}

export function scalingPanelPosition(label, panel, viewport) {
  return {
    left: Math.max(8, Math.min(label.right + 8, viewport.width - panel.width - 8)),
    top: Math.max(8, Math.min(label.top, viewport.height - panel.height - 8))
  };
}

export function installGroupScaling(browser, controls) {
  const {row, count, auto, apply, clear, close, min, max} = controls;
  let panelOpen = false, anchorView;
  const root = browser.root;
  const style = root.ownerDocument.createElement('style');
  style.textContent = `
    .igv-track-label input[data-scale-select] { margin: 0 4px 0 0; vertical-align: middle; cursor: pointer; }
    .igv-track-label:has(input[data-scale-select]:checked) { background: #dceafa; color: #123f68; }
    .igv-viewport[data-scale-selected=true] { outline: 2px solid #477b9c; outline-offset: -2px; }
  `;
  root.appendChild(style);

  function position() {
    if (row.hidden) return;
    const chosen = signalTrackViews(browser).filter(view => view.track.selected);
    const anchor = chosen.includes(anchorView) ? anchorView : chosen[0];
    const label = anchor?.viewports.map(viewport => viewport.trackLabelElement).find(element => element?.getBoundingClientRect().width > 0);
    if (!label) return;
    const window = root.ownerDocument.defaultView;
    const point = scalingPanelPosition(label.getBoundingClientRect(), row.getBoundingClientRect(), {width:window.innerWidth, height:window.innerHeight});
    row.style.left = `${point.left}px`;
    row.style.top = `${point.top}px`;
  }

  function sync() {
    const views = signalTrackViews(browser);
    const chosen = views.filter(view => view.track.selected);
    if (chosen.length === 0) panelOpen = false;
    row.hidden = !panelOpen;
    count.textContent = `${chosen.length} selected`;
    auto.disabled = apply.disabled = clear.disabled = chosen.length === 0;
    for (const view of views) {
      const selected = Boolean(view.track.selected);
      const checkbox = view.trackSelectionContainer?.querySelector('input');
      if (checkbox) checkbox.checked = selected;
      view.setDragHandleSelectionState(selected);
      for (const viewport of view.viewports) {
        viewport.viewportElement.dataset.scaleSelected = String(selected);
        const label = viewport.trackLabelElement;
        if (!label) continue;
        let input = label.querySelector('input[data-scale-select]');
        if (!input) {
          input = root.ownerDocument.createElement('input');
          input.type = 'checkbox';
          input.dataset.scaleSelect = '';
          label.prepend(input);
        }
        input.checked = selected;
        input.setAttribute('aria-label', `Select ${view.track.name} for group scaling`);
        input.title = 'Select for group scaling · press S for controls';
      }
    }
    position();
  }
  function checkboxView(event) {
    const input = event.composedPath().find(element => element.matches?.('input[data-scale-select]'));
    if (!input) return;
    return signalTrackViews(browser).find(view => view.viewports.some(viewport => viewport.trackLabelElement?.contains(input)));
  }
  root.addEventListener('click', event => {
    const view = checkboxView(event);
    if (view) {
      // The checkbox owns selection; the label keeps IGV's metadata click handler.
      event.stopImmediatePropagation();
      view.track.selected = !view.track.selected;
      if (view.track.selected) anchorView = view;
    }
    // IGV's native selection toggle can also clear track selection.
    queueMicrotask(sync);
  }, true);
  root.addEventListener('mousedown', event => { if (checkboxView(event)) event.stopPropagation(); }, true);
  root.addEventListener('change', () => queueMicrotask(sync), true);
  root.addEventListener('scroll', position, true);
  root.ownerDocument.addEventListener('scroll', position, true);
  root.ownerDocument.defaultView?.addEventListener('resize', position);
  for (const event of ['trackorderchanged', 'trackremoved', 'genomechange', 'columnlayoutchange', 'locuschange']) browser.on(event, sync);
  clear.addEventListener('click', () => {
    for (const view of signalTrackViews(browser)) view.track.selected = false;
    sync();
  });
  root.ownerDocument.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panelOpen) {
      panelOpen = false;
      sync();
      return;
    }
    const typing = event.composedPath().some(element => element.isContentEditable || element.matches?.('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])'));
    if (typing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key.toLowerCase() === 's' && signalTrackViews(browser).some(view => view.track.selected)) {
      event.preventDefault();
      panelOpen = !panelOpen;
      sync();
    }
  }, true);
  close.addEventListener('click', () => { panelOpen = false; sync(); });
  sync();
  // Read fields when the action is invoked, preserving edits while selecting tracks.
  return {sync, range: () => ({min:min.value, max:max.value})};
}
