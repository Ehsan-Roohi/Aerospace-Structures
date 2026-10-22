// Independent gates for the added general normal-plane shear-flow network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('./wing_spars.js'),E=require('./engine.js');
let checks=0;const near=(a,b,abs=1e-8,rel=1e-9)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=abs+rel*Math.max(Math.abs(a),Math.abs(b)),`${a} != ${b}`);checks++;};
const I=[[1,0],[0,1]],map=(A,p)=>[A[0][0]*p[0]+A[0][1]*p[1],A[1][0]*p[0]+A[1][1]*p[1]];
function balance(p,tolerance=1e-6){
  near(p.unitV2[0],1,tolerance);near(p.unitV2[1],0,tolerance);near(p.unitV3[0],0,tolerance);near(p.unitV3[1],1,tolerance);
  near(p.unitV2[2],-(p.zsc-p.zc),tolerance);near(p.unitV3[2],p.xsc-p.xc,tolerance);
  near(p.unitT[0],0,tolerance);near(p.unitT[1],0,tolerance);near(p.unitT[2],1,tolerance);
  near(p.residualV2,0,tolerance);near(p.residualV3,0,tolerance);near(p.residualT,0,tolerance);
  near(p.energyV2T,0,1e-12);near(p.energyV3T,0,1e-12);
  assert.ok(p.shearCompliance[0][0]>0&&p.shearCompliance[1][1]>0&&p.GJ>0);checks++;
  near(p.shearCompliance[0][1],p.shearCompliance[1][0],0);
}
// Uniform closed rectangular tube: independently evaluated Bredt compatibility.
const b=80,h=30,t=1,G=S.G(S.MAT),inner=[[0,0],[b,0],[b,h],[0,h]],outer=[[-t,-t],[b+t,-t],[b+t,h+t],[-t,h+t]],raw=S.network(inner,outer,S.MAT,[]),snapshot=JSON.stringify(raw),p=S.projectedNetwork(raw,I),Am=(b+t)*(h+t),P=2*(b+h+2*t),referenceGJ=4*Am*Am*G*t/P;
near(p.GJ,referenceGJ,1e-6,1e-11);near(p.GJ,raw.GJ,1e-6,1e-11);near(p.xsc,b/2);near(p.zsc,h/2);balance(p);
for(const q of p.qT)near(q,1/(2*Am),1e-12);
assert.equal(JSON.stringify(raw),snapshot);checks++;
const overloaded=S.projectedNetwork(inner,outer,S.MAT,[],I);near(overloaded.GJ,p.GJ);near(overloaded.EA,p.EA);
const theta=.71,c=Math.cos(theta),s=Math.sin(theta),R=[[c,-s],[s,c]],rot=S.projectedNetwork(raw,R),expectedSC=map(R,[p.xsc,p.zsc]);
near(rot.GJ,p.GJ);near(rot.EA,p.EA);near(rot.xsc,expectedSC[0]);near(rot.zsc,expectedSC[1]);balance(rot);
for(let i=0;i<p.edges.length;i++){near(rot.qT[i],p.qT[i],1e-11);near(rot.qV2[i],c*p.qV2[i]-s*p.qV3[i],1e-10);near(rot.qV3[i],s*p.qV2[i]+c*p.qV3[i],1e-10);}
const movedRaw={...raw,nodes:raw.nodes.map(([x,z])=>[x+700,z-400])},moved=S.projectedNetwork(movedRaw,I);
near(moved.GJ,p.GJ);near(moved.xsc,p.xsc+700);near(moved.zsc,p.zsc-400);near(moved.EA,p.EA);balance(moved);
for(let i=0;i<p.edges.length;i++){near(moved.qT[i],p.qT[i],1e-11);near(moved.qV2[i],p.qV2[i],1e-10);near(moved.qV3[i],p.qV3[i],1e-10);}
const reflected=S.projectedNetwork(raw,[[1,0],[0,-1]]);near(reflected.GJ,p.GJ);near(reflected.xsc,p.xsc);near(reflected.zsc,-p.zsc);balance(reflected);
for(let i=0;i<p.edges.length;i++)near(reflected.qT[i],-p.qT[i],1e-11);
// A nonorthogonal projection preserves material area via its determinant,
// rather than scaling thickness by the transformed edge length again.
const A=[[.8,.12],[-.15,1.03]],q=S.projectedNetwork(raw,A),det=Math.abs(A[0][0]*A[1][1]-A[0][1]*A[1][0]);near(q.EA,det*p.EA);balance(q);
q.edges.forEach((e,i)=>near(e.t*e.l,det*raw.edges[i].t*raw.edges[i].l,1e-10));
for(let i=0;i<2;i++)for(let j=0;j<2;j++){let expected=0;for(let k=0;k<2;k++)for(let l=0;l<2;l++)expected+=det*A[i][k]*p.Dnormal[k][l]*A[j][l];near(q.Dnormal[i][j],expected,1e-5,1e-11);}
// Bredt formula still applies to the affine-image closed cell with new wall
// lengths and area-preserving effective thicknesses.
const projectedMedianArea=det*Am,compliance=q.edges.reduce((v,e)=>v+e.l/(G*e.t),0);near(q.GJ,4*projectedMedianArea**2/compliance,1e-6,1e-10);
// Cambered, asymmetric, heterogeneous two-spar network exercises both SC
// offsets, perfect bond ties and internal closed-cell compatibility.
const spec={fraction:.3,length:300,topWidth:8,topThickness:.8,bottomWidth:6,bottomThickness:.7,webThickness:.6,material:{...S.MAT}},g=E.makeGeometry({naca:'2412',semiSpan:300,rootChord:160,tipChord:160,modules:1,interiorRibs:0,rodFractions:[],spars:[spec,{...spec,fraction:.65,material:{...S.MAT,E:3500}}]}),loops=E.ringLoops(g,0),graph=S.network(loops.inner,loops.outer,S.MAT,E.sparParts(g,0)),bonded=S.projectedNetwork(graph,I),bondedR=S.projectedNetwork(graph,R);
balance(bonded);balance(bondedR);near(bonded.GJ,graph.GJ,.01,1e-8);near(bonded.xsc,graph.xsc,1e-7,1e-8);
const sc=map(R,[bonded.xsc,bonded.zsc]);near(bondedR.xsc,sc[0],1e-7);near(bondedR.zsc,sc[1],1e-7);near(bondedR.GJ,bonded.GJ,.05,1e-8);
assert.ok(Math.abs(bonded.zsc-bonded.zc)>1e-4);checks++;
const projectedBonded=S.projectedNetwork(graph,A);balance(projectedBonded);near(projectedBonded.EA,det*bonded.EA,1e-7);
assert.equal(projectedBonded.edges.filter(e=>e.tie).length,graph.edges.filter(e=>e.tie).length);checks++;
for(const invalid of [[[1,0],[0,0]],[[1,0],[0,NaN]],[[1],[0,1]]]){assert.throws(()=>S.projectedNetwork(raw,invalid),/projection|singular/);checks++;}
console.log(`Projected bonded spar network: ${checks} Bredt, two-force/torque balance, energy, rotation/reflection/translation, material-area and two-spar checks passed.`);
