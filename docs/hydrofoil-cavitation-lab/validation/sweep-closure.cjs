'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path'),cases=[];
for(const attenuation of [.15,.25,.3,.4])for(const recovery of [.1,.15,.25])for(const resolution of [32,64]){
 try{
  const r=C.solve({attenuation,recovery,resolution}),last=r.panels.filter(p=>p.cavity).sort((a,b)=>a.x-b.x).at(-1);
  cases.push({attenuation,recovery,resolution,N:r.panels.length,status:r.status,reason:r.reason,sigma:r.sigma,cl:r.coefficients.cl,cm:r.coefficients.cm,height:r.height,maximumHeight:r.metrics.maximumHeight,minimumHeight:r.metrics.minimumHeight,lastPanelNormalY:last.n[1],closureTurningAngleDeg:r.metrics.closureTurningAngleDeg,maxRecoveryDifference:r.metrics.maximumPressureReconstructionError,plateauRms:r.metrics.pressureReconstructionRMS});
 }catch(e){cases.push({attenuation,recovery,resolution,status:'rejected',reason:e.message});}
}
fs.writeFileSync(path.join(__dirname,'closure-sweep.json'),JSON.stringify({version:C.VERSION,scope:'Closure-parameter sensitivity, not independent validation; no case retuned to reference data',cases},null,2)+'\n');
console.table(cases);
