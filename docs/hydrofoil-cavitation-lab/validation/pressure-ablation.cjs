'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path'),cases=[];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1],rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
function derivative3(s,f,i,start,end){const lo=Math.max(start,Math.min(i-1,end-3));let value=0;for(let j=lo;j<lo+3;j++){const k=[lo,lo+1,lo+2].filter(k=>k!==j);value+=f[j]*(2*s[i]-s[k[0]]-s[k[1]])/((s[j]-s[k[0]])*(s[j]-s[k[1]]));}return value;}
function forces(p,cp,alpha){let fx=0,fy=0,cm=0;for(let i=0;i<p.length;i++){const dx=-cp[i]*p[i].n[0]*p[i].length,dy=-cp[i]*p[i].n[1]*p[i].length;fx+=dx;fy+=dy;cm+=(p[i].x-.25)*dy-p[i].y*dx;}const a=alpha*Math.PI/180;return {cl:fy*Math.cos(a)-fx*Math.sin(a),cm,pressureDrag:fx*Math.cos(a)+fy*Math.sin(a)};}
for(const resolution of [24,32,48,64,96]){
 const r=C.solve({resolution}),p=r.panels,phi=p.map(v=>v.potential),ids=p.flatMap((v,i)=>v.cavity?[i]:[]),lo=Math.min(...ids),hi=Math.max(...ids)+1,a=r.options.alpha*Math.PI/180,U=[Math.cos(a),Math.sin(a)];let arc=0;
 const s=p.map(v=>{const x=arc+v.length/2;arc+=v.length;return x;});
 const legacy=p.map((v,i)=>{const start=i<lo?0:i<hi?lo:hi,end=i<lo?lo:i<hi?hi:p.length;return dot(v.t,U)+derivative3(s,phi,i,start,end);});
 const variants={legacyMixedGeometry3:legacy,totalPotential3:C.surfaceTangentialSpeed(r.points,phi,r.options.alpha,[lo,hi],3),totalPotential5:C.surfaceTangentialSpeed(r.points,phi,r.options.alpha,[lo,hi],5)},metrics={},profiles={};
 for(const [name,vt]of Object.entries(variants)){
  const cp=vt.map((v,i)=>1-v*v-p[i].normalVelocity**2),error=ids.map(i=>cp[i]-p[i].targetCp);
  metrics[name]={...forces(p,cp,r.options.alpha),minimumCpAllPanels:Math.min(...cp),maximumCpAllPanels:Math.max(...cp),maxAbsCpAllPanels:Math.max(...cp.map(Math.abs)),maximumCavityCpDifference:Math.max(...error.map(Math.abs)),cavityCpRmsDifference:rms(error)};
  profiles[name]=cp;
 }
 cases.push({resolution,N:p.length,status:r.status,sigma:r.sigma,maximumHeight:r.metrics.maximumHeight,closureTurningAngleDeg:r.metrics.closureTurningAngleDeg,closurePanelNormalY:r.metrics.closurePanelNormalY,height:r.height,metrics,panels:p.map((v,i)=>({x:v.x,y:v.y,cavity:v.cavity,targetCp:v.targetCp,legacyCp:profiles.legacyMixedGeometry3[i],total3Cp:profiles.totalPotential3[i],total5Cp:profiles.totalPotential5[i]}))});
}
const report={version:C.VERSION,scope:'Postprocessing-only ablation on the exact same solved potentials, geometry, cavity speed and sigma. All panel samples retained; BC-target difference is not experimental error.',variants:{legacyMixedGeometry3:'3-point perturbation-potential derivative plus exact single-panel U.t (v0.1.0)',totalPotential3:'3-point derivative of solved total potential',totalPotential5:'scaled 5-point derivative of solved total potential (v0.1.1 mixed-boundary path)'},cases};
fs.writeFileSync(path.join(__dirname,'pressure-ablation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(cases.map(({N,sigma,closureTurningAngleDeg,metrics})=>({N,sigma,closureTurningAngleDeg,metrics})),null,2));
