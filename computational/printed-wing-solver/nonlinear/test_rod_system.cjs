const assert=require('node:assert/strict'),R=require('./wing_rod_system.js');
const L=900,EI=6.8e7,Er=70000,r=2,A=Math.PI*r*r,I=Math.PI*r**4/4,EIrod=Er*I;
function model(n,P,offsets=[0]){const nodes=Array.from({length:n+1},(_,i)=>[L*i/n,0,0]),mk=(ei,ea)=>Array.from({length:n},(_,i)=>({a:i,b:i+1,EA:ea,EI22:ei,EI33:ei,GJ:ei,orientation:[0,1,0]})),elements=mk(EI,1e7);elements.at(-1).consistentLoad=Array(13).fill(0);elements.at(-1).consistentLoad[7]=P;return {nodes,elements,rods:offsets.map(z=>({nodes:nodes.map(p=>[p[0],0,z]),elements:mk(EIrod,Er*A)}))};}
let results=[];
for(const n of [12,24,48]){
 const P=.1,ks=3*EI/L**3,kr=3*EIrod/L**3,g=.25;
 for(const force of [.01,P,-P]){const m=model(n,force),s=R.solve({...m,mode:'sleeve',gap:g,contactStations:[n]});const free=force/ks,ref=Math.abs(free)<=g?free:(force+Math.sign(force)*kr*g)/(ks+kr),tip=s.displacements.at(-1)[1];assert.ok(Math.abs(tip-ref)<1e-7);results.push({mode:'sleeve-tip-collar',n,force,reference:ref,tip,verification:s.verification});}
 const b=R.solve({...model(n,P,[-10,10]),mode:'bonded'}),ref=P*L**3/(3*(EI+2*Er*(I+A*100))),tip=b.displacements.at(-1)[1];
 // Offset is z; transverse y bending uses z rotation, so use transverse z for eccentric composite test.
 const m=model(n,P,[-10,10]);m.elements.at(-1).consistentLoad[7]=0;m.elements.at(-1).consistentLoad[8]=P;
 const bb=R.solve({...m,mode:'bonded'}),tt=bb.displacements.at(-1)[2];if(n===48)assert.ok(Math.abs(tt/ref-1)<.001);else assert.ok(Math.abs(tt/ref-1)<.005);results.push({mode:'bonded-eccentric-composite',n,reference:ref,tip:tt,verification:bb.verification});
}
// Continuous sleeve: for prismatic coaxial cantilevers under tip force the
// relative cubic profile reaches its maximum at the tip. The tip-collar exact
// reference therefore also solves the continuous-sleeve contact problem.
for(const angle of [0,.63,1.4])for(const gap of [0,.25,2]){
 const m=model(24,.1),p=.1,ks=3*EI/L**3,kr=3*EIrod/L**3;
 m.elements.at(-1).consistentLoad[7]=p*Math.cos(angle);m.elements.at(-1).consistentLoad[8]=p*Math.sin(angle);
 const r=R.solve({...m,mode:'sleeve',gap}),reference=p/ks<=gap?p/ks:(p+kr*gap)/(ks+kr),tip=Math.hypot(...r.displacements.at(-1).slice(1));
 assert.ok(Math.abs(tip-reference)<1e-7);assert.ok(r.verification.maxPenetration<1.01e-6);assert.ok(r.verification.energyError<1e-7);
 results.push({mode:'continuous-circular-sleeve',angle,gap,reference,tip,verification:r.verification});
}
// Axial shell loading creates no tangential sleeve transfer to the rod.
{const m=model(12,0);m.elements.at(-1).consistentLoad[6]=1;const r=R.solve({...m,mode:'sleeve',gap:.25});assert.ok(r.rodElements.every(es=>es.every(e=>Math.max(...e.ul.map(Math.abs))<1e-10)));assert.ok(Math.abs(r.displacements.at(-1)[0]-L/1e7)<1e-10);}
// Independent torsion reference: bonded rod shares torque; a coaxial
// frictionless sleeve cannot transmit spin torque to its rod.
for(const mode of ['bonded','sleeve']){const m=model(12,0),torque=10;m.elements.at(-1).consistentLoad[9]=torque;const rr=R.solve({...m,mode,gap:.25}),reference=torque*L/(EI+(mode==='bonded'?EIrod:0)),tip=rr.rotations.at(-1)[0];assert.ok(Math.abs(tip/reference-1)<1e-8);if(mode==='sleeve')assert.ok(rr.rodElements.every(es=>es.every(e=>Math.max(...e.ul.map(Math.abs))<1e-10)));results.push({mode:'pure-torsion-'+mode,reference,tip,units:'rad',verification:rr.verification});}
assert.throws(()=>R.solve({...model(4,.1),mode:'sleeve',gap:-1}),/clearance/);
assert.throws(()=>R.solve({...model(4,.1),mode:'sleeve',gap:.25,maxIterations:0}),/converge/);
const profiles=[];
for(const mode of ['bonded','sleeve']){const m=model(24,.1),radius=4,ir=Math.PI*radius**4/4,ar=Math.PI*radius**2;for(const e of m.rods[0].elements){e.EA=Er*ar;e.EI22=e.EI33=e.GJ=Er*ir;}const rr=R.solve({...m,mode,gap:.25}),ks=3*EI/L**3,kr=3*Er*ir/L**3,tip=mode==='bonded'?.1/(ks+kr):(.1+kr*.25)/(ks+kr);assert.ok(Math.abs(rr.displacements.at(-1)[1]-tip)<1e-7);for(let i=0;i<m.nodes.length;i++){const eta=i/24;profiles.push({mode,y_mm:eta*L,solver_mm:rr.displacements[i][1],reference_mm:tip*eta**2*(3-eta)/2});}}
const report={passed:true,geometry:{length_mm:L,carrier_EI_Nmm2:EI,rod_E_MPa:Er,rod_radius_mm:r},limits:{finest_bonded_relative:.001,sleeve_tip_absolute_mm:1e-7,penetration_mm:1e-6},matchedProfiles:{length_mm:L,carrier_EI:EI,rod_radius_mm:4,rod_E_MPa:Er,force_N:.1,clearance_mm:.25,rows:profiles},references:{bonded:'Euler-Bernoulli composite EI = EI_carrier + 2*Erod*(Irod+Arod*offset^2), symmetric rods at z=+/-10 mm; tip=P L^3/(3 EI).',sleeve:'Two independent cantilever compliances ks=3EI/L^3, kr=3ErIr/L^3. Before contact w=P/ks; after contact w=(P+sign(P)*kr*gap)/(ks+kr). Continuous prismatic sleeve has the same exact solution because the relative cubic profile is below gap at every interior station.'},results};
const fs=require('fs'),path=require('path'),out=path.resolve(__dirname,'../../../output/rod-model-current');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'analytic-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,caseCount:results.length,finestBonded:results.filter(r=>r.mode==='bonded-eccentric-composite').at(-1),worstSleeveError:Math.max(...results.filter(r=>r.mode!=='bonded-eccentric-composite').map(r=>Math.abs(r.tip-r.reference)))},null,2));
