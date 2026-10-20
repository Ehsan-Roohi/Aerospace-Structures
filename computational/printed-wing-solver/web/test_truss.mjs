import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('./truss_engine.js',import.meta.url),'utf8'),ctx);const T=ctx.TrussEngine;
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const node=(id,x,y,support='free',fx=0,fy=0)=>({id,x,y,support,fx,fy});
const bar=(a,b,E=200000,A=100)=>({a,b,E,A});
// An axial bar: exact FL/EA and equal/opposite reaction.
let r=T.solve({nodes:[node(1,0,0,'pin'),node(2,1000,0,'rollerY',100)],members:[bar(1,2)]});
near(r.nodes[1].ux,.005);near(r.members[0].force,100);near(r.members[0].stress,1);near(r.nodes[0].rx,-100);
// Symmetric triangular truss, height 500 and half-base 500, downward P=100.
const triangle={nodes:[node(1,0,0,'pin'),node(2,1000,0,'rollerY'),node(3,500,500,'free',0,-100)],members:[bar(1,2),bar(1,3),bar(2,3)]};
r=T.solve(triangle);near(r.nodes[0].ry,50);near(r.nodes[1].ry,50);near(r.members[0].force,50);near(r.members[1].force,-50*Math.SQRT2);near(r.members[2].force,-50*Math.SQRT2);
near(r.nodes[2].uy,-(25*1000/(200000*100)+100*Math.sqrt(500**2+500**2)/(200000*100)));
for(const v of Object.values(r.equilibrium))near(v,0);
// Mirroring load reverses signed responses; material doubles stiffness, not determinate forces.
const up=structuredClone(triangle);up.nodes[2].fy=100;const ru=T.solve(up);r.members.forEach((m,i)=>near(ru.members[i].force,-m.force));
const stiff=structuredClone(triangle);stiff.members.forEach(m=>m.E*=2);const rs=T.solve(stiff);near(rs.nodes[2].uy,r.nodes[2].uy/2);near(rs.members[1].force,r.members[1].force);
const reversed=structuredClone(triangle);reversed.members=reversed.members.map(m=>({...m,a:m.b,b:m.a}));const rr=T.solve(reversed);r.members.forEach((m,i)=>near(rr.members[i].force,m.force));
// Energy: 1/2 uF equals sum N²L/(2EA).
near(r.nodes.reduce((s,n)=>s+(n.fx*n.ux+n.fy*n.uy)/2,0),r.members.reduce((s,m)=>s+m.force*m.force*m.L/(2*m.E*m.A),0));
assert.throws(()=>T.solve({nodes:triangle.nodes.map(n=>({...n,support:'free'})),members:triangle.members}),/singular|Mechanism/);
assert.throws(()=>T.solve({...triangle,members:[bar(1,2),bar(1,3)]}),/singular|Mechanism/);
assert.throws(()=>T.normalize({...triangle,members:[bar(1,2),bar(2,1)]}),/Duplicate/);
assert.throws(()=>T.normalize({...triangle,members:[bar(1,8)]}),/existing/);
assert.throws(()=>T.normalize({...triangle,members:[bar(1,2,-1)]}),/positive/);
console.log('Truss engine PASS: exact bar, triangular reactions/tension/compression/displacement, load reversal, stiffness scaling, orientation invariance, energy, equilibrium and invalid/mechanism rejection.');
