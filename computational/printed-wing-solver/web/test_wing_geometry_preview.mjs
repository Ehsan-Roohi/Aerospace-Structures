// Geometry preview contract without WebGL; actual renderer requires a browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
const src=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8');
const start=src.indexOf('  function previewGeometry()'),end=src.indexOf('\n  // Deliberate study actions',start);
assert.ok(start>0&&end>start);
const nodes=new Map(),ctx={E,model:{},running:false,geometryPreview:false,lastGeoKey:'old',calls:[],
 engineInput:()=>({geometry:{interiorRibs:5,rodFractions:[.25,.65],semiSpan:480}}),
 $:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);},
 buildModel:r=>{ctx.g=r.geometry;ctx.calls.push('build');},updateModel:()=>ctx.calls.push('update'),
 frameView:()=>ctx.calls.push('frame'),renderViewReadout:()=>{},renderPlotInfo:()=>{},renderSparResults:()=>{},renderPartEditor:()=>{},
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end)+'\npreviewGeometry();',ctx);
assert.equal(ctx.g.interiorRibs,5);assert.equal(ctx.g.rodFractions.length,2);assert.equal(ctx.g.semiSpan,480);
assert.equal(ctx.geometryPreview,true);assert.equal(ctx.lastGeoKey,null);
assert.deepEqual(ctx.calls,['build','update','frame']);
assert.match(nodes.get('#viewStale').textContent,/stress, deformation and load arrows are hidden/);
ctx.calls=[];ctx.engineInput=()=>({geometry:{semiSpan:-1}});vm.runInContext('previewGeometry()',ctx);
assert.deepEqual(ctx.calls,['update']);assert.match(nodes.get('#viewStale').textContent,/unavailable/);
assert.ok(src.includes('if (geometryPreview) return [0, 0]'));
assert.ok(src.includes('if (!R || geometryPreview || S.plot === "mode") return;'));
assert.ok(src.includes('geometryPreview = false;\n      if (heavy)'));
assert.ok(!src.slice(start,end).includes('E.solve'));
console.log('PASS: current ribs/rods/span preview without solve; invalid geometry retained honestly; stale motion/load fields suppressed.');
