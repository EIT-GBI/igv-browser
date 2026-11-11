import test from 'node:test';
import assert from 'node:assert/strict';
import {e2gTrackRole, sameElement, predictionMatchesElement, installE2GHighlighting, fadedColor, highlightedColor} from '../docs/e2g-highlighting.mjs';

const element = {chr:'chr1',start:778479,end:778979};
const otherElement = {chr:'chr1',start:827272,end:827840};
const link = {chr1:'chr1',start1:778479,end1:778979,chr2:'chr1',start2:827522,end2:827523};
const otherLink = {...link,start1:827272,end1:827840};

function fixture() {
  const events = new Map();
  const draws = [], repaints = [];
  function view(role, extra={}) {
    const track = {type:role === 'elements' ? 'annotation':'interact',config:{metadata:{cellTypeID:'HAP-1_ENCSR895KTN',model:'ENCODE-rE2G',trackType:role === 'elements' ? 'Elements':'E2G Predictions'}},getColorForFeature:()=> 'darkgrey',getColor:()=> 'red',draw(options){draws.push(options);},...extra};
    const result={track,repaintViews(){repaints.push(track);}};return result;
  }
  const elements=view('elements'), predictions=view('predictions'), unrelated=view('elements',{config:{metadata:{cellTypeID:'other'}}});
  const browser={trackViews:[elements,predictions,unrelated],genome:{getChromosomeName:chr=>String(chr).replace(/^chr/,'')},on(event,handler){events.set(event,handler);}};
  const emit=(event,...args)=>events.get(event)(...args);
  installE2GHighlighting(browser);
  repaints.length = 0;
  const click=(features=[element],track=elements.track)=>emit('trackclick',track,[],778700,features);
  return {browser,elements,predictions,unrelated,draws,repaints,emit,click,view};
}

test('track identification is restricted to the requested HAP-1 sample and model',()=>{
  const f=fixture();assert.equal(e2gTrackRole(f.elements.track),'elements');assert.equal(e2gTrackRole(f.predictions.track),'predictions');assert.equal(e2gTrackRole(f.unrelated.track),undefined);
  assert.equal(e2gTrackRole({...f.elements.track,config:{metadata:{...f.elements.track.config.metadata,model:'ABC'}}}),undefined);
});
test('links match the exact enhancer anchor and chromosome, including IGV feature wrappers',()=>{
  assert.equal(predictionMatchesElement(link,element),true);
  assert.equal(predictionMatchesElement({_:{...link,chr1:'1'}},{_f:element}),true);
  for(const candidate of [{...element,chr:'chr2'},{...element,start:778480},{chr:'chr1',start:827522,end:827523}])assert.equal(predictionMatchesElement(link,candidate),false);
  assert.equal(sameElement({},{}),false);assert.equal(sameElement(undefined,element),false);
});
test('element click highlights its links, keeps details and preserves unrelated tracks',()=>{
  const f=fixture(), config=structuredClone(f.elements.track.config);
  assert.equal(f.click(),undefined);
  assert.equal(f.elements.track.getColorForFeature(element),highlightedColor);
  assert.equal(f.elements.track.getColorForFeature(otherElement),fadedColor);
  assert.equal(f.predictions.track.getColor(link),'red');assert.equal(f.predictions.track.getColor(otherLink),fadedColor);
  assert.equal(f.unrelated.track.getColorForFeature(otherElement),'darkgrey');assert.deepEqual(f.elements.track.config,config);
  assert.equal(f.repaints.length,2);
});
test('selected arcs paint last while cached feature order and draw options are preserved',()=>{
  const f=fixture();f.click();const features=[link,otherLink],context={};f.predictions.track.draw({features,context});
  assert.deepEqual(f.draws[0].features,[otherLink,link]);assert.deepEqual(features,[link,otherLink]);assert.equal(f.draws[0].context,context);
});
test('repeated or empty clicks restore colours and clicks in unrelated tracks preserve selection',()=>{
  const f=fixture();f.click();f.click([otherElement],f.unrelated.track);assert.equal(f.predictions.track.getColor(otherLink),fadedColor);
  f.click();assert.equal(f.predictions.track.getColor(otherLink),'red');assert.equal(f.elements.track.getColorForFeature(otherElement),'darkgrey');
  f.click();f.click([]);assert.equal(f.predictions.track.getColor(otherLink),'red');
});
test('selection matches fresh feature objects after panning and applies to tracks added later',()=>{
  const f=fixture();f.click();assert.equal(f.elements.track.getColorForFeature({...element}),highlightedColor);
  const late=f.view('predictions');f.browser.trackViews.push(late);f.emit('trackorderchanged');assert.equal(late.track.getColor(otherLink),fadedColor);assert.ok(f.repaints.includes(late.track));
  f.emit('trackorderchanged');assert.equal(late.track.getColor(link),'red');
});
test('removing the selected element track or switching genomes clears transient highlighting',()=>{
  const f=fixture();f.click();f.browser.trackViews.splice(0,1);f.emit('trackremoved',f.elements.track);assert.equal(f.predictions.track.getColor(otherLink),'red');
  f.browser.trackViews.unshift(f.elements);f.click();f.emit('genomechange');assert.equal(f.elements.track.getColorForFeature(otherElement),'darkgrey');
});

test('prediction defaults use one end in view and preserve an explicitly saved arc type',()=>{
  const f=fixture();assert.equal(f.predictions.track.arcType,'partialInView');assert.equal(f.predictions.track.config.arcType,'partialInView');
  const saved=f.view('predictions');saved.track.config.arcType='nested';saved.track.arcType='nested';
  f.browser.trackViews.push(saved);f.emit('trackorderchanged');assert.equal(saved.track.arcType,'nested');
  f.predictions.track.arcType='inView';f.emit('trackorderchanged');assert.equal(f.predictions.track.arcType,'inView');
});
