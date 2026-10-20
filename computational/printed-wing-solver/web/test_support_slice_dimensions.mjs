import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({});for(const f of ['load_profiles.js','beam_sections.js','beam_learning_engine.js','beam_diagrams.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),ctx);
const s={name:'B',kind:'pin',x:230,end:null,R:-499.301,C:0,P:0,C0:0,left:{V:-499.301,M:0},right:{V:0,M:0}};
ctx.slice=s;let svg=vm.runInContext('BeamDiagrams.supportSlice(slice,{width:400})',ctx);assert.match(svg,/230 − ε mm/);assert.match(svg,/230 \+ ε mm/);assert.match(svg,/2ε → 0/);assert.match(svg,/not to scale/);assert.match(svg,/data-dir="up"/);assert.ok(!/NaN|undefined/.test(svg));
ctx.slice={...s,x:0,end:'left',left:null};svg=vm.runInContext('BeamDiagrams.supportSlice(slice,{width:400})',ctx);assert.match(svg,/Beam end: x = 0 mm/);assert.match(svg,/Δx = ε → 0/);
console.log('Support-slice dimensions PASS: numerical support x, both limiting-face coordinates, ε-width interpretation, end case and unchanged upward reaction sign.');
