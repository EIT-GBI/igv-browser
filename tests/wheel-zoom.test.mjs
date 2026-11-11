import test from 'node:test';
import assert from 'node:assert/strict';
import {installWheelZoom} from '../docs/wheel-zoom.mjs';

function fixture(t, count = 1) {
  t.mock.timers.enable({apis:['setTimeout']});
  const frames = Array.from({length:count}, (_, i) => ({chr:`chr${i+1}`,start:1000,bpPerPixel:2,getChromosome:()=>({bpLength:10000})}));
  const elements = frames.map(() => ({getBoundingClientRect:()=>({left:100,width:500,height:100})}));
  let listener, options;
  const calls = [];
  const container = {addEventListener(type,fn,opts){listener=fn;options=opts;},removeEventListener(){listener=undefined;}};
  const browser = {config:{},referenceFrameList:frames,trackViews:[{viewports:elements.map((viewportElement,i)=>({viewportElement,referenceFrame:frames[i]}))}],calculateViewportWidth:()=>500,minimumBases:()=>40,zoomWithScaleFactor:(...args)=>{calls.push(args);}};
  const dispose = installWheelZoom(container,browser);
  function wheel(overrides={}) {
    const event = {deltaY:-100,deltaX:0,deltaMode:0,clientX:225,composedPath:()=>[elements[0]],preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...overrides};
    listener(event); return event;
  }
  return {browser,frames,elements,calls,wheel,dispose,options};
}

test('wheel zoom crosses the shadow boundary and preserves the genomic pointer anchor',t=>{
  const f=fixture(t);const event=f.wheel({target:{id:'igv'}});t.mock.timers.tick(50);
  assert.equal(event.prevented,true);assert.equal(f.options.passive,false);assert.equal(f.calls.length,1);
  const [factor,center,frame]=f.calls[0];const nextSpan=1000*factor;
  assert.ok(factor<1);assert.equal(frame,f.frames[0]);
  assert.ok(Math.abs((center-nextSpan/2)+0.25*nextSpan-1250)<1e-8);
});
test('downward wheel zoom expands the range',t=>{
  const f=fixture(t);f.wheel({deltaY:100});t.mock.timers.tick(50);assert.ok(f.calls[0][0]>1);
});
test('a wheel burst is coalesced and applies to the hovered multi-locus panel',t=>{
  const f=fixture(t,2);for(let i=0;i<4;i++)f.wheel({composedPath:()=>[f.elements[1]],deltaY:-10});
  assert.equal(f.calls.length,0);t.mock.timers.tick(50);assert.equal(f.calls.length,1);assert.equal(f.calls[0][2],f.frames[1]);
});
test('zoom limits preserve the anchor using the clamped range',t=>{
  const f=fixture(t);f.frames[0].bpPerPixel=0.1;f.wheel({deltaY:-1000});t.mock.timers.tick(50);
  const [,center]=f.calls[0];assert.ok(Math.abs(center-1022.5)<1e-8);
  f.frames[0].bpPerPixel=0.08;f.wheel({deltaY:-1000});t.mock.timers.tick(50);assert.equal(f.calls.length,1);
});
test('scrolling outside tracks and horizontal gestures retain their normal handling',t=>{
  const f=fixture(t);
  for(const overrides of [{composedPath:()=>[]},{deltaX:100,deltaY:1},{ctrlKey:true},{metaKey:true},{deltaY:0}])assert.equal(f.wheel(overrides).prevented,undefined);
  t.mock.timers.tick(50);assert.equal(f.calls.length,0);
});
test('whole-genome and replaced frames keep their current view',t=>{
  const f=fixture(t);f.frames[0].chr='all';assert.equal(f.wheel().prevented,undefined);
  f.frames[0].chr='chr1';f.wheel();f.browser.referenceFrameList=[];t.mock.timers.tick(50);assert.equal(f.calls.length,0);
});
test('disposing wheel zoom clears pending work',t=>{
  const f=fixture(t);f.wheel();f.dispose();t.mock.timers.tick(50);assert.equal(f.calls.length,0);
});
