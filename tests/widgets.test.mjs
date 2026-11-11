import test from 'node:test';
import assert from 'node:assert/strict';
import {imageBasename, dnaSequence, parseTable, canonicalGenome, encodeTrack, flattenGroups, localFileConfigs} from '../docs/widget-utils.mjs';

test('image names retain assembly and genomic coordinates', () => {
  assert.equal(imageBasename('hg38','chr11:1,234-5,678'),'IGV-screenshot_hg38_chr11_1234-5678');
  assert.equal(imageBasename('hg19',['chr1:1.5-20.5','chr2:30-50']),'IGV-screenshot_hg19_chr1_1-21__chr2_30-50');
});
test('BLAT accepts FASTA and validates sequence alphabet and length', () => {
  assert.equal(dnaSequence('>TP53\nacgtacgtacgtacgtacgt\n'),'ACGTACGTACGTACGTACGT');
  assert.throws(()=>dnaSequence('ACTG'),/20–8000/);
  assert.throws(()=>dnaSequence('X'.repeat(20)),/DNA/);
});
test('catalogue parsing preserves quoted tabs, quotes, and empty values', () => {
  assert.deepEqual(parseTable('\uFEFFname\turl\tnote\r\n"a\tb"\thttps://example.test/a.bw\t"a ""quote"""\r\nc\tfile\t'),[
    {name:'a\tb',url:'https://example.test/a.bw',note:'a "quote"'}, {name:'c',url:'file',note:''}
  ]);
});
test('ENCODE entries preserve metadata and resolve file endpoints', () => {
  assert.equal(canonicalGenome('hg38_1kg'),'GRCh38');
  const entry=encodeTrack({Biosample:'HAP1',Target:'H3K27ac',AssayType:'ChIP-seq',HREF:'/files/ENCFF1/@@download/ENCFF1.bigWig',Accession:'ENCFF1'});
  assert.equal(entry.config.url,'https://www.encodeproject.org/files/ENCFF1/@@download/ENCFF1.bigWig');
  assert.equal(entry.config.color,'rgb(200,0,0)');
  assert.match(entry.search,/hap1/);
});
test('nested track hubs retain every leaf track configuration', () => {
  const entries=flattenGroups([{label:'GTEx',children:[{label:'RNA',tracks:[{name:'Liver',url:'https://example.test/liver.bw'}]}]}]);
  assert.equal(entries.length,1);assert.equal(entries[0].label,'GTEx / RNA · Liver');
});
test('local track loading associates explicit indexes and validates required ones', () => {
  const bam={name:'sample.bam'},index={name:'sample.bai'},bw={name:'sample.bw'};
  assert.equal(localFileConfigs([bam,index])[0].indexURL,index);
  assert.equal(localFileConfigs([bw])[0].url,bw);
  assert.throws(()=>localFileConfigs([bam]),/Select the index/);
});
