// Scientific gates for the OPTIONAL bonded thin-wall model. Existing no-spar
// engine remains on its original 2-D section FE path (verify_engine.mjs).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('./wing_spars.js'),E=require('./engine.js');
let checks=0;const near=(a,b,tol,label)=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,`${label}: ${a} vs ${b}`);checks++;};
const material={...S.MAT},spec={fraction:.35,length:300,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material};
const geometry={naca:'0012',semiSpan:300,rootChord:160,tipChord:160,modules:1,interiorRibs:0,rodFractions:[],spars:[spec]};
const input={geometry,assembly:{seamsBonded:true},load:{kind:'custom',items:[]},nGrid:501,nElements:20};
// Closed rectangular tube: analytic Bredt GJ and uniform pure-torque flow.
const b=80,h=30,t=1,G=S.G(material),inner=[[0,0],[b,0],[b,h],[0,h]],outer=[[-t,-t],[b+t,-t],[b+t,h+t],[-t,h+t]];
const net=S.network(inner,outer,material,[]),Am=(b+t)*(h+t),perim=2*(b+h+2*t),GJ=4*Am*Am*G*t/perim;
near(net.GJ,GJ,GJ*1e-10,'closed-box Bredt rigidity');
net.qT.forEach(q=>near(Math.abs(q),1/(2*Am),1e-12,'uniform torsion shear flow'));
near(net.xsc,b/2,1e-8,'symmetric shear centre');near(net.unitV[0],0,1e-8,'no spurious chordwise force');near(net.unitV[1],1,1e-8,'unit shear resultant');near(net.unitT[2],1,1e-8,'unit torque resultant');near(net.energyVT,0,1e-16,'shear/torsion energy decoupled at shear centre');
// Independent exact rectangle integrals, not the same transformed-section code.
const rect=[[-4,-1],[4,-1],[4,1],[-4,1]],v=S.polygon(rect);near(v[0],16,1e-12,'rectangle area');near(v[3],8*2**3/12,1e-12,'rectangle second moment');
const sec=E.sectionAt(input,0),plain=E.sectionAt({...input,geometry:{...geometry,spars:[]}},0);
near(sec.zc,0,1e-9,'symmetric transformed neutral axis');near(sec.bendCoupling,0,1e-9,'no unintended bending coupling');
const capWeb=sec.sparInts.reduce((sum,p)=>sum+p.m.E*p.int[3],0);
near(sec.EIf,plain.EIf+capWeb,1e-6,'shell plus caps plus web stiffness once');
const A=sec.sparInts.reduce((s,p)=>s+p.int[0],0);near(sec.sparMass,material.rho*1e-3*A,1e-12,'spar line mass once');
near(S.polygon(sec.sparParts[0].outline)[0],A,1e-8,'rib cutout is exact union of three nonoverlapping members');
near(sec.sparNetwork.residualV,0,1e-6,'network shear nodal/torque residual');near(sec.sparNetwork.residualT,0,1e-6,'network torsion nodal/torque residual');
const g=E.makeGeometry(geometry),loops=E.ringLoops(g,0),refined=S.network(loops.inner,loops.outer,material,E.sparParts(g,0),180);
near(refined.GJ,sec.GJ,sec.GJ*.03,'skin-network refinement, GJ within 3 percent');near(refined.xsc,sec.xsc,.5,'skin-network refinement, shear centre within 0.5 mm');
const two=E.sectionAt({...input,geometry:{...geometry,spars:[spec,{...spec,fraction:.6}]}},0);assert.ok(two.EIf>sec.EIf&&two.sparMass>sec.sparMass);near(two.sparNetwork.residualT,0,1e-6,'two-cell/web torque equilibrium');checks++;
// Doubling spar E doubles only its stiffness contribution, not mass or skin E.
const stiff=E.sectionAt({...input,geometry:{...geometry,spars:[{...spec,material:{...material,E:2*material.E}}]}},0);
near(stiff.EIf-plain.EIf,2*(sec.EIf-plain.EIf),1e-6,'independent spar modulus');near(stiff.mass,sec.mass,1e-12,'modulus cannot change mass');
const unloaded=E.solve(input);assert.ok(unloaded.V.every(v=>v===0)&&unloaded.deflection.every(v=>v===0)&&unloaded.stress.spars.every(v=>v.tension===0&&v.compression===0&&v.shear===0));checks++;
near(unloaded.mass.spars,sec.sparMass*300,1e-8,'prismatic spar total mass');near(unloaded.mass.total,unloaded.mass.printed+unloaded.mass.spars,1e-8,'no duplicated mass');
const F=2,fraction=sec.xsc/160,r=E.solve({...input,load:{kind:'custom',items:[{kind:'point',position:300,force:F,fraction}]}});
near(r.V[0],F,1e-12,'root shear');near(r.M[0],F*300,1e-12,'root moment');near(r.deflection.at(-1),F*300**3/(3*sec.EIf),1e-5,'prismatic cantilever closed-form displacement');near(r.fem.w.at(-1),F*300**3/(3*sec.EIf),1e-7,'independent beam FE displacement');near(r.twist.at(-1),0,1e-10,'force through shear centre does not twist');
const eccentric=E.solve({...input,load:{kind:'custom',items:[{kind:'point',position:300,force:F,fraction:.2}]}});
near(eccentric.twist.at(-1),F*(sec.xsc-.2*160)*300/sec.GJ,1e-10,'constant-section eccentric force twist');
assert.equal(r.checks.filter(c=>c.group==='spar').length,9);assert.ok(r.sparModel.limitations.length>=4);checks+=2;
assert.ok(r.stress.spars.some(v=>v.kind==='top cap'&&v.compression>0));assert.ok(r.stress.spars.some(v=>v.kind==='bottom cap'&&v.tension>0));assert.ok(r.stress.spars.some(v=>v.kind==='web'&&v.shear>0));checks+=3;
const partial=E.solve({...input,geometry:{...geometry,spars:[{...spec,length:150}]}});
assert.ok(partial.fem.y.includes(150));near(E.sectionAt({...input,geometry:{...geometry,spars:[{...spec,length:150}]}},200).EIf,plain.EIf,1e-7,'no spar stiffness beyond runout');near(partial.mass.spars,sec.sparMass*150,sec.sparMass*.31,'partial length mass; integration error bounded by half grid step');checks++;
for(const bad of [{...spec,webThickness:-1},{...spec,length:301},{...spec,topWidth:200},{...spec,material:{...material,E:Infinity}},{...spec,material:{...material,nu:.5}},{...spec,fraction:.99}]){assert.throws(()=>E.sectionAt({...input,geometry:{...geometry,spars:[bad]}},0));checks++;}
assert.throws(()=>E.makeGeometry({...geometry,rodFractions:[.3]}),/mixed|separately/i);assert.throws(()=>E.normalize({...input,geometry:{...geometry,modules:2},assembly:{seamsBonded:false}}),/bonded module seams/i);checks+=2;
console.log(`Bonded spars: ${checks} analytical, energy, equilibrium, material, stress, mass, runout and rejection checks passed. Thin-wall approximation; no adhesive/buckling certification.`);
