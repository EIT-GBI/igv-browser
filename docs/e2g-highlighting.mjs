const sample = 'HAP-1_ENCSR895KTN';
const model = 'ENCODE-rE2G';
export const fadedColor = 'rgb(238,238,238)';
export const highlightedColor = '#FF0000';
export const incomingColor = '#FF0000';
export const outgoingColor = '#FF8C00';
export const predictionHint = 'With an element selected:\nIncoming: red (enhancers → selected target gene).\nOutgoing: orange (selected enhancer → target genes).';

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

export function predictionDirection(prediction, element, chromosome = chr => String(chr).replace(/^chr/i, '').toLowerCase()) {
  const link = featureRecord(prediction);
  element = featureRecord(element);
  if (!link || !element || !Number.isFinite(element.start) || element.end <= element.start) return;
  const overlaps = end => {
    const start = link[`start${end}`], stop = link[`end${end}`];
    return Number.isFinite(start) && stop > start && chromosome(link[`chr${end}`]) === chromosome(element.chr)
      && start < element.end && stop > element.start;
  };
  // BEDPE stores the enhancer first and target TSS second. Self-links use incoming red.
  if (overlaps(2)) return 'incoming';
  if (overlaps(1)) return 'outgoing';
}

export function predictionMatchesElement(prediction, element, chromosome) {
  return Boolean(predictionDirection(prediction, element, chromosome));
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
      if (e2gTrackRole(track) === 'predictions') {
        for (const viewport of view.viewports || []) {
          viewport.viewportElement.title = predictionHint;
          if (viewport.trackLabelElement) viewport.trackLabelElement.title = `${track.name || 'E2G Predictions'}\n${predictionHint}`;
        }
      }
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
          if (!selected) return color.call(this, feature, ...args);
          const direction = predictionDirection(feature, selected, chromosome);
          return direction === 'incoming' ? incomingColor : direction === 'outgoing' ? outgoingColor : fadedColor;
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
  browser.on('locuschange', sync);
  browser.on('columnlayoutchange', () => queueMicrotask(sync));
  browser.on('trackremoved', track => {
    if (track === sourceTrack) { selected = sourceTrack = undefined; repaint(); }
  });
  browser.on('genomechange', () => { selected = sourceTrack = undefined; sync(); repaint(); });
  sync();
}
