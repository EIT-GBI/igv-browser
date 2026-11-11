export function imageBasename(genome, loci) {
  const regions = (Array.isArray(loci) ? loci : [loci]).map(locus => String(locus)
    .replaceAll(',', '').replace(/:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/g,
      (_, start, end) => `_${Math.floor(Number(start))}-${Math.ceil(Number(end))}`));
  return `IGV-screenshot_${genome}_${regions.join('__')}`.replace(/[^\w.-]/g, '_');
}

export function dnaSequence(text) {
  const sequence = text.split(/\r?\n/).filter(line => !line.startsWith('>')).join('').replace(/\s/g, '').toUpperCase();
  if (!/^[ACGTN]+$/.test(sequence) || sequence.length < 20 || sequence.length > 8000) {
    throw new Error('Enter a DNA sequence of 20–8000 bases (A, C, G, T or N).');
  }
  return sequence;
}

export function parseTable(text, delimiter = '\t') {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value.length === 0) quoted = !quoted;
      else value += character;
    } else if (!quoted && (character === delimiter || character === '\n')) {
      row.push(value.replace(/\r$/, '')); value = '';
      if (character === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else value += character;
  }
  row.push(value.replace(/\r$/, ''));
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map((value, i) => i ? value : value.replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
}

export function canonicalGenome(id) {
  return ({hg38:'GRCh38', hg38_1kg:'GRCh38', GRCm38:'mm10', NCBI37:'mm9', WBcel235:'ce11', WS220:'ce10'})[id] || id;
}

export function encodeTrack(row) {
  const name = [row.Biosample, row.Target, row.AssayType, row.OutputType, row.Accession].filter(Boolean).join(' · ');
  const config = {name, url: new URL(row.HREF, 'https://www.encodeproject.org').href};
  const target = String(row.Target || '').toLowerCase();
  if (target.startsWith('h3k4')) config.color = 'rgb(0,150,0)';
  else if (target.startsWith('h3k27')) config.color = 'rgb(200,0,0)';
  else if (target === 'ctcf') config.color = 'black';
  if (row.Format?.toLowerCase() === 'bam') config.indexURL = config.url + '.bai';
  return {config, label: name, search: Object.values(row).join(' ').toLowerCase()};
}

export function flattenGroups(groups, prefix = '') {
  return groups.flatMap(group => {
    const label = [prefix, group.label || group.name].filter(Boolean).join(' / ');
    return [...(group.tracks || []).map(config => ({config, label: `${label} · ${config.name || config.id || config.url}`, search: JSON.stringify(config).toLowerCase()})),
      ...flattenGroups(group.children || [], label)];
  });
}

export function localFileConfigs(files) {
  const indexes = files.filter(file => /\.(bai|crai|tbi|csi|idx)$/i.test(file.name));
  return files.filter(file => !indexes.includes(file)).map(file => {
    const stem = file.name.replace(/\.(bam|cram)$/i, '');
    const index = indexes.find(index => index.name.startsWith(file.name + '.') || index.name.replace(/\.(bai|crai)$/i, '') === stem);
    if (/\.(bam|cram|vcf\.gz|bed\.gz)$/i.test(file.name) && !index) throw new Error(`Select the index together with ${file.name}.`);
    return {name:file.name, url:file, ...(index ? {indexURL:index} : {})};
  });
}
