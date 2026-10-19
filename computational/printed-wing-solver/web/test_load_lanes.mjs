import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), D=require('./beam_diagrams.js');
const linear=(start,end)=>({kind:'distributed',start,end,qStart:1,qEnd:2});
const base={length:450,supports:[{kind:'fixed',x:0}],hinges:[]};
function draw(loads,scale='shared') {
  const svg=D.beamSchematic({...base,loads},{width:1000,interactive:true,loadScale:scale});
  const beam=Number(svg.match(/<rect x="[^"]+" y="([^"]+)"[^>]*class="bl-beam"/)[1]);
  const bases=[...svg.matchAll(/<path d="([^"]+)" class="bl-load-fill"/g)].map(m=>Number(m[1].match(/^M[-\d.]+ ([-\d.]+)/)[1]));
  const handles=[...svg.matchAll(/data-load-handle="(\d+)"[^]*?<circle cx="[^"]+" cy="([^"]+)"/g)].map(m=>[Number(m[1]),Number(m[2])]);
  return {svg,beam,bases,handles};
}
// Screenshot regression: third load entered left of the earlier right-hand load.
for(const scale of ['shared','independent']) {
  const loads=[{kind:'point',position:170,force:1},linear(300,430),linear(100,130)];
  const a=draw(loads,scale), b=draw([loads[2],loads[0],loads[1]],scale);
  assert.deepEqual(a.bases,[a.beam-4,a.beam-4]);
  assert.deepEqual(b.bases,[b.beam-4,b.beam-4]);
  assert.equal(a.beam,b.beam,'insertion order cannot add an empty lane');
  assert.equal(a.handles[1][1],a.beam-14);
  assert.equal(a.handles[2][1],a.beam-14);
}
const overlap=draw([linear(100,250),linear(150,300),linear(320,400)]);
assert.deepEqual(overlap.bases,[overlap.beam-4,overlap.beam-56,overlap.beam-4]);
assert.equal(overlap.handles[1][1],overlap.beam-66);
const touching=draw([linear(200,300),linear(100,200)]);
assert.deepEqual(touching.bases,[touching.beam-4,touching.beam-4]);
const curved=draw([{kind:'elliptic',start:300,end:440,shape:'start',mode:'total',value:1},linear(20,100)]);
assert.ok(curved.svg.includes('data-load-kind="elliptic"'));
assert.equal(curved.bases[0],curved.beam-4);
assert.equal(curved.handles[0][1],curved.beam-14);
assert.equal(curved.handles[1][1],curved.beam-14);
console.log('Load lanes: insertion-order independence, disjoint/touching intervals, overlap stacking, handles, curved shapes and both scales passed.');
