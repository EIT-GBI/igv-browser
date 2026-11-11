// Shared interval-rendering fix from pyp/igv.py in the Parts apps.
export function suppressInlineAnnotationSeams(track) {
  if (track?.type !== 'annotation' || !Array.isArray(track.config?.features) || track.__seamlessAnnotations) return false;
  track.__seamlessAnnotations = true;
  track.draw = function(options) {
    const {context, bpStart, bpPerPixel, pixelWidth, pixelHeight} = options;
    const rightEdge = bpStart + pixelWidth * bpPerPixel + 1;
    const rowHeight = this.displayMode === 'SQUISHED' ? this.squishedRowHeight : this.expandedRowHeight;
    const requestedHeight = Number(this.config.featureHeight);
    const featureHeight = Math.min(Number.isFinite(requestedHeight) ? requestedHeight : 6, rowHeight);
    context.save();
    context.fillStyle = 'rgb(255, 255, 255)';
    context.fillRect(0, options.pixelTop || 0, pixelWidth, pixelHeight);
    for (const feature of options.features || []) {
      if (feature.end < bpStart || feature.start > rightEdge) continue;
      const row = this.displayMode === 'COLLAPSED' ? 0 : (feature.row || 0);
      const top = this.margin + rowHeight * row + (rowHeight - featureHeight) / 2;
      const left = Math.max(0, Math.floor((feature.start - bpStart) / bpPerPixel));
      const right = Math.min(pixelWidth, Math.ceil((feature.end - bpStart) / bpPerPixel));
      if (right <= left) continue;
      context.fillStyle = this.getColorForFeature(feature);
      context.fillRect(left, top, right - left, featureHeight);
    }
    context.restore();
  };
  track.trackView?.repaintViews();
  return true;
}

export function installAnnotationSeamFix(browser) {
  const apply = () => { for (const {track} of browser.trackViews) suppressInlineAnnotationSeams(track); };
  browser.on('trackorderchanged', apply);
  apply();
}
