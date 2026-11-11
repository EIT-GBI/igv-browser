import igv from 'https://cdn.jsdelivr.net/npm/igv@3.8.10/dist/igv.esm.min.js';
import {initializeLocalTracks} from './local-tracks.js';
import {installGroupScaling, scaleSelectedTracks} from './group-scaling.mjs?v=fe8d95d';
import {installAnnotationSeamFix} from './annotation-seams.mjs';
import {installWheelZoom} from './wheel-zoom.mjs';
import {imageBasename, dnaSequence, parseTable, canonicalGenome, encodeTrack, flattenGroups, localFileConfigs} from './widget-utils.mjs';

const $ = id => document.getElementById(id);
const upstream = 'https://raw.githubusercontent.com/igvteam/igv-webapp/master/';
const genomeRegistryURL = 'https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/genomes/web/genomes.json';
let scaling;
let browser, genomes = [], registry = {}, sessionRegistry = [], catalogue = [], filtered = [], page = 0;
let catalogueRevision = 0, selected = new Set(), imageNameEdited = false;
const cache = new Map();
const pageSize = 100;
const message = text => { $('status').textContent = text; };

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${new URL(url, location.href).pathname}`);
  return response.json();
}
async function run(action) {
  $('widgets').disabled = true;
  try { await action(); }
  catch (error) { console.error(error); message(error.message || String(error)); }
  finally { $('widgets').disabled = !browser; }
}
function action(id, handler, event = 'click') { $(id).addEventListener(event, () => run(handler)); }
function option(value, text) { const item = new Option(text, value); return item; }
function readRecentSessions() { try { return JSON.parse(localStorage.getItem('igv-sessions') || '[]'); } catch { return []; } }
function sessionOptions() {
  const recent = readRecentSessions();
  sessionRegistry = [...(window.labSessions || []), ...recent];
  $('session-list').replaceChildren(...sessionRegistry.map((session, i) => option(String(i), session.label)));
  $('load-saved').disabled = !sessionRegistry.length;
}
function rememberSession(session) {
  const recent = readRecentSessions().filter(item => item.label !== session.label);
  try { localStorage.setItem('igv-sessions', JSON.stringify([session, ...recent].slice(0, 10))); }
  catch { message('Session loaded. Browser storage is full or unavailable.'); }
  sessionOptions();
}
function syncGenome() {
  const id = browser.genome.id;
  if (![...$('genome').options].some(item => item.value === id)) $('genome').add(option(id, browser.genome.name || id));
  $('genome').value = id;
  updateImageName();
  populateTrackSources();
}
function updateImageName() {
  if (browser && !imageNameEdited) $('image-name').value = imageBasename(browser.genome.id, browser.currentLoci());
}
function imageFilename(extension) {
  const base = $('image-name').value.trim() || imageBasename(browser.genome.id, browser.currentLoci());
  return base.replace(/\.(png|svg)$/i, '').replace(/[\\/:*?"<>|]/g, '_') + '.' + extension;
}
function download(filename, contents) {
  const url = URL.createObjectURL(contents instanceof Blob ? contents : new Blob([contents], {type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function savePNG() {
  const source = URL.createObjectURL(new Blob([browser.toSVG()], {type:'image/svg+xml'}));
  try {
    const image = new Image(); image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas'), scale = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(image.naturalWidth * scale); canvas.height = Math.ceil(image.naturalHeight * scale);
    const context = canvas.getContext('2d'); context.scale(scale,scale); context.drawImage(image,0,0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('PNG rendering failed.');
    download(imageFilename('png'),blob); message('PNG image saved.');
  } finally { URL.revokeObjectURL(source); }
}

async function loadSession(record) {
  message('Loading session…');
  if (record.config) await browser.loadSessionObject(record.config);
  else await browser.loadSession({url:record.url});
  rememberSession(record);
  syncGenome();
  message(`Session loaded · ${record.label}. Local tracks can be reloaded from your ~/igv folder.`);
}

function sourceButton(label, source, genomeID) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => run(async () => {
    if (browser.genome.id !== genomeID) return;
    for (const item of $('track-sources').children) item.setAttribute('aria-pressed', String(item === button));
    const revision = ++catalogueRevision;
    message(`Loading ${label}…`);
    const key = JSON.stringify([genomeID, source]);
    if (!cache.has(key)) cache.set(key, readCatalogue(source, genomeID).catch(error => { cache.delete(key); throw error; }));
    const entries = await cache.get(key);
    if (revision !== catalogueRevision || browser.genome.id !== genomeID) return;
    catalogue = entries; selected.clear(); page = 0;
    $('catalogue-title').textContent = label; $('track-search').value = ''; $('catalogue').hidden = false;
    filterTracks(); message(`${label} · ${entries.length.toLocaleString()} tracks available.`);
  }));
  $('track-sources').appendChild(button);
}
function populateTrackSources() {
  catalogueRevision++;
  $('track-sources').replaceChildren(); $('catalogue').hidden = true;
  const id = browser.genome.id, canonical = canonicalGenome(id);
  if (['GRCh38','GRCh39','hg19','mm9','mm10','hs1','T2T-CHM13','ce10','ce11','dm3','dm6'].includes(canonical)) {
    for (const [label, type] of [['ENCODE Signals · ChIP','signals.chip'],['ENCODE Signals · Other','signals.other'],['ENCODE Other','other'],['ENCODE Hi-C','hic']]) {
      if (type === 'hic' && !id.startsWith('hg') && !id.startsWith('mm')) continue;
      sourceButton(label, {encode:`https://raw.githubusercontent.com/igvteam/igv-data/refs/heads/main/data/encode/${canonical}.${type}.txt`}, id);
    }
  }
  const paths = [...new Set([...(registry[id] || []), ...(browser.genome.getHubURLs?.() || [])])].filter(path => path !== '---');
  for (const path of paths) {
    const labels = [['gtexAnalysis','GTEx tracks'],['snp/population','dbSNP population frequencies'],['dbvar','dbVar'],['FunctionalElements','RefSeq functional elements'],['_gtex.json','GTEx single-tissue eQTLs'],['_4dn.json','4DN tracks'],['_1KG','1000 Genomes alignments']];
    const label = labels.find(([key]) => path.toLowerCase().includes(key.toLowerCase()))?.[1] || 'Genome annotation hub';
    sourceButton(label, {url:new URL(path, upstream).href}, id);
  }
}
async function readCatalogue(source, genomeID) {
  if (source.encode) {
    const response = await fetch(source.encode);
    if (!response.ok) throw new Error(`ENCODE catalogue failed (${response.status}).`);
    return parseTable(await response.text()).map(encodeTrack);
  }
  if (!source.url.endsWith('.json')) {
    const hub = await igv.loadHub(source.url);
    return flattenGroups(await hub.getGroupedTrackConfigurations(genomeID));
  }
  const config = await json(source.url);
  if (config.type === 'custom-data-modal') {
    let rows = config.data;
    if (typeof rows === 'string') {
      const response = await fetch(new URL(rows, source.url));
      if (!response.ok) throw new Error(`Track collection failed (${response.status}).`);
      rows = parseTable(await response.text(), config.delimiter || '\t');
    }
    return rows.map(row => ({config:{...row, name:row.name || row.Description || row.Dataset || row.Accession}, label:(config.columns || Object.keys(row)).map(key => row[key]).filter(Boolean).join(' · '), search:Object.values(row).join(' ').toLowerCase()}));
  }
  return flattenGroups(config.groups || [{label:config.label,tracks:config.tracks || []}]);
}
function filterTracks() {
  const terms = $('track-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  filtered = catalogue.map((entry,index) => ({...entry,index})).filter(entry => terms.every(term => (entry.label.toLowerCase() + ' ' + entry.search).includes(term)));
  page = 0; renderTracks();
}
function renderTracks() {
  const start = page * pageSize, current = filtered.slice(start, start + pageSize);
  $('track-results').replaceChildren(...current.map(entry => { const item = option(String(entry.index), entry.label); item.selected = selected.has(entry.index); return item; }));
  $('track-count').textContent = `${filtered.length ? start + 1 : 0}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length.toLocaleString()}`;
  $('previous-tracks').disabled = page === 0; $('next-tracks').disabled = start + pageSize >= filtered.length;
}

async function loadScript(url) {
  if (document.querySelector(`script[src="${url}"]`)) return;
  await new Promise((resolve,reject) => { const script = document.createElement('script'); script.src = url; script.onload = resolve; script.onerror = () => {script.remove(); reject(new Error('Circular View dependency failed to load.'));}; document.head.appendChild(script); });
}
async function circularView() {
  if (!browser.circularView) {
    message('Loading Circular View…');
    await loadScript('https://cdn.jsdelivr.net/npm/react@16.14.0/umd/react.production.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/react-dom@16.14.0/umd/react-dom.production.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@jbrowse/react-circular-genome-view@1.6.9/dist/react-circular-genome-view.umd.production.min.js');
    browser.createCircularView($('circular'), false);
    browser.circularView.setSize(Number($('circular-size').value));
  }
  browser.circularViewVisible = $('circular-toggle').checked;
  message(browser.circularViewVisible ? 'Circular View shown. Use supported tracks’ chord actions to display interactions.' : 'Circular View hidden.');
}

async function start() {
  const defaults = await json('tracks.json');
  // Load the same official registry used by IGV, through its official GitHub mirror.
  try { genomes = await json(genomeRegistryURL); }
  catch { genomes = [{id:'hg38',name:'Human (GRCh38/hg38)'},{id:'hg19',name:'Human (GRCh37/hg19)'},{id:'hs1',name:'Human (T2T/hs1)'},{id:'galGal6',name:'Chicken (galGal6)'}]; }
  const priority = ['hg38','hg38_1kg','hs1','hg19','hg18'];
  genomes.sort((a,b) => { const ai=priority.indexOf(a.id),bi=priority.indexOf(b.id); return (ai<0?100:ai)-(bi<0?100:bi) || a.name.localeCompare(b.name); });
  $('genome').replaceChildren(...genomes.map(genome => option(genome.id,genome.name.trim())));
  browser = await igv.createBrowser($('igv'), {genome:'hg38',locus:'chr17:7,661,779-7,687,550',genomes,queryParametersSupported:true,showSVGButton:false,tracks:defaults.filter(track => /^https?:/.test(track.url))});
  installWheelZoom($('igv'), browser, error => message(error.message || String(error)));
  installAnnotationSeamFix(browser);
  scaling = installGroupScaling(browser, {row:$('scale-section'), count:$('scale-count'), auto:$('scale-auto'), apply:$('scale-apply'), clear:$('scale-clear'), close:$('scale-close'), min:$('scale-min'), max:$('scale-max')});
  const resources = await Promise.allSettled([json(upstream+'resources/tracks/trackRegistry.json'),json('sessions.json')]);
  if (resources[0].status === 'fulfilled') registry = resources[0].value;
  else message('Track registry is unavailable. ENCODE and track URL loading remain available.');
  window.labSessions = resources[1].status === 'fulfilled' ? resources[1].value.sessions : [];
  sessionOptions();
  browser.on('genomechange', syncGenome); browser.on('locuschange', updateImageName);
  syncGenome();
  const hasSession = ['sessionURL','session','hubURL'].some(key => new URLSearchParams(location.search).has(key));
  await initializeLocalTracks(browser, defaults, !hasSession && browser.genome.id === 'hg38');
  $('widgets').disabled = false;
}

action('genome', async () => { message('Loading genome…'); await browser.loadGenome(genomes.find(item => item.id === $('genome').value) || $('genome').value); syncGenome(); message(`Genome loaded · ${browser.genome.name || browser.genome.id}.`); }, 'change');
action('load-saved', () => loadSession(sessionRegistry[Number($('session-list').value)]));
action('load-session-url', async () => { const url = new URL($('session-url').value.trim()); if (!['https:','http:'].includes(url.protocol)) throw new Error('Enter an HTTP(S) session URL.'); await loadSession({label:url.pathname.split('/').at(-1) || url.hostname,url:url.href}); });
action('session-file', async () => { const file=$('session-file').files[0]; if (!file) return; if (file.name.toLowerCase().endsWith('.json')) await loadSession({label:file.name,config:JSON.parse(await file.text())}); else { await browser.loadSession({url:file}); rememberSession({label:file.name,config:browser.toJSON()}); syncGenome(); message(`Session loaded · ${file.name}.`); } $('session-file').value=''; }, 'change');
action('save-session', () => { download(`IGV-session_${browser.genome.id}.json`,JSON.stringify(browser.toJSON(),null,2)); message('Session JSON saved.'); });
$('image-name').addEventListener('input', () => {imageNameEdited=true;});
action('save-png', savePNG);
action('save-svg', () => {browser.saveSVGtoFile(imageFilename('svg')); message('SVG image saved.');});
action('blat', async () => {const sequence=dnaSequence($('blat-sequence').value); message('Running BLAT…'); const before=browser.findTracks(track=>track.type==='blat').length; await browser.blat(sequence); const after=browser.findTracks(track=>track.type==='blat').length; message(after>before?'BLAT results loaded.':'BLAT search finished. Check IGV for its result or service error.');});
action('circular-toggle', circularView, 'change');
action('circular-size', () => {const size=Number($('circular-size').value); if(size<250||size>1600) throw new Error('Choose a Circular View size between 250 and 1600 pixels.'); browser.circularView?.setSize(size);}, 'change');
action('circular-clear', () => browser.circularView?.clearChords());
action('track-files', async () => {const files=[...$('track-files').files]; if(files.length){await browser.loadTrackList(localFileConfigs(files));message('Local tracks loaded.');$('track-files').value='';}}, 'change');
action('load-track-url', async () => {const url=new URL($('track-url').value.trim());if(!['http:','https:'].includes(url.protocol))throw new Error('Enter an HTTP(S) track URL.'); const config={url:url.href}; if($('track-index').value.trim())config.indexURL=new URL($('track-index').value.trim()).href; await browser.loadTrack(config);message('Track loaded.');});
$('track-search').addEventListener('input',filterTracks);
$('track-results').addEventListener('change',()=>{for(const item of $('track-results').options){if(item.selected)selected.add(Number(item.value));else selected.delete(Number(item.value));}});
$('previous-tracks').addEventListener('click',()=>{page--;renderTracks();});
$('next-tracks').addEventListener('click',()=>{page++;renderTracks();});
action('load-selected-tracks',async()=>{const configs=[...selected].map(index=>catalogue[index].config);if(!configs.length)throw new Error('Select at least one track.');message(`Loading ${configs.length} track(s)…`);const tracks=await browser.loadTrackList(configs); message(`Loaded ${tracks.filter(Boolean).length} of ${configs.length} selected track(s).`);});
action('scale-auto', async () => { const count=await scaleSelectedTracks(browser); scaling.sync(); message(`Group autoscale applied to ${count} signal track(s). The shared range updates with the view.`); });
action('scale-apply', async () => { const range=scaling.range(), count=await scaleSelectedTracks(browser,range); scaling.sync(); message(`Shared range ${range.min} to ${range.max} applied to ${count} signal track(s).`); });
run(start);
