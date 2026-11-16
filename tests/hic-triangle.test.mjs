import test from 'node:test';
import assert from 'node:assert/strict';
import {hicResolution,matrixFeatures,triangleCell,triangleHits,installHicTriangle,createMatrixLoader,contactCeiling} from '../docs/hic-triangle.mjs';

test('resolution follows zoom while bounding matrix density',()=>{
  assert.equal(hicResolution([10000,1000,5000],2000),10000);
  assert.equal(hicResolution([10000,1000,5000],100),1000);
  assert.equal(hicResolution([10000,1000],50000),10000);
  assert.equal(hicResolution([25000,10000,5000],4800),25000);
  assert.equal(hicResolution([5000,2000,1000,500],800),5000);
});
test('matrix retains diagonal and low-count contacts and applies normalization to both bins',async()=>{
  const source={hicFile:{initialized:true,bpResolutions:[10]},genome:{getChromosomeName:()=> 'chr1'},
    getRecords:async()=>[{bin1:0,bin2:0,counts:100},{bin1:0,bin2:1,counts:2},{bin1:1,bin2:2,counts:1}],
    getNormalizationVector:async()=>({getValues:async()=>[2,4,NaN]})};
  const options={chr:'1',start:0,end:30,bpPerPixel:2};
  const raw=await matrixFeatures(source,options);
  assert.equal(raw.length,3);assert.equal(raw[0].start1,raw[0].start2);assert.equal(raw[2].value,1);
  const normalized=await matrixFeatures(source,{...options,normalization:'KR'});
  assert.deepEqual(normalized.map(f=>f.value),[25,0.25]);
});
test('projection places bins at 45 degrees and picking recovers the two genomic anchors',()=>{
  const f={start1:100,end1:110,start2:140,end2:150};
  assert.deepEqual(triangleCell(f,100,1,100),[[20,80],[25,85],[30,80],[25,75]]);
  const state={canvasY:80,genomicLocation:125,referenceFrame:{bpPerPixel:1},viewport:{cachedFeatures:[f]}};
  assert.deepEqual(triangleHits(state,100),[f]);
  assert.deepEqual(triangleHits({...state,canvasY:20},100),[]);
});
test('Hi-C always uses triangles, including older sessions configured for arcs',async()=>{
  const events=new Map(),native=()=> {throw new Error('arc renderer called');};let refreshes=0;
  const source={hicFile:{initialized:true,bpResolutions:[10]},genome:{getChromosomeName:()=> 'chr1'},getRecords:async()=>[{bin1:0,bin2:1,counts:2}],getFeatures:native};
  const track={_hic:true,config:{height:200,hicDisplay:'arcs'},height:200,featureSource:source,draw:native,clickedFeatures:native,paintAxis:native,menuItemList:()=>['arc','<b>Normalization</b>','KR'],trackView:{clearCachedFeatures(){},updateViews(){refreshes++;}}};
  const annotation={config:{},draw:native},row={};
  const browser={trackViews:[{track},{track:annotation}],on(event,fn){events.set(event,fn);}};
  installHicTriangle(browser,{row});
  assert.equal(track.config.hicDisplay,'triangle');assert.equal(row.hidden,false);
  assert.equal(annotation.draw,native);assert.equal(track.config.hicBinSize,'auto');
  const features=await source.getFeatures({chr:'chr1',start:0,end:30,bpPerPixel:2});
  assert.equal(features[0].value,2);
  let cells=0;const ctx={save(){},restore(){},fillRect(){},beginPath(){},rect(){},clip(){},moveTo(){},lineTo(){},closePath(){},fill(){cells++;}};
  track.draw({context:ctx,bpStart:0,bpPerPixel:1,pixelWidth:30,pixelHeight:200,features});
  assert.equal(cells,1);
  assert.equal(track.clickedFeatures({canvasY:195,genomicLocation:10,referenceFrame:{bpPerPixel:1},viewport:{cachedFeatures:features}}).length,1);
  track.paintAxis(ctx,50,200);
  assert.equal(track.height,200);assert.equal(refreshes,1);
  browser.trackViews=[];events.get('trackremoved')();assert.equal(row.hidden,true);
});

test('manual bins remain fixed across zoom and unsupported sizes fall back to automatic',()=>{
  const resolutions=[1000,5000,10000,25000];
  assert.equal(hicResolution(resolutions,100,10000),10000);
  assert.equal(hicResolution(resolutions,10000,10000),10000);
  assert.equal(hicResolution(resolutions,4800,7777),25000);
});

test('track settings list file bin sizes, reload the matrix, and store the session choice',async()=>{
  const documentBefore=globalThis.document;
  globalThis.document={createElement(tag){return {tag,style:{},children:[],events:{},append(child){this.children.push(child);},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;}};}};
  try {
    let refreshes=0,requested;
    const source={hicFile:{initialized:true,bpResolutions:[25000,10000,5000]},genome:{getChromosomeName:x=>x},getRecords:async(chr,start,end,size)=>{requested=size;return [];}};
    const track={_hic:true,config:{height:200,hicBinSize:10000},featureSource:source,menuItemList:()=>['arc','<b>Normalization</b>','KR'],trackView:{clearCachedFeatures(){},updateViews(){refreshes++;}}};
    installHicTriangle({trackViews:[{track}],on(){}});
    assert.equal(track.config.hicBinSize,10000);
    const menu=track.menuItemList(),select=menu[0].element.children[1];
    assert.deepEqual(menu.slice(1),['<b>Normalization</b>','KR']);
    assert.deepEqual(select.children.map(option=>option.value),['auto','5000','10000','25000']);
    assert.equal(select.value,'10000');
    select.value='5000';select.events.change();
    assert.equal(track.config.hicBinSize,5000);assert.equal(refreshes,2);
    await source.getFeatures({chr:'chr17',start:0,end:100000,bpPerPixel:10000});
    assert.equal(requested,5000);
    select.value='auto';select.events.change();
    await source.getFeatures({chr:'chr17',start:0,end:100000,bpPerPixel:4800});
    assert.equal(track.config.hicBinSize,'auto');assert.equal(requested,25000);
  } finally {globalThis.document=documentBefore;}
});

test('recent matrices reuse normalized windows and deduplicate concurrent loads',async()=>{
  let reads=0;
  const source={hicFile:{initialized:true,bpResolutions:[10,20]},genome:{getChromosomeName:()=> 'chr1'},
    async getRecords(){reads++;await Promise.resolve();return [{bin1:0,bin2:1,counts:8}];},
    getNormalizationVector:async()=>({getValues:async()=>[2,2,2,2]})};
  const load=createMatrixLoader(source),options={chr:'chr1',start:0,end:40,bpPerPixel:1};
  const [a,b]=await Promise.all([load(options),load(options)]);
  assert.equal(reads,1);assert.equal(a,b);
  assert.equal(await load({...options,start:10,end:30}),a);assert.equal(reads,1);
  const normalized=await load({...options,normalization:'KR'});
  assert.equal(normalized[0].value,2);assert.equal(reads,2);
  await load({...options,binSize:20});assert.equal(reads,3);
  assert.equal(await load(options),a);assert.equal(reads,3);
});
test('matrix cache bounds memory and retries failed loads',async()=>{
  let reads=0;
  const source={hicFile:{initialized:true,bpResolutions:[10]},genome:{getChromosomeName:x=>x},
    async getRecords(){reads++;if(reads===1)throw new Error('temporary');return [{bin1:0,bin2:1,counts:8}];}};
  const load=createMatrixLoader(source,{maxEntries:2,maxFeatures:2}),o={chr:'chr1',start:0,end:40,bpPerPixel:1};
  await assert.rejects(load(o),/temporary/);await load(o);assert.equal(reads,2);
  await load({...o,chr:'chr2'});await load({...o,chr:'chr3'});await load(o);assert.equal(reads,5);
  const uncached=createMatrixLoader(source,{maxFeatures:0});
  await uncached(o);await uncached(o);assert.equal(reads,7);
});
test('linear-time colour percentile matches sorting while preserving original bins',()=>{
  for (const values of [[],[9],Array(100).fill(3),Array.from({length:1001},(_,i)=>(i*7919)%101)]) {
    const features=values.map(value=>Object.freeze({value}));
    const sorted=[...values].sort((a,b)=>a-b);
    assert.equal(contactCeiling(features),sorted[Math.floor((values.length-1)*0.95)] || 1);
    assert.deepEqual(features.map(f=>f.value),values);
  }
});
