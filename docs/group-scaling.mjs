// Use IGV's quantitative track state so scaling survives session exports.
export function signalTrackViews(browser) {
  return browser.trackViews.filter(view => view.track?.type === 'wig' && !view.track.disposed);
}

export async function scaleSelectedTracks(browser, range) {
  const views = signalTrackViews(browser).filter(view => view.track.selected);
  if (!views.length) throw new Error('Select signal tracks by clicking their names.');
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

export function installGroupScaling(browser, controls) {
  const {row, count, auto, apply, clear, min, max} = controls;
  const root = browser.root;
  const style = root.ownerDocument.createElement('style');
  style.textContent = `
    .igv-track-label[data-scale-select] { cursor: pointer; }
    .igv-track-label[data-scale-select]:focus-visible { outline: 2px solid #2467a0; }
    .igv-track-label[data-scale-select][aria-pressed=true] { background: #dceafa; color: #123f68; }
    .igv-viewport[data-scale-selected=true] { outline: 2px solid #477b9c; outline-offset: -2px; }
  `;
  root.appendChild(style);

  function sync() {
    const views = signalTrackViews(browser);
    const chosen = views.filter(view => view.track.selected);
    row.hidden = views.length === 0;
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
        label.dataset.scaleSelect = '';
        label.setAttribute('role', 'button');
        label.setAttribute('tabindex', '0');
        label.setAttribute('aria-pressed', String(selected));
        label.title = `${view.track.name} · click to select for group scaling`;
      }
    }
  }
  function labelView(event) {
    const path = event.composedPath();
    return signalTrackViews(browser).find(view => view.viewports.some(viewport => path.includes(viewport.trackLabelElement)));
  }
  function select(event) {
    const view = labelView(event);
    if (!view) return;
    if (event.type === 'keydown' && ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    view.track.selected = !view.track.selected;
    sync();
  }
  root.addEventListener('click', event => {
    select(event);
    // IGV's native selection toggle can also clear track selection.
    queueMicrotask(sync);
  }, true);
  root.addEventListener('keydown', select, true);
  root.addEventListener('mousedown', event => { if (labelView(event)) event.stopPropagation(); }, true);
  root.addEventListener('change', () => queueMicrotask(sync), true);
  for (const event of ['trackorderchanged', 'trackremoved', 'genomechange', 'columnlayoutchange', 'locuschange']) browser.on(event, sync);
  clear.addEventListener('click', () => {
    for (const view of signalTrackViews(browser)) view.track.selected = false;
    sync();
  });
  sync();
  // Read fields when the action is invoked, preserving edits while selecting tracks.
  return {sync, range: () => ({min:min.value, max:max.value})};
}
