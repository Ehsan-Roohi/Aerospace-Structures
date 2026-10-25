import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';const require=createRequire(import.meta.url),E=require('./engine.js');
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(const spatial of [false,true]){
 const geometry={naca:'0012',rootChord:160,tipChord:160,semiSpan:300,modules:1,rodFractions:[],interiorRibs:0,...(spatial?{airfoil:{kind:'naca4',code:'0012'}}:{})},base={geometry,load:{kind:'tip',tipForce:0,tipFraction:.25,selfWeight:true},nElements:12,nSections:3,nGrid:101};
 const r=E.solve(base),w=r.load.gravitySummary.weightN,L=300;
 close(w,r.mass.total*.00981);close(r.appliedForce,-w);assert.ok(r.deflection.at(-1)<0);assert.ok(r.load.items.filter(p=>p.gravity).every(p=>p.localPoint.every(Number.isFinite)));
 const body=(r.mass.shell+r.mass.spars+r.mass.rods)*.00981,tipCap=r.mass.caps*.00981/2,EI=r.sections[0].EIf,expected=-body*L**3/(8*EI)-tipCap*L**3/(3*EI);
 close(r.deflection.at(-1),expected,spatial?2e-4:3e-4);
 const withLift=E.solve({...base,load:{...base.load,tipForce:1}}),liftOnly=E.solve({...base,load:{...base.load,tipForce:1,selfWeight:false}});close(withLift.appliedForce,1-w);close(withLift.deflection.at(-1),r.deflection.at(-1)+liftOnly.deflection.at(-1),1e-7);
 if(spatial){close(r.analysis3D.appliedWrench.momentAboutRoot[0],-body*L/2-tipCap*L);close(r.analysis3D.reactions.find(q=>q.dof===2).value,w,1e-6);}
 const clone=structuredClone(base);clone.geometry.ribThickness=2;clone.geometry.customInteriorRibs=[80,190];clone.load.tipMass=8;const ribbed=E.solve(clone);close(ribbed.load.gravitySummary.weightN,ribbed.mass.total*.00981,1e-5);
}
const tilted=E.solve({geometry:{airfoil:{kind:'naca4',code:'2412'},modules:1,rodFractions:[],sweepDeg:15,dihedralDeg:8},load:{kind:'flight',aircraftMass:.2,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false,selfWeight:true},nElements:8,nSections:3,nGrid:101});
close(tilted.appliedForce,.981-tilted.mass.total*.00981,1e-5);assert.ok(tilted.analysis3D.verification.forceError<1e-6);assert.ok(Number.isFinite(tilted.twist.at(-1)));
assert.throws(()=>E.normalize({load:{kind:'flight',inertiaRelief:true,selfWeight:true}}),/not both/);
const template=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8');assert.ok(template.includes('data-quick-material="mat-spar"'));assert.ok(!template.includes('id="ws${i}_name"'));assert.ok(template.includes('selfWeight:{value:'));
console.log('PASS: 1-g mass conservation, gravity-only cantilever analytical displacement and wrench, lift/weight linear superposition, rib/cap/sensor masses, duplicate inertia prevention, material UI wiring.');
