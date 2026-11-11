import test from 'node:test';
import assert from 'node:assert/strict';
import {suppressInlineAnnotationSeams} from '../docs/annotation-seams.mjs';

test('adjacent subpixel intervals draw bounded blocks without full-height seam strokes',()=>{
  const rectangles=[];
  const track={type:'annotation',config:{features:[]},displayMode:'EXPANDED',expandedRowHeight:14,margin:4,getColorForFeature:()=> 'blue'};
  assert.equal(suppressInlineAnnotationSeams(track),true);
  const renderer=track.draw;assert.equal(suppressInlineAnnotationSeams(track),false);assert.equal(track.draw,renderer);
  const context={save(){},restore(){},fillRect(...args){rectangles.push(args);}};
  track.draw({context,bpStart:100,bpPerPixel:10,pixelWidth:50,pixelHeight:60,features:[{start:90,end:102,row:0},{start:102,end:104,row:1},{start:590,end:650,row:0},{start:700,end:800}]});
  assert.deepEqual(rectangles,[[0,0,50,60],[0,8,1,6],[0,22,1,6],[49,8,1,6]]);
});
test('signal tracks and file-backed gene models retain their renderer',()=>{
  const draw=()=>{};
  for(const track of [{type:'wig',config:{features:[]},draw},{type:'annotation',config:{url:'genes.bed'},draw}]){
    assert.equal(suppressInlineAnnotationSeams(track),false);assert.equal(track.draw,draw);
  }
});
