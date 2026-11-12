import test from 'node:test';
import assert from 'node:assert/strict';
import {featureRegion, zoomToRegion, installRegionZoom} from '../docs/region-zoom.mjs';

function fixture() {
  const events = new Map(), zooms = [], searches = [], menus = [];
  const frames = ['chr1','chr2'].map(chr=>({chr,start:1000,bpPerPixel:2,getLocusString(){return `${chr}:1001-2000`;}}));
  const column = {};
  let context;
  const originalItem = {label:'Existing action'};
  const track = {clickedFeatures:()=>[{chr:'chr2',start:1200,end:1400}],contextMenuItemList(){assert.equal(this,track);return [originalItem];}};
  const browser = {genome:{getChromosomeName:chr=>chr},referenceFrameList:frames,calculateViewportWidth:()=>500,
    zoomWithScaleFactor:async(...args)=>zooms.push(args),search:async loci=>searches.push(loci),
    root:{addEventListener(type,handler){context=handler;}},
    trackViews:[{track,viewports:[{viewportElement:{parentElement:column},referenceFrame:frames[1]}]}],
    roiManager:{roiMenu:{menuItems:()=>[{label:'Delete'}]}},
    menuPopup:{presentTrackContextMenu(event,items){menus.push(items);}},
    on(event,handler){events.set(event,handler);}};
  installRegionZoom(browser);
  return {browser,track,originalItem,frames,column,events,zooms,searches,menus,context:(event)=>context(event)};
}

test('feature regions cover annotations, signal bins, variants and alignment spans',()=>{
  assert.deepEqual(featureRegion({_f:{chr:'chr1',start:99,end:200}}),{chr:'chr1',start:99,end:200});
  assert.deepEqual(featureRegion({start:100,lengthOnRef:75},'chr2'),{chr:'chr2',start:100,end:175});
  assert.deepEqual(featureRegion({chr:'chr1',start:99}),{chr:'chr1',start:99,end:100});
  assert.equal(featureRegion({chr:'chr1',start:100,end:100}),undefined);
  assert.equal(featureRegion({chr:'chr1',start:NaN,end:200}),undefined);
});
test('zoom fits the interval and targets only the chosen multi-locus frame',async()=>{
  const f=fixture();await zoomToRegion(f.browser,{chr:'chr2',start:1200,end:1400},f.frames[1]);
  assert.deepEqual(f.zooms,[[0.2,1300,f.frames[1]]]);assert.deepEqual(f.searches,[]);
});
test('cross-chromosome navigation retains other panels and converts BED coordinates to display coordinates',async()=>{
  const f=fixture();await zoomToRegion(f.browser,{chr:'chr3',start:0,end:100},f.frames[1]);
  assert.deepEqual(f.searches,[['chr1:1001-2000','chr3:1-100']]);
});
test('feature context menus retain native actions and expose Zoom in for the feature under the pointer',async()=>{
  const f=fixture();const state={referenceFrame:f.frames[1],genomicLocation:1250};
  const menu=f.track.contextMenuItemList(state);assert.deepEqual(menu.map(item=>item.label),['Zoom in','Existing action']);
  await menu[0].click();assert.equal(f.zooms[0][2],f.frames[1]);
  f.track.clickedFeatures=()=>[];assert.deepEqual(f.track.contextMenuItemList(state),[f.originalItem]);
  f.events.get('trackorderchanged')();assert.equal(f.track.contextMenuItemList(state).length,1);
});
test('the existing ROI left-click menu offers Zoom in and retains native actions',async()=>{
  const f=fixture();
  const event={composedPath:()=>[f.column]};
  const menu=f.browser.roiManager.roiMenu.menuItems({chr:'chr2',start:1200,end:1400},{},event);
  assert.deepEqual(menu.map(item=>item.label),['Zoom in','Delete']);
  await menu[0].click();assert.equal(f.zooms[0][2],f.frames[1]);
});
