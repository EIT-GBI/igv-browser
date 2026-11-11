import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleSelectedTracks, signalTrackViews, installGroupScaling, scalingPanelPosition} from '../docs/group-scaling.mjs';

function fixture() {
  const tracks = ['wig','wig','wig','annotation'].map((type,i) => ({type,selected:i !== 2,config:{autoscale:true},autoscale:true,dataRange:{min:0,max:i+1},setDataRange(range){this.dataRange=range;this.autoscale=false;this.autoscaleGroup=undefined;}}));
  let updates = 0;
  const browser = {trackViews:tracks.map(track=>({track})),async updateViews(){updates++;}};
  return {browser,tracks,updates:()=>updates};
}
test('group autoscale binds selected signal tracks and preserves other tracks',async()=>{
  const f=fixture(); const others=structuredClone(f.tracks.slice(2).map(({setDataRange,...track})=>track));
  assert.equal(await scaleSelectedTracks(f.browser),2);
  const [a,b]=f.tracks;
  assert.ok(a.autoscaleGroup);assert.equal(a.autoscaleGroup,b.autoscaleGroup);
  assert.equal(a.config.autoscaleGroup,a.autoscaleGroup);assert.equal(a.config.autoscale,false);
  assert.deepEqual(f.tracks.slice(2).map(({setDataRange,...track})=>track),others);
  assert.equal(f.updates(),1);
});
test('fixed range removes previous group references from runtime and saved config',async()=>{
  const f=fixture();await scaleSelectedTracks(f.browser);
  assert.equal(await scaleSelectedTracks(f.browser,{min:'-2.5',max:'1e2'}),2);
  for(const track of f.tracks.slice(0,2)){
    assert.deepEqual(track.dataRange,{min:-2.5,max:100});assert.equal(track.autoscale,false);
    assert.equal(track.autoscaleGroup,undefined);assert.equal('autoscaleGroup' in track.config,false);
    assert.equal(track.config.min,-2.5);assert.equal(track.config.max,100);
  }
});
test('invalid ranges leave every selected track unchanged',async()=>{
  const f=fixture();await scaleSelectedTracks(f.browser);const before=JSON.stringify(f.tracks);
  for(const range of [{min:'',max:10},{min:0,max:''},{min:10,max:10},{min:20,max:10},{min:'NaN',max:10},{min:0,max:'Infinity'}]){
    await assert.rejects(scaleSelectedTracks(f.browser,range),/minimum/);assert.equal(JSON.stringify(f.tracks),before);
  }
  assert.equal(f.updates(),1);
});
test('regrouping selected members preserves the earlier group on remaining tracks',async()=>{
  const f=fixture();f.tracks[2].selected=true;await scaleSelectedTracks(f.browser);
  const previous=f.tracks[2].autoscaleGroup;f.tracks[2].selected=false;
  await scaleSelectedTracks(f.browser);
  assert.equal(f.tracks[2].autoscaleGroup,previous);assert.notEqual(f.tracks[0].autoscaleGroup,previous);
});
test('empty, removed and annotation-only selections are rejected',async()=>{
  const f=fixture();f.tracks[0].disposed=true;f.tracks[1].selected=false;
  assert.equal(signalTrackViews(f.browser).length,2);
  await assert.rejects(scaleSelectedTracks(f.browser),/Select signal tracks/);assert.equal(f.updates(),0);
});

test('floating controls require selection and an explicit S shortcut',()=>{
  const listeners = new Map();
  const control = () => ({addEventListener(name,handler){this[name]=handler;}});
  const doc = {createElement:()=>({}),addEventListener(name,handler){listeners.set(name,handler);}};
  const track = {type:'wig',selected:false};
  const browser = {root:{ownerDocument:doc,appendChild(){},addEventListener(){}},trackViews:[{track,viewports:[],setDragHandleSelectionState(){}}],on(){}};
  const controls = Object.fromEntries(['row','count','auto','apply','clear','close','min','max'].map(name=>[name,control()]));
  const panel = installGroupScaling(browser,controls);
  const key = (key,extra={}) => listeners.get('keydown')({key,composedPath:()=>[],preventDefault(){},...extra});
  assert.equal(controls.row.hidden,true);
  key('s'); assert.equal(controls.row.hidden,true);
  track.selected=true;panel.sync();assert.equal(controls.row.hidden,true);
  for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{composedPath:()=>[{matches:()=>true}]}]){
    key('s',extra);assert.equal(controls.row.hidden,true);
  }
  key('s');assert.equal(controls.row.hidden,false);
  key('s');assert.equal(controls.row.hidden,true);
  key('S');assert.equal(controls.row.hidden,false);
  controls.close.click();assert.equal(controls.row.hidden,true);assert.equal(track.selected,true);
  key('s');key('Escape',{composedPath:()=>[{matches:()=>true}]});assert.equal(controls.row.hidden,true);
  key('s');track.selected=false;panel.sync();assert.equal(controls.row.hidden,true);
  track.selected=true;panel.sync();assert.equal(controls.row.hidden,true);
});


test('floating panel sits beside its label and stays within the viewport',()=>{
  assert.deepEqual(scalingPanelPosition({right:180,top:300},{width:310,height:150},{width:1000,height:800}),{left:188,top:300});
  assert.deepEqual(scalingPanelPosition({right:900,top:760},{width:310,height:150},{width:1000,height:800}),{left:682,top:642});
  assert.deepEqual(scalingPanelPosition({right:100,top:-10},{width:310,height:150},{width:350,height:800}),{left:32,top:8});
});
