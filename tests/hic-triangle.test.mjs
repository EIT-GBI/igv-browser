import test from 'node:test';
import assert from 'node:assert/strict';
import {hicResolution,matrixFeatures,triangleCell,triangleHits,installHicTriangle} from '../docs/hic-triangle.mjs';

test('resolution follows zoom while bounding matrix density',()=>{
  assert.equal(hicResolution([10000,1000,5000],2000),5000);
  assert.equal(hicResolution([10000,1000,5000],100),1000);
  assert.equal(hicResolution([10000,1000],50000),10000);
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
test('Hi-C defaults and view switching preserve native arcs and session state',async()=>{
  const events=new Map(),native=()=> 'native';let refreshes=0,handler;
  const track={_hic:true,config:{height:200},height:200,featureSource:{getFeatures:native},draw:native,clickedFeatures:native,paintAxis:native,menuItemList:()=>['arc','<b>Normalization</b>','KR'],trackView:{clearCachedFeatures(){},updateViews(){refreshes++;}}};
  const annotation={config:{},draw:native};
  const select={addEventListener(event,fn){handler=fn;}},row={};
  const browser={trackViews:[{track},{track:annotation}],on(event,fn){events.set(event,fn);}};
  installHicTriangle(browser,{row,select});
  assert.equal(track.config.hicDisplay,'triangle');assert.equal(row.hidden,false);
  assert.equal(annotation.draw,native);assert.deepEqual(track.menuItemList(),['<b>Normalization</b>','KR']);
  select.value='arcs';handler();
  assert.equal(track.config.hicDisplay,'arcs');assert.equal(track.draw({}),'native');
  assert.equal(await track.featureSource.getFeatures({}),'native');
  assert.equal(track.height,200);assert.equal(refreshes,2);
  browser.trackViews=[];events.get('trackremoved')();assert.equal(row.hidden,true);
});
