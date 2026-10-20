import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),B=require('./beam_learning_engine.js'),S=require('./beam_sections.js'),F=require('./beam_strength.js');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const model={length:450,E:2000,density:1.24,elements:12,section:{shape:'rectangle',width:20,height:10},supports:[{x:0,kind:'fixed'}],hinges:[],loads:[{kind:'point',position:450,force:2}],selfWeight:false,modes:false};
let r=B.solve(model),cfg={requiredFos:2,layers:[{yield:27}]},a=F.evaluate(r,cfg);
assert.equal(a.status,'within');near(a.pointFos,10);near(a.critical.x,0);near(Math.abs(a.critical.z),5);assert.ok(a.fosLower<=a.pointFos);assert.ok(a.fosLower>9.99);near(a.deflection.value,18.225);assert.equal(a.deflection.status,'unchecked');
const fiction=Math.hypot(2.7,Math.sqrt(3)*.015)/27;assert.ok(a.maxRatio<fiction,'evaluated VM must not combine unrelated through-depth extrema');
const mid=F.evaluate(r,cfg,{x:225,side:'right'}).selected;near(Math.abs(mid.sigma),1.35);near(mid.fos,20);near(mid.tau,0);
const noLimits=F.evaluate(r,{}, {x:225,side:'right'}).selected;near(Math.abs(noLimits.sigma),1.35);assert.equal(noLimits.fos,null);assert.equal(noLimits.status,'unchecked');
const tipLeft=F.evaluate(r,cfg,{x:450,side:'left'}).selected,tipRight=F.evaluate(r,cfg,{x:450,side:'right'}).selected;near(Math.abs(tipLeft.tau),.015);near(tipRight.V,0);assert.equal(tipRight.fos,null);assert.equal(tipRight.outside,true);assert.equal(tipRight.status,'unchecked');
assert.throws(()=>F.evaluate(r,cfg,{x:451,side:'right'}),/Invalid strength station/);
const centre=F.evaluate(r,cfg,{x:225,side:'right',z:0}).selected;near(centre.sigma,0);near(centre.tau,.015);
const fibre=F.evaluate(r,cfg,{x:225,side:'right',z:-5}).selected;near(fibre.sigma,-1.35);near(fibre.tau,0);assert.throws(()=>F.evaluate(r,cfg,{x:225,side:'right',z:6}),/Depth/);
for(const [sx,sz,tau]of [[100,0,0],[-100,0,0],[0,0,25],[80,-20,30],[0,0,0]]){const m=F.mohr(sx,sz,tau);near(m.sigma1+m.sigma2,sx+sz);near(m.sigma1*m.sigma2,sx*sz-tau*tau);near(m.vm,Math.sqrt(sx*sx-sx*sz+sz*sz+3*tau*tau));if(m.thetaDeg!==null){const a=m.thetaDeg*Math.PI/180;near((sx-sz)/2*Math.cos(2*a)+tau*Math.sin(2*a)+m.center,m.sigma1);near(-(sx-sz)/2*Math.sin(2*a)+tau*Math.cos(2*a),0);}}
assert.equal(F.mohr(0,0,0).thetaDeg,null);assert.throws(()=>F.mohr(NaN,0,0),/Finite/);
assert.equal(F.evaluate(r,{}).status,'unchecked');assert.equal(F.evaluate(r,{layers:[{yield:27}]}).status,'unchecked');
assert.equal(F.evaluate(r,{requiredFos:2,layers:[{yield:2}]}).status,'exceeded');assert.equal(F.evaluate(r,{requiredFos:2,layers:[{yield:4}]}).status,'margin');
assert.equal(F.evaluate(r,{...cfg,deflectionLimit:1}).deflection.status,'exceeded');
assert.equal(F.evaluate(B.solve({...model,E:1}),cfg).status,'model','large displacement must not receive an unqualified green result');
a=F.evaluate(r,{criterion:'separate',requiredFos:1,layers:[{tension:2,compression:100,shear:100}]});assert.equal(a.status,'exceeded');assert.ok(a.critical.sigma>0);assert.match(a.critical.criterion,/tensile/);
assert.equal(F.evaluate(r,{criterion:'separate',requiredFos:1,layers:[{tension:100,compression:100}]}).status,'unchecked');
r=B.solve({...model,loads:[{kind:'point',position:450,force:-2}]});a=F.evaluate(r,{criterion:'separate',requiredFos:1,layers:[{tension:2,compression:100,shear:100}]});assert.ok(a.critical.z<0);assert.ok(a.critical.sigma>0);
r=B.solve({...model,loads:[]});a=F.evaluate(r,cfg);assert.equal(a.status,'within');assert.equal(a.maxBound,0);assert.equal(a.fosLower,null);assert.equal(a.zeroDemand,true);
for(const raw of [{requiredFos:0},{requiredFos:.5},{layers:[{yield:-1}]},{layers:[{yield:Infinity}]},{criterion:'<script>'},{layers:'wrong'}])assert.throws(()=>F.normalize(raw));
const sections=[{shape:'rectangle',width:20,height:10},{shape:'circle',diameter:10},{shape:'tube',outerDiameter:20,thickness:1},{shape:'box',width:20,height:15,thickness:1},{shape:'ibeam',height:20,flangeWidth:16,flangeThickness:2,webThickness:1},{shape:'layered',width:20,height:10,topThickness:5,modulusRatio:3,densityRatio:1}];
for(const section of sections){
 r=B.solve({...model,section,loads:[{kind:'distributed',start:0,end:450,qStart:.001,qEnd:.003},{kind:'point',position:230,force:-.2},{kind:'moment',position:155,moment:10}]});a=F.evaluate(r,{requiredFos:1,layers:[{yield:10},{yield:8}]});const p=S.properties(section);
 for(let k=0;k<=80;k++)for(const side of ['left','right']){const x=450*k/80,f=B.internalForces(r,x,side);for(const zrow of S.shearProfile(p,f.V,55)){const layer=section.shape==='layered'&&zrow.z>p.interfaceZ?1:0,sigma=S.normalStress(p,f.M,zrow.z),util=Math.hypot(sigma,Math.sqrt(3)*zrow.tau)/(layer===1?8:10);assert.ok(util<=a.maxBound*(1+1e-8)+1e-12,`${section.shape} envelope must bound dense independent stresses`);}}
 assert.ok(a.cells.every(c=>c.bound>=c.ratio-1e-12));
}
r=B.solve({...model,section:sections.at(-1)});const p=S.properties(r.section),top=Math.abs(S.normalStress(p,-900,5));a=F.evaluate(r,{requiredFos:1,layers:[{yield:1e6},{yield:top/2}]});assert.equal(a.status,'exceeded');assert.equal(a.critical.layer,1);assert.equal(a.critical.z,5);assert.equal(F.evaluate(r,{requiredFos:1,layers:[{yield:1e6}]}).status,'unchecked');
const lower=F.evaluate(r,cfg,{x:225,side:'right',z:p.interfaceZ,depthSide:-1}).selected,upper=F.evaluate(r,cfg,{x:225,side:'right',z:p.interfaceZ,depthSide:1}).selected;near(upper.sigma,3*lower.sigma);near(upper.tau,lower.tau);assert.equal(lower.layer,0);assert.equal(upper.layer,1);
for(const load of [{kind:'elliptic',start:25,end:425,shape:'middle',total:2},{kind:'parabolic',start:0,end:450,shape:'start',total:-1},{kind:'table',points:[[0,0],[100,.006],[200,-.003],[450,0]]}]){
 r=B.solve({...model,supports:[{x:0,kind:'pin'},{x:450,kind:'roller'}],loads:[load]});a=F.evaluate(r,cfg);for(let x=0;x<=450;x+=2){const f=B.internalForces(r,x);for(const z of [-5,-2.5,0,2.5,5]){const sig=-f.M*z/(20*10**3/12),tau=1.5*f.V/(20*10)*(1-z*z/25);assert.ok(Math.hypot(sig,Math.sqrt(3)*tau)/27<=a.maxBound*(1+1e-8)+1e-12);}}
}
r=B.solve({...model,loads:[],selfWeight:true});a=F.evaluate(r,cfg);assert.ok(a.maxRatio>0);assert.ok(a.maxBound>=a.maxRatio);
console.log('Strength engine PASS: analytic bending/yield/FoS, same-point VM, amber margin, missing/invalid data, reversed-load tensile fibre, no-load demand, FE deflection maximum, separate limits, all six shapes, conservative envelope vs independent dense stresses, discontinuities and distinct layer strengths.');
