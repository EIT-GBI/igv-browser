const sample = 'HAP-1_ENCSR895KTN';
const model = 'ENCODE-rE2G';
export const fadedColor = 'rgb(238,238,238)';
export const highlightedColor = '#FF0000';

export function e2gTrackRole(track) {
  const metadata = track.config?.metadata;
  if (metadata?.cellTypeID !== sample || metadata.model !== model) return;
  if (track.type === 'annotation' && metadata.trackType === 'Elements') return 'elements';
  if (track.type === 'interact' && metadata.trackType === 'E2G Predictions') return 'predictions';
}

function featureRecord(feature) { return feature?._f || feature?._ || feature; }

export function sameElement(a, b, chromosome = chr => String(chr).replace(/^chr/i, '').toLowerCase()) {
  a = featureRecord(a); b = featureRecord(b);
  return Boolean(a && b && Number.isFinite(a.start) && a.end > a.start && chromosome(a.chr) === chromosome(b.chr) && a.start === b.start && a.end === b.end);
}

export function predictionMatchesElement(prediction, element, chromosome) {
  const link = featureRecord(prediction);
  if (!link || !element) return false;
  // This dataset's first BEDPE anchor is the candidate element; its second is the target TSS.
  return sameElement({chr:link.chr1, start:link.start1, end:link.end1}, element, chromosome);
}

export function installE2GHighlighting(browser) {
  let selected, sourceTrack;
  const patched = new WeakSet();
  const chromosome = chr => browser.genome.getChromosomeName(chr);
  const views = () => browser.trackViews.filter(view => e2gTrackRole(view.track));
  const repaint = () => { for (const view of views()) view.repaintViews(); };

  function sync() {
    for (const view of views()) {
      const {track} = view;
      let needsRepaint = false;
      if (patched.has(track)) continue;
      patched.add(track);
      if (e2gTrackRole(track) === 'elements') {
        const color = track.getColorForFeature;
        track.getColorForFeature = function(feature) {
          if (!selected) return color.call(this, feature);
          return sameElement(feature, selected, chromosome) ? highlightedColor : fadedColor;
        };
      } else {
        if (!track.config.arcType) {
          track.arcType = track.config.arcType = 'partialInView';
          needsRepaint = true;
        }
        const color = track.getColor, draw = track.draw;
        track.getColor = function(feature, ...args) {
          return !selected || predictionMatchesElement(feature, selected, chromosome)
            ? color.call(this, feature, ...args) : fadedColor;
        };
        track.draw = function(options) {
          if (!selected || !options.features) return draw.call(this, options);
          const faint = [], highlighted = [];
          for (const feature of options.features) {
            (predictionMatchesElement(feature, selected, chromosome) ? highlighted : faint).push(feature);
          }
          // Paint selected links last so they stay visible where arcs cross.
          return draw.call(this, {...options, features:[...faint, ...highlighted]});
        };
      }
      if (selected || needsRepaint) view.repaintViews();
    }
  }

  browser.on('trackclick', (track, data, location, features) => {
    if (e2gTrackRole(track) !== 'elements') return;
    const candidates = (features || []).map(featureRecord);
    const feature = candidates.find(item => item.start <= location && location < item.end) || candidates[0];
    selected = sameElement(feature, selected, chromosome) ? undefined
      : feature && {chr:feature.chr, start:feature.start, end:feature.end};
    sourceTrack = selected ? track : undefined;
    repaint();
    return false; // Element clicks control highlighting without opening IGV's feature popup.
  });
  browser.on('trackorderchanged', sync);
  browser.on('trackremoved', track => {
    if (track === sourceTrack) { selected = sourceTrack = undefined; repaint(); }
  });
  browser.on('genomechange', () => { selected = sourceTrack = undefined; sync(); repaint(); });
  sync();
}
