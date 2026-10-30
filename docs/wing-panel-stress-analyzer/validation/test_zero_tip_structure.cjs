// Independent constant-traction triangle and homogeneous exact delta beam.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'../..'),web=path.join(root,'computational/printed-wing-solver/web');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8'),sharedRequire=createRequire(path.join(web,'engine.js'));
const ctx=vm.createContext({module:{exports:{}},require:sharedRequire,console,performance,TextEncoder,TextDecoder,URL,Buffer});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);
const A=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(web,'wing_closed_tip_stress.js'),'utf8'),ctx);const C=ctx.module.exports;
let start=html.indexOf('const WingEngine ='),end=html.indexOf('module.exports = WingEngine;',start)+'module.exports = WingEngine;'.length;
vm.runInContext(html.slice(start,end),ctx);const E=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'ui/wing-aero-ui.js'),'utf8'),ctx);const U=ctx.module.exports;
const near=(a,b,t=1e-8,label='')=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),label+': '+a+' != '+b);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const geometry={naca:'0020',semiSpan:130,rootChord:160,tipChord:0,planform:'delta',skin:.8,te:.8,cavityStart:.12,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:0,customInteriorRibs:[],ribThickness:1.6,cap:2,sweepDeg:0,dihedralDeg:0};
const g=E.makeGeometry(geometry),L=g.semiSpan,c0=g.rootChord,traction=[.0001,.0002,.0003];
function cumulative(y){const s=L-y,I0=c0*s*s/(2*L),Iy=y*I0+c0*s**3/(6*L),Ix=c0*I0-c0*c0*s**3/(6*L*L);return [...traction.map(t=>t*I0),traction[2]*Iy,-traction[2]*Ix,traction[1]*Ix-traction[0]*Iy];}
function rows(n,whole=L){return Array.from({length:n},(_,i)=>{const a=whole*i/n,b=whole*(i+1)/n,u=cumulative(a),v=cumulative(b);return [a,b,...u.map((x,k)=>x-v[k])];});}
const source={geometry,load:{kind:'custom',items:[],selfWeight:false},nGrid:31,nElements:8,nSections:3};
const evidence=[];
for(const n of [1,4,16]){
 const aero={kind:'aeroStrips',lineFraction:.25,strips:rows(n),label:'Independent uniform surface traction'},snapshot=JSON.stringify(aero),r=E.solve({...source,aeroLoad:aero}),rep=A.stripRepresentation(g,aero.strips,.25);
 for(const eta of [0,.25,.5,.75,.95,.999,.99999]){
   const y=L*eta,c=r.analysis3D.cutAt(y),aw=r.analysis3D.aeroLoad.cutAt(y),given=cumulative(y),shift=cross(c.reference,given.slice(0,3)),expected=[...given.slice(0,3),...given.slice(3).map((v,k)=>v-shift[k])],w=A.outboardOfStation(g,rep,y,.25);
   [...aw.force,...aw.moment].forEach((v,k)=>near(v,expected[k],1e-8,'six physical cut resultants'));
   w.forEach((v,k)=>near(v,given[k],1e-8,'panel-transfer reconstruction'));
   near(c.recoveryResidual,0,1e-8,'normal stress moment closure');
 }
 assert.equal(JSON.stringify(aero),snapshot);assert.equal(r.geometry.tipChord,0);assert.equal(r.analysis3D.evaluateStress(L,[0,0]).resolved,false);
 const br=r.analysis3D.bending.at(0);near(br.verticalMm,0);near(br.chordwiseMm,0);near(br.slopeVertical,0);near(br.slopeChordwise,0);
 evidence.push({strips:n,root_force:r.analysis3D.aeroLoad.appliedWrench.force,root_moment:r.analysis3D.aeroLoad.appliedWrench.momentAboutRoot,normalStressRecovery:r.verification.normalStressEquilibriumRelativeResidual});
}
for(const change of [{sweepDeg:1},{dihedralDeg:1},{twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'0020'},incidenceDeg:1},{eta:1,airfoil:{kind:'naca4',code:'0020'},incidenceDeg:0}]}])assert.throws(()=>E.solve({...source,geometry:{...geometry,...change},aeroLoad:{kind:'aeroStrips',lineFraction:.25,strips:rows(1)}}),/zero|sweep|dihedral|incidence/i);
// A rectangular homothetic solid section supplies an independent closed-form
// check of the improper bending kernel; no engine section integrator is used.
const B=10,H=2,span=100,modulus=70000,F=1,I0=B*H**3/12,q0=2*F/span,K=q0*span**3/(6*modulus*I0);
const cg={...geometry,semiSpan:span,rootChord:B,skin:.1,te:.1,cap:.1,spars:[],stations:null,cavityStart:.2,cavityEnd:.8};
const chord=y=>B*(1-y/span),G={chordAt:(_,y)=>chord(y),stationAt:()=>({incidenceDeg:0}),airfoilAt:()=>({}),transformPoint:(_,y,p)=>[B-chord(y)+p[0],y,p[1]]};
const pi=p=>{if(!p.length)return [0,0,0,0,0,0];const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...zs),d=Math.max(...zs),A=(b-a)*(d-c);return [A,A*(c+d)/2,A*(a+b)/2,A*(c*c+c*d+d*d)/3,A*(a*a+a*b+b*b)/3,A*(a+b)*(c+d)/4];};
const tools={normalize:()=>({g:cg,pla:{E:modulus,rho:1,nu:.3},rod:{},asm:{seamsBonded:true},load:{kind:'custom',items:[],selfWeight:false},crit:{}}),polyIntegrals:pi,Geometry:G,chordAt:(_,y)=>chord(y),E:{ribStations:()=>[],seams:()=>[],cavityTipLimit:()=>0,outerContour:(_,y)=>{const c=chord(y),h=H*c/B;return [[0,-h/2],[c,-h/2],[c,h/2],[0,h/2]];},sparParts:()=>[]}};
const area=B*span/2,t=F/area;
function boxCum(y){const s=span-y,a=B*s*s/(2*span),iy=y*a+B*s**3/(6*span),ix=B*a-B*B*s**3/(6*span*span);return [0,0,t*a,t*iy,-t*ix,0];}
const bench=[];
for(const n of [1,4,12]){
 const load={kind:'aeroStrips',lineFraction:.25,strips:Array.from({length:n},(_,i)=>{const a=span*i/n,b=span*(i+1)/n,x=boxCum(a),y=boxCum(b);return [a,b,...x.map((v,k)=>v-y[k])];})};
 const r=C.solve({aeroLoad:load,nGrid:21},tools);
 for(const eta of [.1,.5,.9,.99,.9999]){const y=eta*span,s=span-y,b=r.analysis3D.bending.at(y);near(b.verticalMm,K*(y-s*Math.log(span/s)),2e-7,'exact delta bending');near(b.slopeVertical,K*Math.log(span/s),2e-7,'logarithmic delta slope');const c=chord(y);near(r.analysis3D.evaluateStress(y,[c/2,H*c/(2*B)]).value,-q0*H*span**2/(12*I0),2e-6,'bounded signed tip stress');}
 near(r.analysis3D.bending.tip.verticalMm,K*span,2e-6,'finite improper tip translation');assert.equal(r.analysis3D.bending.tip.slopeFinite,false);assert.ok(Number.isNaN(r.analysis3D.bending.tip.slopeVertical));
 bench.push({strips:n,computedTipMm:r.analysis3D.bending.tip.verticalMm,exactTipMm:K*span,tipSlope:r.analysis3D.bending.tip.slopeStatus});
}
// Counteracting distributed free couples can cancel the logarithmic leading
// curvature. Nonzero force/couple components do not prove divergent slope.
const cancel=C.solve({aeroLoad:{kind:'aeroStrips',lineFraction:.25,strips:[[0,span,0,0,F,0,0,0]]},nGrid:21},tools);
assert.ok(['finite','undetermined-leading-cancellation'].includes(cancel.analysis3D.bending.tip.slopeStatus),JSON.stringify(cancel.analysis3D.bending.tip));
const rootAero={kind:'aeroStrips',lineFraction:.25,strips:rows(4)},extraLoad={kind:'custom',items:[{kind:'point',position:L/2,force:.25,fraction:.25}],selfWeight:true};
const extra=E.solve({...source,load:extraLoad,aeroLoad:rootAero}),onlyExtra=E.solve({...source,load:extraLoad}),onlyAero=E.solve({...source,aeroLoad:rootAero});
const er=extra.analysis3D.cutAt(0),xr=onlyExtra.analysis3D.cutAt(0),ar=onlyAero.analysis3D.cutAt(0);
er.force.forEach((v,k)=>near(v,xr.force[k]+ar.force[k],1e-8,'custom force plus self weight retained'));
er.moment.forEach((v,k)=>near(v,xr.moment[k]+ar.moment[k],1e-8,'custom moment plus self weight retained'));
const seq={sequence:'standard',flow:{speed:15,density:1.225,alphaDeg:4,viscosity:1.81e-5,speedOfSound:340.29},levels:A.sequenceMeshes('standard').map(m=>({...m,strips:rows(m.spanPanels),coefficients:{CL:.5,CLTrefftz:.5,CDpressure:.01,CDiTrefftz:.01,Cm:-.05},roundedTip:null}))};
const combined=A.combineSequence(g,seq),record=U.recordFromSequence(seq,'0'.repeat(64)),result=E.solve({...source,aeroLoad:U.engineLoad(combined)}),admission=U.admit(A,g,record,combined,result);
assert.ok(admission.admitted,JSON.stringify(admission.failed));assert.equal(admission.claims.twist,'withheld');assert.equal(admission.claims.aeroelastic,'not assessed');
const report={status:'passed',independentUniformTriangularSurfaceTraction:evidence,independentHomotheticDeltaBeam:bench,scopedAdmission:admission.mode,anglesRejected:true,exactZeroTipRetained:true,sourceInputImmutable:true,opposingAeroLeadingTermsCancel:cancel.analysis3D.bending.tip.slopeStatus,customLoadsAndSelfWeightRetained:true};
fs.writeFileSync(path.join(__dirname,'ZERO_TIP_STRUCTURE_REVIEW.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
