// Optional prototype admission; no engine integration or calibrated constants.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),B=require('./wing_finite_section.js'),deps=require('./vendor/finite-section-geometry/geometry.min.js');
const G=2000/2.7,records=[];
const ellipse=Array.from({length:240},(_,i)=>[10*Math.cos(2*Math.PI*i/240),5*Math.sin(2*Math.PI*i/240)]);
const rectangle=[[-10,-5],[10,-5],[10,5],[-10,5]],Jrect=20*10**3/3*(1-192*10/(Math.PI**5*20)*Array.from({length:100},(_,k)=>{const n=2*k+1;return Math.tanh(n*Math.PI)/n**5;}).reduce((a,b)=>a+b,0));
for(const[name,outer,J]of [['ellipse',ellipse,Math.PI*10**3*5**3/125],['rectangle',rectangle,Jrect]]){
 const r=B.solve({G,outer},{deps}),relative=(r.J-J)/J;assert.ok(Math.abs(relative)<.01,`${name}: ${relative}`);assert.ok(r.trueRelativeResidual<2e-9);assert.ok(r.energyIdentityRelative<1e-7);records.push({name,relative,history:r.history});
}
// Held-out slender ellipse and rotated/translated variants: refinement is
// explicitly not a proof of true error, so retain independent analytic gates.
for(const angle of [0,37*Math.PI/180]){
 const a=13,b=3,outer=Array.from({length:480},(_,i)=>{const t=2*Math.PI*i/480,x=a*Math.cos(t),z=b*Math.sin(t);return [20+Math.cos(angle)*x-Math.sin(angle)*z,-7+Math.sin(angle)*x+Math.cos(angle)*z];}),r=B.solve({G,outer},{deps}),exact=Math.PI*a**3*b**3/(a*a+b*b),relative=(r.J-exact)/exact;assert.ok(Math.abs(relative)<.01,`held-out slender ellipse ${angle}: ${relative}`);records.push({name:'held-out ellipse13x3',angle,relative,history:r.history});
}
if(process.argv[2]){
 const dir=process.argv[2],src=JSON.parse(readFileSync(dir+'/section-unions.json')),reference=JSON.parse(readFileSync(dir+'/section-union-fe-comparison.json'));
 // Repeat without cache for JIT-warm timing, retaining first/cold history too.
 for(let pass=0;pass<2;pass++)for(let i=0;i<3;i++){
  B.clearCache();const s=src.sections[i],start=performance.now(),r=B.solve(s,{deps}),total=performance.now()-start,J=reference.sections[i].runs.at(-1).J_mm4,relative=(r.J-J)/J;
  assert.ok(relative>=-.001&&relative<.01,`union${s.y}: ${relative}`);assert.ok(Math.abs(r.area-reference.sections[i].runs.at(-1).area_mm2)<1e-7);
  assert.equal(r.shearCentreReplaced,false);assert.ok(r.refinementRelative<=.01);
  const cachedStart=performance.now(),cached=B.solve(s,{deps});assert.equal(cached.cached,true);assert.equal(cached.GJ,r.GJ);
  records.push({station:s.y,pass,relative,totalMs:total,cachedMs:performance.now()-cachedStart,history:r.history});
 }
 writeFileSync(dir+'/js-finite-section-prototype.json',JSON.stringify({scope:'Prototype only; actual measured performance and independent references. No production integration.',records},null,2)+'\n');
}
assert.throws(()=>B.solve({G,outer:rectangle,partShearModuli:[G,2*G]},{deps}),/homogeneous/);
console.log(JSON.stringify({passed:true,records:records.map(r=>({...r,history:r.history.map(h=>({nodes:h.nodes,J:h.J,ms:h.elapsedMs,mesh:h.meshMs,assembly:h.assemblyMs,solve:h.solveMs}))}))}));
