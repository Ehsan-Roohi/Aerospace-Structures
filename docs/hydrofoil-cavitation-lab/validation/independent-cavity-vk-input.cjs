'use strict';
// Read-only evaluation of the parent's isolated velocity-Kutta research loader.
const C=require('./velocity-kutta-research.cjs')(),F=require('./c1-domain-frozen-core.cjs'),fs=require('node:fs'),path=require('node:path'),cases=[];
for(const resolution of [24,32,48,64]){
 const r=C.solve({closureMode:'smooth-contact',resolution}),g=F.buildFoil(F.options({resolution}));
 cases.push({id:`velocity-kutta-${resolution}`,inputs:r.options,original:g.points,nodes:g.nodes,ids:g.ids,foilS:g.foilS,points:r.points,initialGap:r.height.map(v=>v.h),initialSpeed:Math.sqrt(1+r.sigma),initialA:r.closure.selectedAttenuation,initialGuess:'Velocity-Kutta production C1 contour used ONLY as initial guess; independent equations unchanged.',production:{status:r.status,A:r.closure.selectedAttenuation,sigma:r.sigma,coefficients:r.coefficients,panels:r.panels,height:r.height}});
 console.log(JSON.stringify({resolution,status:r.status,A:r.closure.selectedAttenuation,sigma:r.sigma,cl:r.coefficients.cl}));
}
fs.writeFileSync(path.join(__dirname,'independent-cavity-vk-input.json'),JSON.stringify(cases,null,2)+'\n');
