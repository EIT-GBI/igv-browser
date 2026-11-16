// Triangular contact maps reuse IGV 3.8.10's range reader and normalization vectors.
export function isHicTrack(track) {
  return track?._hic === true || track?.config?.format === 'hic';
}

export function hicResolution(resolutions, bpPerPixel, binSize = 'auto') {
  const sorted = [...resolutions].sort((a,b) => a-b);
  if (Number.isFinite(binSize) && sorted.includes(binSize)) return binSize;
  return sorted.find(size => size >= bpPerPixel * 4) || sorted.at(-1);
}

function updateResolutionLabels(track) {
  const resolutions = track.featureSource.hicFile.bpResolutions;
  if (!resolutions?.length) return;
  for (const viewport of track.trackView.viewports || []) {
    const label = viewport.trackLabelElement;
    if (!label || !viewport.referenceFrame) continue;
    const size = hicResolution(resolutions, viewport.referenceFrame.bpPerPixel, track.config.hicBinSize);
    let badge = label.querySelector('.hic-resolution');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'hic-resolution';
      badge.style.cssText = 'margin-left:6px;font-size:10px;color:#555';
      label.appendChild(badge);
    }
    badge.textContent = size >= 1000 ? `${size/1000} kb bins` : `${size} bp bins`;
    badge.title = track.config.hicBinSize === 'auto' ? 'Hi-C matrix bin size; automatically follows genomic zoom.' : 'Fixed Hi-C matrix bin size; change it in the track settings menu.';
  }
}

export async function matrixFeatures(source, {chr, start, end, bpPerPixel, normalization, binSize}) {
  const file = source.hicFile;
  if (!file.initialized) await file.init();
  const size = hicResolution(file.bpResolutions, bpPerPixel, binSize);
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

// Keep recent normalized windows per track. Identical concurrent requests share one load.
export function createMatrixLoader(source, {maxEntries = 3, maxFeatures = 200000} = {}) {
  const cached = [], pending = new Map();
  return async function(options) {
    if (!source.hicFile.initialized) await source.hicFile.init();
    const binSize = hicResolution(source.hicFile.bpResolutions, options.bpPerPixel, options.binSize);
    const chr = source.genome.getChromosomeName(options.chr), normalization = options.normalization || 'NONE';
    const match = entry => entry.chr === chr && entry.binSize === binSize && entry.normalization === normalization;
    const index = cached.findIndex(entry => match(entry) && options.start >= entry.start && options.end <= entry.end);
    if (index >= 0) {
      const entry = cached.splice(index,1)[0]; cached.unshift(entry);
      return entry.features;
    }
    const key = JSON.stringify([chr,options.start,options.end,binSize,normalization]);
    if (pending.has(key)) return pending.get(key);
    const promise = matrixFeatures(source,{...options,binSize}).then(features => {
      if (features.length <= maxFeatures) {
        cached.unshift({chr,binSize,normalization,start:options.start,end:options.end,features});
        while (cached.length > maxEntries || cached.reduce((count,entry)=>count+entry.features.length,0) > maxFeatures) cached.pop();
      }
      return features;
    }).finally(()=>pending.delete(key));
    pending.set(key,promise);
    return promise;
  };
}

// Select the exact percentile in linear expected time, preserving feature order.
export function contactCeiling(features) {
  if (!features.length) return 1;
  const values = Float64Array.from(features, feature=>feature.value);
  const k = Math.floor((values.length-1)*0.95);
  let lo = 0, hi = values.length-1;
  while (lo < hi) {
    const pivot = values[(lo+hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (values[i] < pivot) i++;
      while (values[j] > pivot) j--;
      if (i <= j) { const value=values[i]; values[i]=values[j]; values[j]=value; i++; j--; }
    }
    if (k <= j) hi=j;
    else if (k >= i) lo=i;
    else break;
  }
  return values[k] || 1;
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
  // A robust linear colour scale keeps a few very strong diagonal bins from hiding domains.
  const ceiling = contactCeiling(visible);
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

function binSizeControl(track, refresh) {
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px';
  label.append('Bin size');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Hi-C bin size');
  const resolutions = [...track.featureSource.hicFile.bpResolutions].sort((a,b)=>a-b);
  for (const size of ['auto', ...resolutions]) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = size === 'auto' ? 'Automatic (zoom)' : size >= 1000000 ? `${size/1000000} Mb` : size >= 1000 ? `${size/1000} kb` : `${size} bp`;
    select.appendChild(option);
  }
  select.value = String(track.config.hicBinSize);
  select.addEventListener('click', event=>event.stopPropagation());
  select.addEventListener('change', () => {
    track.config.hicBinSize = select.value === 'auto' ? 'auto' : Number(select.value);
    refresh(track);
  });
  label.appendChild(select);
  return {element:label};
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
      if (!track.featureSource.hicFile.bpResolutions.includes(track.config.hicBinSize)) track.config.hicBinSize = 'auto';
      if (track.config.height === undefined) {
        track.height = 350;
        track.trackView.setTrackHeight(350);
      }
      const source = track.featureSource, loadMatrix = createMatrixLoader(source);
      source.getFeatures = function(options) {
        return loadMatrix({...options,binSize:track.config.hicBinSize});
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
        return [binSizeControl(this,refresh), ...(normalization >= 0 ? items.slice(normalization) : [])];
      };
      refresh(track);
    }
  }
  for (const event of ['trackorderchanged','trackremoved','genomechange']) browser.on(event,sync);
  sync();
}
