// Geometry, legacy-physics regression and actual cambered cavity solves.
// Independent velocity comparisons are performed by cambered-independent.py.
const C=require('../cavitation.js'),old=require('./reference/cavity-core-0.2.1-symmetric.js'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const code of ['0012','2412','4415','2309'])assert.equal(C.nacaCode(C.parseNaca(code)),code);
for(const code of ['241','abc1','1012','0124','2425'])assert.throws(()=>C.parseNaca(code));
const o=C.options(C.parseNaca('2412'));
for(const u of [.05,.2,.4,.75]){
 const top=C.sectionPoint(u,o),bot=C.sectionPoint(u,o,-1),mc=C.meanLine(u,o),th=C.ordinate(u,o.thickness);
 assert.ok(Math.abs((top[0]+bot[0])/2-u)<1e-14);assert.ok(Math.abs((top[1]+bot[1])/2-mc.y)<1e-14);
 assert.ok(Math.abs(Math.hypot(top[0]-bot[0],top[1]-bot[1])-2*th)<1e-14,'thickness offset is NORMAL, not vertical');
}
assert.equal(C.meanLine(.4,o).y,.02);assert.equal(C.meanLine(.4,o).slope,0);
for(const x of [.002,.01,.2,.41,.9]){const r=C.upperAtX(x,o);assert.ok(Math.abs(C.sectionPoint(r.u,o)[0]-x)<1e-13);}
const legacy=[];
for(const input of [{resolution:24},{resolution:32,closureMode:'smooth-contact'}]){
 const a=old.solve(input),b=C.solve(input);
 assert.deepEqual(b.points,a.points);assert.equal(b.sigma,a.sigma);assert.equal(b.coefficients.cl,a.coefficients.cl);
 legacy.push({input,sigma:b.sigma,cl:b.coefficients.cl,identicalGeometryAndSolution:true});
}
const cavity=[];
for(const code of ['2412','4412'])for(const resolution of [24,32,48]){
 const input={...C.parseNaca(code),resolution,closureMode:'smooth-contact'},t=performance.now(),r=C.solve(input);
 assert.ok(r.height.every(v=>Number.isFinite(v.h)));assert.equal(r.height[0].h,0);assert.equal(r.height.at(-1).h,0);
 if(r.status==='converged-prototype'){
  assert.ok(r.metrics.minimumHeight>=-1e-8);assert.ok(Math.abs(r.metrics.endpointGapSlope)<=1e-5);assert.ok(Math.abs(r.metrics.velocityKuttaResidual)<1e-8);
 }
 const mesh=C.buildFoil(C.options(input));assert.equal(mesh.ids.length,resolution);
 assert.ok(Math.abs(mesh.base[0][0]-.01)<1e-14);assert.ok(Math.abs(mesh.base.at(-1)[0]-.41)<1e-14);
 assert.ok(Math.abs(mesh.base[0][1]-C.ordinate(.01,input.thickness))>1e-4,'upper base is the actual CAMBERED surface');
 const row={code,N:r.panels.length,status:r.status,reason:r.reason,sigma:r.sigma,cl:r.coefficients.cl,A:r.closure.selectedAttenuation,minimumGap:r.metrics.minimumHeight,cornerDeg:r.metrics.closureTurningAngleDeg,slope:r.metrics.endpointGapSlope,seconds:(performance.now()-t)/1000};cavity.push(row);console.log(JSON.stringify(row));
 if(code==='2412'&&resolution===32){assert.equal(r.status,'converged-prototype');fs.writeFileSync(path.join(__dirname,'cambered-cavity-example.json'),JSON.stringify(r,null,2)+'\n');}
}
const dry=[];
for(const code of ['2412','4412'])for(const alpha of [0,4])for(const half of [40,80,160,320]){
 const o=C.options(C.parseNaca(code)),u=Array.from({length:half+1},(_,i)=>(1-Math.cos(Math.PI*i/half))/2),points=[...u.map(x=>C.sectionPoint(x,o)).reverse(),...u.slice(1).map(x=>C.sectionPoint(x,o,-1))],r=C.wettedVelocity(points,alpha);
 assert.ok(r.cl>0,'cambered airfoil has positive lift at zero/positive AoA under this sign convention');
 assert.ok(Math.abs(r.velocityKuttaResidual)<1e-8);
 dry.push({code,alpha,N:r.panels.length,points,cl:r.cl,cm:r.cm,panels:r.panels.map((p,i)=>({x:p.x,y:p.y,cp:r.cp[i]}))});
}
const report={version:C.VERSION,status:'PASS_GEOMETRY_AND_CAMBERED_NUMERICAL_REGRESSION',scope:'NACA4 geometry and numerical consistency; no experimental cavitating-flow validation',legacy,cavity,dry};
fs.writeFileSync(path.join(__dirname,'cambered-section-verification.json'),JSON.stringify(report,null,2)+'\n');
