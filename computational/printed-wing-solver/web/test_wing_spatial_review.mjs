// Independent physical review of the integrated spatial-wing route. References
// below use explicit aircraft-coordinate geometry, elementary integration and
// classical cantilever work, rather than the solver's residual calculator.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),S=require('./wing_spars.js'),F=require('./wing_frame3d.js');
let checks=0;const near=(a,b,abs=1e-7,rel=1e-7,label='quantity')=>{assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=abs+rel*Math.max(Math.abs(a),Math.abs(b)),`${label}: ${a} != ${b}`);checks++;};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,k)=>a.map(v=>v*k),norm=a=>Math.hypot(...a);
const clone=x=>JSON.parse(JSON.stringify(x)),vector=(a,b,abs=1e-7,rel=1e-7,label='vector')=>a.forEach((v,i)=>near(v,b[i],abs,rel,`${label}[${i}]`));
const simpson=(fn,a,b,n=1600)=>{let s=fn(a)+fn(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*fn(a+(b-a)*i/n);return s*(b-a)/(3*n);};
const material={...S.MAT},spar={fraction:.3,length:300,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material};
const base={geometry:{naca:'2412',semiSpan:300,rootChord:160,tipChord:120,modules:1,rodFractions:[],interiorRibs:2,spars:[spar,{...spar,fraction:.65}],sweepDeg:20,dihedralDeg:8,twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:4},{eta:.5,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:2},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:-3}]},assembly:{seamsBonded:true},load:{kind:'custom',items:[{kind:'point',position:265,force:1.2,fraction:.68},{kind:'distributed',start:0,end:300,qStart:.002,qEnd:.004,fraction:.35},{kind:'elliptic',start:50,end:250,shape:'end',peak:.006,fraction:.55}]},nSections:3,nElements:8,nGrid:31};
// Independent geometry convention: x aft, y projected span, z up; positive
// incidence raises the leading edge, sections stay in aircraft x-z planes.
function physicalPoint(g,y,x,z=0){
  const c=g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan,eta=y/g.semiSpan,ss=g.stations||[];let incidence=0;
  if(ss.length){let j=0;while(j<ss.length-2&&eta>ss[j+1].eta)j++;const t=(eta-ss[j].eta)/(ss[j+1].eta-ss[j].eta);incidence=(1-t)*ss[j].incidenceDeg+t*ss[j+1].incidenceDeg;}
  const a=incidence*Math.PI/180,p=(g.twistReferenceFraction??.25)*c,xle=y*Math.tan((g.sweepDeg||0)*Math.PI/180)+(g.sweepReferenceFraction||0)*(g.rootChord-c),zle=y*Math.tan((g.dihedralDeg||0)*Math.PI/180);
  return [xle+p+(x-p)*Math.cos(a)+z*Math.sin(a),y,zle-(x-p)*Math.sin(a)+z*Math.cos(a)];
}
function loadReference(g){
  const chord=y=>g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan,point=physicalPoint(g,265,.68*chord(265)),force=1.2+.003*300+.006*200*Math.PI/4;
  const moment=[1.2*point[1],-1.2*point[0],0];
  const q=y=>.002+.002*y/300;
  // Break at the incidence law's middle station; no solver quadrature reused.
  for(const [a,b]of [[0,150],[150,300]]){moment[0]+=simpson(y=>y*q(y),a,b);moment[1]-=simpson(y=>physicalPoint(g,y,.35*chord(y))[0]*q(y),a,b);}
  // For the end-peaked ellipse, y=50+200*(1-cos(theta)); q dy =
  // peak*length*sin(theta)^2 dtheta removes the square-root endpoint.
  const thetaMid=Math.acos(.5);
  for(const [a,b]of [[0,thetaMid],[thetaMid,Math.PI/2]]){
    moment[0]+=simpson(t=>{const y=50+200*(1-Math.cos(t));return y*.006*200*Math.sin(t)**2;},a,b);
    moment[1]-=simpson(t=>{const y=50+200*(1-Math.cos(t));return physicalPoint(g,y,.55*chord(y))[0]*.006*200*Math.sin(t)**2;},a,b);
  }
  return {force:[0,0,force],moment};
}
// Independently classify physical loads against an arbitrary normal plane.
// Sign-change brackets and Simpson integration are separate from engine code.
function normalCutReference(g,reference,normal){
 const chord=y=>g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan,out=[0,0,0,0,0,0];
 const addPoint=(P,force)=>{const v=[0,0,force],m=cross(sub(P,reference),v);for(let k=0;k<6;k++)out[k]+=[...v,...m][k];};
 const pp=physicalPoint(g,265,.68*chord(265));if(dot(sub(pp,reference),normal)>=0)addPoint(pp,1.2);
 function integrate(a,b,point,weight){
  const signed=t=>dot(sub(point(t),reference),normal),cuts=[a,b];let lo=a,fl=signed(a);
  for(let i=1;i<=32;i++){const hi=a+(b-a)*i/32,fh=signed(hi);if(fl*fh<0){let u=lo,v=hi,fu=fl;for(let j=0;j<48;j++){const m=(u+v)/2;if(signed(m)*fu>0)u=m;else v=m;}cuts.push((u+v)/2);}lo=hi;fl=fh;}
  cuts.sort((u,v)=>u-v);for(let i=1;i<cuts.length;i++){const u=cuts[i-1],v=cuts[i];if(signed((u+v)/2)<0)continue;for(let k=0;k<6;k++)out[k]+=simpson(t=>{const f=[0,0,weight(t)],m=cross(sub(point(t),reference),f);return [...f,...m][k];},u,v,800);}
 }
 for(const [lo,hi]of [[0,150],[150,300]])integrate(lo,hi,y=>physicalPoint(g,y,.35*chord(y)),y=>.002+.002*y/300);
 for(const [lo,hi]of [[0,Math.acos(.5)],[Math.acos(.5),Math.PI/2]])integrate(lo,hi,t=>{const y=50+200*(1-Math.cos(t));return physicalPoint(g,y,.55*chord(y));},t=>.006*200*Math.sin(t)**2);
 return {force:out.slice(0,3),moment:out.slice(3)};
}
const r=E.solve(base),a=r.analysis3D;assert.ok(a);checks++;
const expected=loadReference(base.geometry);vector(a.verification.totalForce,expected.force,2e-8,1e-9,'independent global applied force');vector(a.verification.totalMoment,expected.moment,2e-6,1e-9,'independent global applied moment');
const rootReference=a.referenceCoordinates[0],rootMoment=sub(expected.moment,cross(rootReference,expected.force));vector(a.appliedWrench.force,expected.force,2e-8,1e-9,'all-load applied force');vector(a.appliedWrench.momentAboutRoot,rootMoment,2e-6,1e-9,'all-load moment about equivalent root');
const rootCut=a.cutAt(0),rootHalfspace=normalCutReference(base.geometry,rootCut.reference,rootCut.R[0]);vector(rootCut.force,rootHalfspace.force,2e-8,1e-9,'independent root normal-halfspace force');vector(rootCut.moment,rootHalfspace.moment,2e-6,1e-9,'independent root normal-halfspace moment');
for(let i=0;i<6;i++){const reaction=a.reactions.find(q=>q.dof===i).value;near(reaction,-[...expected.force,...rootMoment][i],3e-5,1e-7,'independent support reaction');}
near(2*a.energy,a.work,1e-8,2e-7,'strain energy versus external work');assert.ok(a.energy>0);checks++;
assert.ok(norm(a.displacements.at(-1))/base.geometry.semiSpan<.01);checks++;
for(const y of [0,125,240])for(const p of [[30,-2],[90,3]])vector(E.spatialPointMotion(r,y,p).point,physicalPoint(base.geometry,y,...p),1e-8,1e-10,'independent physical-point transform');
// Every bond/spar projected section carries both transverse unit forces and
// unit torsion, retaining MPa=N/mm2 and mm thicknesses.
for(const s of a.sectionSamples){assert.ok(s.network&&s.GJ>0&&s.EA>0&&s.area<=1+1e-10);checks++;near(s.network.unitV2[0],1,1e-6);near(s.network.unitV3[1],1,1e-6);near(s.network.unitT[2],1,1e-6);}
// Reversing all loads must reverse ALL six-DOF response and signed normal
// stresses while preserving energy. Do not compare unsigned stress envelopes.
const reversed=clone(base);for(const p of reversed.load.items){if(p.kind==='point')p.force*=-1;else if(p.kind==='distributed'){p.qStart*=-1;p.qEnd*=-1;}else p.peak*=-1;}
const neg=E.solve(reversed);for(let i=0;i<a.displacements.length;i++){vector(neg.analysis3D.displacements[i],scale(a.displacements[i],-1),1e-7);vector(neg.analysis3D.rotations[i],scale(a.rotations[i],-1),1e-9);}
near(neg.analysis3D.energy,a.energy,1e-8);for(const y of [0,120,240])for(const p of [[48,7],[100,-3]]){const positive=E.normalStressLocationAt3D(r,y,p),negative=E.normalStressLocationAt3D(neg,y,p);assert.equal(negative.resolved,positive.resolved);checks++;if(positive.resolved)near(negative.value,-positive.value,1e-8);else{assert.ok(Number.isNaN(positive.value)&&Number.isNaN(negative.value));checks++;}}
// No load means exactly zero response, including reactions and normal stress.
const unloaded=E.solve({...base,load:{kind:'custom',items:[]}});for(const u of [...unloaded.analysis3D.displacements,...unloaded.analysis3D.rotations])vector(u,[0,0,0],0,0,'unloaded response');for(const q of unloaded.analysis3D.reactions)near(q.value,0,0,0);near(unloaded.analysis3D.energy,0,0,0);near(E.normalStressAt3D(unloaded,150,[60,6]),0,0,0);assert.ok(Number.isNaN(E.normalStressAt3D(unloaded,0,[60,6])),'unloaded root still has unresolved local clamp stress');checks++;
// With a constant chord and incidence, changing the geometric twist pivot
// translates the WHOLE physical wing. The load/support geometry translates too;
// it must not alter displacement, rotation, normal stress or strain energy.
const prismatic=clone(base);Object.assign(prismatic.geometry,{tipChord:160,interiorRibs:0,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:6},{eta:1,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:6}],twistReferenceFraction:.1});prismatic.load.items=[{kind:'point',position:300,force:1,fraction:.62}];
const pivotA=E.solve(prismatic),pivotB=E.solve({...prismatic,geometry:{...prismatic.geometry,twistReferenceFraction:.7}}),delta=sub(physicalPoint(pivotB.geometry,0,0),physicalPoint(pivotA.geometry,0,0));
vector(pivotB.analysis3D.displacements.at(-1),pivotA.analysis3D.displacements.at(-1),2e-6);vector(pivotB.analysis3D.rotations.at(-1),pivotA.analysis3D.rotations.at(-1),2e-8);near(pivotB.analysis3D.energy,pivotA.analysis3D.energy,2e-6);
for(const y of [0,150,300]){const pa=E.spatialPointMotion(pivotA,y,[65,5]),pb=E.spatialPointMotion(pivotB,y,[65,5]);vector(sub(pb.point,pa.point),delta,1e-8);assert.equal(pb.resolved,pa.resolved);checks++;if(pa.resolved)vector(pb.displacement,pa.displacement,2e-6);else{assert.equal(pa.displacement,null);assert.equal(pb.displacement,null);checks+=2;}const sa=E.normalStressLocationAt3D(pivotA,y,[65,5]),sb=E.normalStressLocationAt3D(pivotB,y,[65,5]);assert.equal(sa.resolved,sb.resolved);checks++;if(sa.resolved)near(sb.value,sa.value,2e-6);else{assert.ok(Number.isNaN(sa.value)&&Number.isNaN(sb.value));checks++;}}
// Prismatic zero-angle limit has an independent legacy beam comparison. Tapered
// wings additionally change their physical shear-centre path, so their legacy
// scalar-beam and spatial approximations are not asserted identical.
const straight=clone(prismatic);Object.assign(straight.geometry,{naca:'0012',sweepDeg:0,dihedralDeg:0,stations:null,twistEnabled:false});
const old=E.solve(straight),tiny=E.solve({...straight,geometry:{...straight.geometry,sweepDeg:1e-6,dihedralDeg:1e-6}});
near(tiny.deflection.at(-1),old.deflection.at(-1),2e-5,2e-3,'zero-angle limit vertical deflection');near(tiny.twist.at(-1),old.twist.at(-1),2e-7,5e-3,'zero-angle limit twist');near(tiny.mass.total,old.mass.total,1e-7,1e-9,'projected volume/mass preservation');
// Mesh refinement checks the actual curved, tapered, twisted two-spar wing.
const medium=E.solve({...base,nElements:16}),fine=E.solve({...base,nElements:32}),u8=a.displacements.at(-1),u16=medium.analysis3D.displacements.at(-1),u32=fine.analysis3D.displacements.at(-1),d8=norm(sub(u8,u16)),d16=norm(sub(u16,u32));
assert.ok(d16<d8*1.2+1e-6,`mesh error did not diminish: ${d8}, ${d16}`);checks++;assert.ok(d16/norm(u32)<.01);checks++;
// A spatially oriented classical cantilever has a closed-form work reference,
// independently exercising all global force/moment components.
const axis=[.3,.8,.5196152422706632],length=280,e1=scale(axis,1/norm(axis)),e2=[.9363291775690445,-.3511234415883917,0],e3=cross(e1,e2),R=[e1,e2,e3],f=[1.2,-.7,2.1],m=[4,-3,5],localF=R.map(q=>dot(q,f)),localM=R.map(q=>dot(q,m)),section={EA:2.1e6,EI22:4.2e7,EI33:6.3e8,GJ:1.8e7,orientation:e2};
const beam=F.solve({nodes:[[0,0,0],scale(e1,length)],elements:[{a:0,b:1,...section}],loads:[{node:1,force:f,moment:m}]});
const expectedWork=localF[0]**2*length/section.EA+localM[0]**2*length/section.GJ+localF[1]**2*length**3/(3*section.EI33)+localM[2]**2*length/section.EI33+localF[1]*localM[2]*length**2/section.EI33+localF[2]**2*length**3/(3*section.EI22)+localM[1]**2*length/section.EI22-localF[2]*localM[1]*length**2/section.EI22;
near(beam.work,expectedWork,1e-8,1e-8,'independent full 3D cantilever work');
// Integrate the reported stress independently over the actual shell triangles
// and the separate cap/web polygons. Linear sigma times linear section moment
// arms is integrated exactly by the three-point barycentric triangle rule.
const sectionY=150,sectionCut=a.cutAt(sectionY),sec=E.sectionAt(base,sectionY),sectionInc=base.geometry.stations[1].incidenceDeg*Math.PI/180,ex=[Math.cos(sectionInc),0,-Math.sin(sectionInc)],ez=[Math.sin(sectionInc),0,Math.cos(sectionInc)],tangent=sectionCut.R[0],two=scale(sub(ex,scale(tangent,dot(tangent,ex))),1/norm(sub(ex,scale(tangent,dot(tangent,ex))))),three=cross(tangent,two),B=[[dot(two,ex),dot(two,ez)],[dot(three,ex),dot(three,ez)]],areaFactor=Math.abs(B[0][0]*B[1][1]-B[0][1]*B[1][0]),integrated=[0,0,0];
assert.equal(sectionCut.endZone,null);checks++;
const sectionExpected=normalCutReference(base.geometry,sectionCut.reference,tangent);vector(sectionCut.force,sectionExpected.force,2e-8,1e-9,'independent interior normal-halfspace force');vector(sectionCut.moment,sectionExpected.moment,2e-6,1e-9,'independent interior normal-halfspace moment');
function physicalStressAtNormalCoordinates(q2,q3,modulus){
 const P=add(sectionCut.reference,add(scale(two,q2),scale(three,q3))),y=P[1],c=base.geometry.rootChord+(base.geometry.tipChord-base.geometry.rootChord)*y/base.geometry.semiSpan,eta=y/base.geometry.semiSpan,ss=base.geometry.stations;let j=0;while(j<ss.length-2&&eta>ss[j+1].eta)j++;const t=(eta-ss[j].eta)/(ss[j+1].eta-ss[j].eta),angle=((1-t)*ss[j].incidenceDeg+t*ss[j+1].incidenceDeg)*Math.PI/180,pivot=.25*c,xLE=y*Math.tan(base.geometry.sweepDeg*Math.PI/180),zLE=y*Math.tan(base.geometry.dihedralDeg*Math.PI/180),dx=P[0]-xLE-pivot,dz=P[2]-zLE,local=[pivot+Math.cos(angle)*dx-Math.sin(angle)*dz,Math.sin(angle)*dx+Math.cos(angle)*dz];
 const located=E.normalStressLocationAt3D(r,y,local,modulus);assert.ok(located.resolved,'interior projected material point is resolved');near(located.station,sectionY,1e-6,0,'normal-plane material point recovers intended section');return located.value;
}
function triangle(points,modulus,signedArea=false){
 const [p,q,v]=points,area=((q[0]-p[0])*(v[1]-p[1])-(q[1]-p[1])*(v[0]-p[0]))/2,weight=(signedArea?area:Math.abs(area))*areaFactor/3;
 for(const b of [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]]){const pos=[0,1].map(j=>points.reduce((s,x,i)=>s+x[j]*b[i],0)),dx=pos[0]-sectionCut.scLocal[0],dz=pos[1]-sectionCut.scLocal[1],q2=B[0][0]*dx+B[0][1]*dz,q3=B[1][0]*dx+B[1][1]*dz,sigma=physicalStressAtNormalCoordinates(q2,q3,modulus);integrated[0]+=sigma*weight;integrated[1]+=sigma*q3*weight;integrated[2]-=sigma*q2*weight;}
}
for(let i=0;i<sec.mesh.tris.length;i+=3)triangle([0,1,2].map(j=>{const k=sec.mesh.tris[i+j];return [sec.mesh.nodes[2*k],sec.mesh.nodes[2*k+1]];}),r.pla.E);
for(const p of sec.sparInts){const points=p.polygon,area=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-b[0]*a[1];},0),ordered=area<0?[...points].reverse():points;for(let i=1;i<ordered.length-1;i++)triangle([ordered[0],ordered[i],ordered[i+1]],p.m.E,true);}
const physicalExpected=[dot(tangent,sectionExpected.force),dot(two,sectionExpected.moment),dot(three,sectionExpected.moment)];
near(integrated[0],physicalExpected[0],1e-8,1e-9,'independently integrated axial stress resultant');
near(integrated[1],physicalExpected[1],1e-8,1e-9,'independently integrated second-axis bending stress resultant');
near(integrated[2],physicalExpected[2],1e-8,1e-9,'independently integrated third-axis bending stress resultant');
console.log(JSON.stringify({integratedStressResultants:integrated,physicalSectionResultants:physicalExpected,stressResultantRelativeErrors:integrated.map((v,i)=>(v-physicalExpected[i])/Math.max(1,Math.abs(physicalExpected[i])))}));
console.log(`Spatial wing independent review: ${checks} physical geometry, six-resultant, reaction, energy, load-sign, zero-load, reference-pivot, small-angle, normal-stress, projected-spar and mesh checks passed.`);
console.log(JSON.stringify({tipDisplacementMm:u32,coarseToMediumMm:d8,mediumToFineMm:d16,axisIterationChangeMm:a.normalSectionAxisIterationChangeMm,zeroAngleVerticalRelativeDifference:Math.abs(tiny.deflection.at(-1)-old.deflection.at(-1))/Math.abs(old.deflection.at(-1))}));
