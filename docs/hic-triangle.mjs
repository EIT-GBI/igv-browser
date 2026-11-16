// Triangular contact maps reuse IGV 3.8.10's range reader and normalization vectors.
export function isHicTrack(track) {
  return track?._hic === true || track?.config?.format === 'hic';
}

export function hicResolution(resolutions, bpPerPixel) {
  const sorted = [...resolutions].sort((a,b) => a-b);
  return sorted.find(size => size >= bpPerPixel) || sorted.at(-1);
}

function updateResolutionLabels(track) {
  const resolutions = track.featureSource.hicFile.bpResolutions;
  if (!resolutions?.length) return;
  for (const viewport of track.trackView.viewports || []) {
    const label = viewport.trackLabelElement;
    if (!label || !viewport.referenceFrame) continue;
    const size = hicResolution(resolutions, viewport.referenceFrame.bpPerPixel);
    let badge = label.querySelector('.hic-resolution');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'hic-resolution';
      badge.style.cssText = 'margin-left:6px;font-size:10px;color:#555';
      label.appendChild(badge);
    }
    badge.textContent = size >= 1000 ? `${size/1000} kb bins` : `${size} bp bins`;
    badge.title = 'Hi-C matrix bin size; automatically follows genomic zoom.';
  }
}

export async function matrixFeatures(source, {chr, start, end, bpPerPixel, normalization}) {
  const file = source.hicFile;
  if (!file.initialized) await file.init();
  const size = hicResolution(file.bpResolutions, bpPerPixel);
  const records = await source.getRecords(chr, start, end, size);
  let vector, offset;
  if (normalization && normalization !== 'NONE') {
    const nv = await source.getNormalizationVector(normalization, chr, size);
    offset = Math.floor(start / size);
    vector = await nv.getValues(offset, Math.ceil(end / size));
  }
  const chromosome = source.genome.getChromosomeName(chr), features = [];
  for (const record of records) {
    const lo = Math.min(record.bin1, record.bin2), hi = Math.max(record.bin1, record.bin2);
    let value = record.counts;
    if (vector) {
      const divisor = vector[lo-offset] * vector[hi-offset];
      if (!(divisor > 0) || !Number.isFinite(divisor)) continue;
      value /= divisor;
    }
    if (!(value > 0) || !Number.isFinite(value)) continue;
    features.push({chr:chromosome, chr1:chromosome, chr2:chromosome,
      start:lo*size, end:(hi+1)*size, start1:lo*size, end1:(lo+1)*size,
      start2:hi*size, end2:(hi+1)*size, value, binSize:size});
  }
  return features.sort((a,b) => a.start-b.start);
}

export function triangleCell(feature, bpStart, bpPerPixel, height) {
  const project = (a,b) => [(a+b)/2/bpPerPixel - bpStart/bpPerPixel, height-(b-a)/2/bpPerPixel];
  return [project(feature.start1,feature.start2), project(feature.end1,feature.start2),
    project(feature.end1,feature.end2), project(feature.start1,feature.end2)];
}

export function triangleHits(state, height) {
  const distance = (height-state.canvasY) * state.referenceFrame.bpPerPixel;
  const first = state.genomicLocation-distance, second = state.genomicLocation+distance;
  return (state.viewport.cachedFeatures || []).filter(f =>
    first >= f.start1 && first < f.end1 && second >= f.start2 && second < f.end2);
}

function drawTriangle(options) {
  const {context:ctx, bpStart, bpPerPixel, pixelWidth, pixelHeight} = options;
  const features = options.features || [];
  const end = bpStart + pixelWidth*bpPerPixel;
  const visible = features.filter(f => f.end2 >= bpStart && f.start1 <= end &&
    (f.start2-f.end1)/2/bpPerPixel <= pixelHeight);
  const values = visible.map(f=>f.value).sort((a,b)=>a-b);
  // A robust linear colour scale keeps a few very strong diagonal bins from hiding domains.
  const ceiling = values[Math.floor((values.length-1)*0.95)] || 1;
  ctx.save();
  ctx.fillStyle = 'white'; ctx.fillRect(0,0,pixelWidth,pixelHeight);
  ctx.beginPath(); ctx.rect(0,0,pixelWidth,pixelHeight); ctx.clip();
  for (const feature of visible) {
    const points = triangleCell(feature,bpStart,bpPerPixel,pixelHeight);
    ctx.fillStyle = `rgb(255,${Math.round(255*(1-Math.min(1,feature.value/ceiling)))},${Math.round(255*(1-Math.min(1,feature.value/ceiling)))})`;
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function installHicTriangle(browser, {row, onError = console.error} = {}) {
  const patched = new WeakSet();
  const refresh = track => {
    track.trackView.clearCachedFeatures();
    Promise.resolve(track.trackView.updateViews()).catch(onError);
  };
  function sync() {
    const tracks = browser.trackViews.map(view=>view.track).filter(isHicTrack);
    if (row) row.hidden = tracks.length === 0;
    for (const track of tracks) {
      if (patched.has(track)) continue;
      patched.add(track);
      track.config.hicDisplay = 'triangle';
      if (track.config.height === undefined) {
        track.height = 350;
        track.trackView.setTrackHeight(350);
      }
      const source = track.featureSource;
      source.getFeatures = function(options) {
        return matrixFeatures(this,options);
      };
      const menu = track.menuItemList;
      track.draw = function(options) {
        updateResolutionLabels(this);
        return drawTriangle(options);
      };
      track.clickedFeatures = function(state) {
        return triangleHits(state,this.height);
      };
      track.paintAxis = function(ctx,width,height) {
        ctx.fillStyle='white'; ctx.fillRect(0,0,width,height);
      };
      track.menuItemList = function() {
        const items = menu.call(this);
        const normalization = items.indexOf('<b>Normalization</b>');
        return normalization >= 0 ? items.slice(normalization) : [];
      };
      refresh(track);
    }
  }
  for (const event of ['trackorderchanged','trackremoved','genomechange']) browser.on(event,sync);
  sync();
}
