// Independent checks added during integration; reference agreement alone misses shared bugs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./metal_wing_engine.js');
let checks = 0;
const close = (a,b,tol=1e-10) => { assert.ok(Math.abs(a-b) <= tol*Math.max(1,Math.abs(b)), `${a} != ${b}`); checks++; };
for (const input of [
  {n:NaN}, {n:Infinity}, {n:null}, {n:'1'}, {mass:-1}, {mass:0}, {mass:'2677'}, {CL:-1}, {CL:0},
  {preset:'missing'}, {distribution:'missing'}, {support:'missing'},
  {stations:2}, {stations:301}, {stations:20.5}, {scales:{skin:Infinity}},
  {material:{rho:0}}, {material:{Fty:-1}}, {material:{Fcy:0}},
  {material:{Ftu:100}}, {material:{epsU:1e-9}},
  {gauges:{skin:[0]}}, {boom:{rootWidth:0}}, {fittingY:0}, {fittingY:5},
]) { assert.throws(() => M.solve(input)); checks++; }
const options = {collapse:false, modes:false};
const positive = M.solve({...options,n:1});
const negative = M.solve({...options,n:-1});
close(negative.tip.wMax, -positive.tip.wMax);
close(negative.tip.twistDeg, -positive.tip.twistDeg);
close(negative.fitting.M_per_g, positive.fitting.M_per_g);
const changedCL = M.solve({...options, CL:0.8});
// CL changes loading, not the physical cap taper or structural mass.
close(changedCL.mass.structuralHalf, positive.mass.structuralHalf);
assert.deepEqual(changedCL.zones,positive.zones); checks++;
const P=positive.P, W=positive.wing, Z=positive.zones;
const parts=M.collapseParts(P,W,Z,2.35,positive.input.scales,P.material);
for (const part of parts.filter(p=>p.kind===4)) {
  const pts=W.section(2.35,M.linspace(part.x0,part.x1,12))[part.side==='u'?'up':'lo'];
  const [a,b,c]=[pts[0],pts[6],pts[11]];
  const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
  const twiceArea=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]));
  if (twiceArea>1e-12) close(part.R,dist(a,b)*dist(b,c)*dist(c,a)/(2*twiceArea));
}
console.log(`Metal-wing independent regressions: ${checks} checks passed.`);
