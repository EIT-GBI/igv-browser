import test from 'node:test';
import assert from 'node:assert/strict';
import {e2gTrackRole, sameElement, predictionMatchesElement, installE2GHighlighting, fadedColor, highlightedColor, incomingColor, outgoingColor, predictionDirection, predictionHint} from '../docs/e2g-highlighting.mjs';

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
test('links match either overlapping endpoint on the same chromosome, including IGV wrappers',()=>{
  assert.equal(predictionMatchesElement(link,element),true);
  assert.equal(predictionMatchesElement({_:{...link,chr1:'1'}},{_f:element}),true);
  assert.equal(predictionMatchesElement(link,{...element,start:778480}),true);
  assert.equal(predictionMatchesElement(link,otherElement),true);
  assert.equal(predictionMatchesElement(link,{chr:'chr1',start:827522,end:827523}),true);
  for(const candidate of [{...element,chr:'chr2'},{chr:'chr1',start:778979,end:779000},{chr:'chr1',start:827523,end:827600},{chr:'chr1',start:778000,end:778479}])assert.equal(predictionMatchesElement(link,candidate),false);
  assert.equal(predictionMatchesElement({...link,chr2:'chr2'},otherElement),false);
  assert.equal(sameElement({},{}),false);assert.equal(sameElement(undefined,element),false);
});
test('element click highlights its links, suppresses its popup and preserves unrelated tracks',()=>{
  const f=fixture(), config=structuredClone(f.elements.track.config);
  assert.equal(f.click(),false);
  assert.equal(f.click([element],f.predictions.track),undefined);
  assert.equal(f.click([element],f.unrelated.track),undefined);
  assert.equal(f.elements.track.getColorForFeature(element),highlightedColor);
  assert.equal(f.elements.track.getColorForFeature(otherElement),fadedColor);
  assert.equal(f.predictions.track.getColor(link),outgoingColor);assert.equal(f.predictions.track.getColor(otherLink),fadedColor);
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
  f.emit('trackorderchanged');assert.equal(late.track.getColor(link),outgoingColor);
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

test('incoming and outgoing links share highlighting and paint above unrelated links',()=>{
  const f=fixture();f.click();
  const incoming={chr1:'chr1',start1:900000,end1:900500,chr2:'chr1',start2:778700,end2:778701};
  assert.equal(f.predictions.track.getColor(incoming),incomingColor);
  assert.equal(f.predictions.track.getColor(link),outgoingColor);
  assert.equal(f.predictions.track.getColor(otherLink),fadedColor);
  f.predictions.track.draw({features:[incoming,otherLink,link]});
  assert.deepEqual(f.draws[0].features,[otherLink,incoming,link]);
});

test('direction is relative to the selected interval, with incoming red for self-links',()=>{
  assert.equal(predictionDirection(link,element),'outgoing');
  assert.equal(predictionDirection(link,otherElement),'incoming');
  const self={...link,start2:778700,end2:778701};
  assert.equal(predictionDirection(self,element),'incoming');
  const f=fixture();f.click();assert.equal(f.predictions.track.getColor(self),incomingColor);
  assert.equal(predictionDirection({...link,chr2:'chr2'},otherElement),undefined);
});

test('prediction hover hints show both directions and survive viewport replacement',()=>{
  const f=fixture();
  const viewport=()=>({viewportElement:{title:''},trackLabelElement:{title:''}});
  f.predictions.viewports=[viewport()];f.elements.viewports=[viewport()];
  f.emit('trackorderchanged');
  assert.equal(f.predictions.viewports[0].viewportElement.title,predictionHint);
  assert.match(f.predictions.viewports[0].trackLabelElement.title,/Incoming: red/);
  assert.match(f.predictions.viewports[0].trackLabelElement.title,/Outgoing: orange/);
  assert.equal(f.elements.viewports[0].viewportElement.title,'');
  f.predictions.viewports=[viewport()];f.emit('locuschange');
  assert.equal(f.predictions.viewports[0].viewportElement.title,predictionHint);
});
