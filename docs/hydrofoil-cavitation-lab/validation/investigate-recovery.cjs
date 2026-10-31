'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path');
const cases=[];
for(const resolution of [24,32,48,64,96]){
 const r=C.solve({resolution}),cavity=r.panels.filter(p=>p.cavity).sort((a,b)=>a.x-b.x);
 const ends=cavity.slice(-5).map(p=>({x:p.x,length:p.length,normal:p.n,potential:p.potential,tangentialSpeed:p.tangentialSpeed,targetSpeed:Math.sqrt(1-p.targetCp),Cp:p.cp,targetCp:p.targetCp,difference:p.cp-p.targetCp}));
 const peak=cavity.reduce((a,p)=>Math.abs(p.cp-p.targetCp)>Math.abs(a.cp-a.targetCp)?p:a);
 cases.push({resolution,N:r.panels.length,status:r.status,sigma:r.sigma,plateauRms:r.metrics.pressureReconstructionRMS,maxRecoveryDifference:r.metrics.maximumPressureReconstructionError,peakX:peak.x,ends});
}
fs.writeFileSync(path.join(__dirname,'recovery-investigation.json'),JSON.stringify({version:C.VERSION,scope:'Raw endpoint diagnostics. No pressure values adjusted.',cases},null,2)+'\n');
console.log(JSON.stringify(cases,null,2));
