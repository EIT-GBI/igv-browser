export function featureRegion(feature, fallbackChr) {
  feature = feature?._f || feature?._ || feature;
  if (!feature) return;
  const start = feature.start;
  const end = feature.end ?? (start + (feature.lengthOnRef || 1));
  const chr = feature.chr || feature.chromosome || fallbackChr;
  if (!chr || !Number.isFinite(start) || !Number.isFinite(end) || end <= 0 || end <= start) return;
  return {chr, start:Math.max(0, Math.floor(start)), end:Math.ceil(end)};
}

export async function zoomToRegion(browser, region, frame) {
  const chr = browser.genome.getChromosomeName(region.chr);
  if (frame && browser.referenceFrameList.includes(frame) && browser.genome.getChromosomeName(frame.chr) === chr) {
    const width = browser.calculateViewportWidth(browser.referenceFrameList.length);
    const factor = (region.end - region.start) / (frame.bpPerPixel * width);
    await browser.zoomWithScaleFactor(factor, (region.start + region.end) / 2, frame);
  } else {
    const locus = `${chr}:${region.start + 1}-${region.end}`;
    const index = browser.referenceFrameList.indexOf(frame);
    const loci = browser.referenceFrameList.map(reference => reference.getLocusString());
    if (index >= 0) { loci[index] = locus; await browser.search(loci); }
    else await browser.search(locus);
  }
}

export function installRegionZoom(browser, onError = console.error) {
  const patched = new WeakSet();
  const patchedMenus = new WeakSet();
  const item = (region, frame) => ({label:'Zoom in', click:() => zoomToRegion(browser, region, frame).catch(onError)});

  function frameForEvent(event) {
    const path = event?.composedPath?.() || [];
    return browser.trackViews.flatMap(view => view.viewports || [])
      .find(viewport => path.includes(viewport.viewportElement.parentElement))?.referenceFrame;
  }

  function sync() {
    for (const {track} of browser.trackViews) {
      if (!track || patched.has(track)) continue;
      patched.add(track);
      const original = track.contextMenuItemList;
      track.contextMenuItemList = function(clickState) {
        const items = original?.call(this, clickState) || [];
        const features = this.clickedFeatures?.(clickState) || [];
        const regions = features.map(feature => featureRegion(feature, clickState.referenceFrame.chr)).filter(Boolean);
        const region = regions.find(region => region.start <= clickState.genomicLocation && clickState.genomicLocation < region.end) || regions[0];
        return region ? [item(region, clickState.referenceFrame), ...items] : items;
      };
    }
    const menu = browser.roiManager?.roiMenu;
    if (menu && !patchedMenus.has(menu)) {
      patchedMenus.add(menu);
      const original = menu.menuItems;
      menu.menuItems = function(feature, roiSet, event, ...args) {
        const items = original.call(this, feature, roiSet, event, ...args);
        const region = featureRegion(feature);
        return region ? [item(region, frameForEvent(event)), ...items] : items;
      };
    }
  }

  for (const event of ['trackorderchanged', 'genomechange']) browser.on(event, sync);
  sync();
}
