'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('./c1-domain-frozen-core.cjs');
const r=JSON.parse(fs.readFileSync(path.join(__dirname,'closure-regularity-probe.json'),'utf8')),rows=[];
for(const m of r.meshes){
 const w=C.wetted(m.points,4),p=m.panels.map(p=>p.potential),q=m.panels.map(p=>p.normalDerivative),raw=p.map((v,i)=>v-w.phi[i]),offset=raw.reduce((a,b)=>a+b,0)/raw.length;
 const ids=m.panels.flatMap((p,j)=>p.cavity?[j]:[]),vt=C.surfaceTangentialSpeed(m.points,w.phi,4,[Math.min(...ids),Math.max(...ids)+1]),dr=vt.map((v,j)=>v-m.panels[j].tangentialSpeed);
 rows.push({N:m.N,potentialMaxDifferenceAfterGauge:Math.max(...raw.map(v=>Math.abs(v-offset))),sameStencilSpeedRmsDifference:Math.sqrt(dr.reduce((s,v)=>s+v*v,0)/dr.length),sourceMaxDifference:Math.max(...q.map((v,j)=>Math.abs(v-w.q[j])))});
}
const report={scope:'Mixed versus fully Neumann solution on identical contour using SAME potential BIE. This isolates assembly/anchor effects; it is not independent cavitation validation.',rows};
fs.writeFileSync(path.join(__dirname,'independent-cavity-neumann.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
