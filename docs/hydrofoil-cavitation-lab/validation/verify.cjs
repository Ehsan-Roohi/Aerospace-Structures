// Independent analytic references; no fitted expected cavitation measurements.
const C=require('../cavitation.js'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rows=[],checks=[],gradientStudy=[],profiles={joukowski:[],cavities:[]};
const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
{
 const points=[[0,0],[1,.3],[1.5,.7],[2,.5],[2.4,.05],[3,0]],p=C.geometry(points),alpha=20,a=alpha*Math.PI/180,U=[Math.cos(a),Math.sin(a)];let arc=0;
 const phi=p.map(v=>{const s=arc+v.length/2;arc+=v.length;return 1.7*s-U[0]*v.x-U[1]*v.y+.3;});
 const vt=C.surfaceTangentialSpeed(points,phi,alpha);assert.ok(Math.max(...vt.map(v=>Math.abs(v-1.7)))<1e-12);
 checks.push('manufactured curved-contour total-potential gradient: exact constant tangential speed; no BC-target substitution');
}
for(const n of [20,40,80,160]){
 const points=Array.from({length:n+1},(_,i)=>{const t=i/n,theta=2*t+.12*Math.sin(2*Math.PI*t);return [Math.cos(theta),Math.sin(theta)];}),p=C.geometry(points),alpha=27,a=alpha*Math.PI/180,U=[Math.cos(a),Math.sin(a)];let arc=0;
 const stations=p.map(v=>{const s=arc+v.length/2;arc+=v.length;return s;});
 const phi=p.map((v,i)=>Math.sin(1.3*stations[i])+.2*stations[i]**3-U[0]*v.x-U[1]*v.y),exact=stations.map(s=>1.3*Math.cos(1.3*s)+.6*s*s);
 for(const stencil of [3,5]){
  const vt=C.surfaceTangentialSpeed(points,phi,alpha,[],stencil),errors=vt.map((v,i)=>v-exact[i]);
  gradientStudy.push({panels:n,stencil,rms:rms(errors),maxAllPoints:Math.max(...errors.map(Math.abs))});
 }
}
for(const stencil of [3,5]){
 const r=gradientStudy.filter(v=>v.stencil===stencil);assert.ok(r[3].rms<r[2].rms/(stencil===3?3:10));assert.ok(r[3].maxAllPoints<r[0].maxAllPoints);
}
checks.push('nonlinear manufactured total potential sin(1.3s)+0.2s^3: three-/five-point refinement with ALL endpoint samples retained');
for(const n of [40,80,160]){
 const points=Array.from({length:n+1},(_,i)=>[Math.cos(2*Math.PI*i/n),Math.sin(2*Math.PI*i/n)]),r=C.wetted(points,0,false);
 const error=r.cp.map((cp,i)=>cp-(1-4*Math.sin(2*Math.PI*(i+.5)/n)**2));
 rows.push({reference:'exact circular-cylinder potential flow',panels:n,Cp_RMS:rms(error),linearResidual:r.linearResidual});
}
assert.ok(rows[2].Cp_RMS<.002);assert.ok(rows[0].Cp_RMS>3*rows[1].Cp_RMS&&rows[1].Cp_RMS>3*rows[2].Cp_RMS);
checks.push('non-lifting analytic cylinder: convergent Cp refinement');
const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],div=(a,b)=>{const d=b[0]**2+b[1]**2;return[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
function joukowski(n,alpha){
 const e=.08,R=1+e,lead=-e-R,zle=lead+1/lead,chord=2-zle,a=alpha*Math.PI/180,G=4*Math.PI*R*Math.sin(a);
 const point=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],iz=div([1,0],z);return[(z[0]+iz[0]-zle)/chord,(z[1]+iz[1])/chord];};
 const cp=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],w=[R*Math.cos(t),R*Math.sin(t)],w2=mul(w,w),s=div([R*R*Math.cos(a),R*R*Math.sin(a)],w2),v=div([0,G/(2*Math.PI)],w),J=div([1,0],mul(z,z)),q=div([Math.cos(a)-s[0]+v[0],-Math.sin(a)-s[1]+v[1]],[1-J[0],-J[1]]);return 1-q[0]**2-q[1]**2;};
 return {points:Array.from({length:n+1},(_,i)=>point(2*Math.PI*i/n)),cp,cl:2*G/chord};
}
for(const alpha of [0,4]){
 const errors=[];
 for(const n of [80,160,320]){
  const ref=joukowski(n,alpha),r=C.wetted(ref.points,alpha),error=r.cp.flatMap((v,i)=>r.panels[i].x>.02&&r.panels[i].x<.98?[v-ref.cp(2*Math.PI*(i+.5)/n)]:[]);
  const row={reference:'exact Joukowski conformal-map flow',alphaDeg:alpha,panels:n,Cp_RMS_x_02_to_98:rms(error),cl:r.cl,exactCl:ref.cl,liftAbsoluteError:Math.abs(r.cl-ref.cl),linearResidual:r.linearResidual};rows.push(row);errors.push(row);
  profiles.joukowski.push({alpha,n,points:r.panels.map((p,i)=>({x:p.x,y:p.y,cp:r.cp[i],referenceCp:ref.cp(2*Math.PI*(i+.5)/n)}))});
 }
 assert.ok(errors[2].Cp_RMS_x_02_to_98<.03);assert.ok(errors[2].liftAbsoluteError<.01);
 assert.ok(errors[2].Cp_RMS_x_02_to_98<errors[1].Cp_RMS_x_02_to_98&&errors[1].Cp_RMS_x_02_to_98<errors[0].Cp_RMS_x_02_to_98);
}
checks.push('lifting analytic Joukowski pressure/lift and wake sign');
const mixedChecks=[];
for(const alpha of [0,4]){
 const points=joukowski(160,alpha).points,r=C.mixedBoundaryDiagnostic(points,alpha,Array.from({length:40},(_,i)=>20+i));
 assert.ok(r.potentialError<1e-10);assert.ok(r.normalDerivativeError<1e-10);
 mixedChecks.push({alphaDeg:alpha,...r});
}
checks.push('mixed Dirichlet/Neumann assembly recovers fully-wetted discrete solution; an internal consistency test');
const meshes=[];
for(const resolution of [24,32,48,64]){
 const start=performance.now(),r=C.solve({resolution});
 assert.equal(r.status,'converged-prototype');assert.ok(r.metrics.maxNormalVelocity<1e-5);assert.ok(r.metrics.maxShapeCorrection<1e-6);assert.ok(r.metrics.closureError<1e-10);assert.ok(r.metrics.linearResidual<1e-10);assert.ok(r.metrics.fluxError<1e-6);assert.ok(r.metrics.minimumHeight>=-1e-8);
 const row={resolution,actualBoundaryPanels:r.panels.length,cavityPanels:r.height.length-1,sigma:r.sigma,maximumHeight:r.metrics.maximumHeight,cl:r.coefficients.cl,pressureDragDiagnostic:r.coefficients.pressureDrag,metrics:r.metrics,seconds:(performance.now()-start)/1000};meshes.push(row);
 profiles.cavities.push({resolution,height:r.height,sigma:r.sigma,history:r.history,metrics:r.metrics,coefficients:r.coefficients,panels:r.panels.map(p=>({x:p.x,y:p.y,cp:p.cp,cavity:p.cavity,targetCp:p.targetCp}))});
 if(resolution===48)fs.writeFileSync(path.join(__dirname,'example-result.json'),JSON.stringify(r,null,2)+'\n');
}
assert.ok(meshes[3].metrics.pressureReconstructionRMS<meshes[1].metrics.pressureReconstructionRMS);
assert.ok(Math.abs(meshes[3].sigma-meshes[2].sigma)<Math.abs(meshes[2].sigma-meshes[1].sigma));
checks.push('nonlinear default cavity: mixed BC, source flux, closure, nonintersecting shape, refinement');
assert.equal(C.solve({maxIterations:1}).status,'rejected');
assert.equal(C.solve({detachment:.005,length:.4,resolution:32}).status,'rejected');
assert.throws(()=>C.solve({resolution:Infinity}));assert.throws(()=>C.solve({length:1}));assert.throws(()=>C.solve({recovery:0}));
const water=C.liquid({rho:1000,speed:10,pressureAbsolute:100000,vapourPressure:2000,chord:.2});assert.equal(water.sigma,1.96);assert.equal(water.dynamicPressure,50000);
assert.throws(()=>C.liquid({pressureAbsolute:1000,vapourPressure:2000}));
checks.push('iteration exhaustion / foil intersection / invalid inputs rejected; absolute pressure and sigma units');
const report={version:C.VERSION,date:'2026-10-30',status:'numerical-prototype-verification-only',checks,manufacturedGradientStudy:gradientStudy,analytic:rows,mixedBoundaryAssembly:mixedChecks,cavityMeshStudy:meshes,
 evidenceDistinction:{analytic:'Independent exact fully wetted potential-flow solutions.',cavity:'Internal residual and mesh checks, not independent cavitating-flow validation.',experimental:'Not performed. No experimental points or accuracy percentages are fabricated.'},
 limitations:['Cavity length and detachment are prescribed; sigma is computed.','Closure parameters are explicit example inputs, not calibrated to experiment.','Pressure derivatives near mixed-boundary/recovery junctions remain mesh-sensitive.','Combined-contour pressure drag is diagnostic, not physical cavitation/profile drag.','No re-entrant jet, cloud shedding, 3-D cavity, liquid free surface or structural load transfer.']};
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
fs.writeFileSync(path.join(__dirname,'profiles.json'),JSON.stringify(profiles,null,2)+'\n');
const example=JSON.parse(fs.readFileSync(path.join(__dirname,'example-result.json'),'utf8'));
fs.writeFileSync(path.join(__dirname,'example-case.json'),JSON.stringify({schema:'hydrofoil-cavitation-case',version:1,solverVersion:C.VERSION,inputs:{...example.options,chord:.16,speed:15,rho:998.2,vapourPressure:2339},result:null},null,2)+'\n');
