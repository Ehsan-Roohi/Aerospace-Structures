'use strict';
const C=require('./velocity-kutta-research.cjs')(),fs=require('node:fs'),path=require('node:path');
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'c1-domain-sweep.json'),'utf8')).rows.filter(v=>v.resolution===32),rows=[];
for(const m of old){
 try{
  const r=C.solve({...m.input,closureMode:'smooth-contact',resolution:32,normalTolerance:1e-7,shapeTolerance:1e-8,relaxation:.3,maxIterations:220});
  rows.push({id:m.id,input:m.input,N:r.panels.length,status:r.status,reason:r.reason,A:r.closure?.selectedAttenuation,sigma:r.sigma,metrics:r.metrics,closure:r.closure,coefficients:r.coefficients,height:r.height,morinoStatus:m.status,morinoMinimumGap:m.metrics?.minimumHeight});
 }catch(e){rows.push({id:m.id,input:m.input,status:'exception',reason:e.message,morinoStatus:m.status,morinoMinimumGap:m.metrics?.minimumHeight});}
 console.log(JSON.stringify({id:rows.at(-1).id,status:rows.at(-1).status,A:rows.at(-1).A,sigma:rows.at(-1).sigma,gap:rows.at(-1).metrics?.minimumHeight}));
 fs.writeFileSync(path.join(__dirname,'c1-domain-vk-sweep.json'),JSON.stringify({scope:'13 one-factor cases, 107 boundary panels; velocity-Kutta research candidate compared with frozen Morino C1 results. Internal domain test, no experimental validation.',rows},null,2)+'\n');
}
