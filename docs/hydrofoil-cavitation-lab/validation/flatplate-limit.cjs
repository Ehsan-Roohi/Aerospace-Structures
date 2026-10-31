'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function acosta(length,alphaDeg){const alpha=alphaDeg*Math.PI/180,x=length;return {sigmaBy2Alpha:(2-x+2*Math.sqrt(1-x))/Math.sqrt(x*(1-x)),clByPiAlpha:1+1/Math.sqrt(1-x),sigma:2*alpha*(2-x+2*Math.sqrt(1-x))/Math.sqrt(x*(1-x)),cl:Math.PI*alpha*(1+1/Math.sqrt(1-x))};}
assert.ok(Math.abs(acosta(1e-8,1).clByPiAlpha-2)<1e-7);
const cases=[];
for(const thickness of [.002,.0001])for(const alpha of [.25,.5,1]){
 const inputs={thickness,alpha,detachment:.0001,length:.4,resolution:64,recovery:0,attenuation:0,relaxation:.3,maxIterations:180,normalTolerance:1e-6,shapeTolerance:1e-7};
 try{const r=C.solveBenchmark(inputs);cases.push({inputs,reference:acosta(inputs.length,alpha),computed:{status:r.status,reason:r.reason,sigma:r.sigma,cl:r.coefficients.cl,minimumGap:r.metrics.minimumHeight,maximumHeight:r.metrics.maximumHeight,closureTurningAngleDeg:r.metrics.closureTurningAngleDeg},matchedFlatPlate:false});}
 catch(e){cases.push({inputs,reference:acosta(inputs.length,alpha),computed:{status:'rejected',reason:e.message},matchedFlatPlate:false});}
}
const report={version:C.VERSION,status:'INDEPENDENT_CAVITATION_BENCHMARK_NOT_PASSED',reference:{author:'A. J. Acosta',year:1955,title:'A Note on Partial Cavitation of Flat Plate Hydrofoils',url:'https://authors.library.caltech.edu/records/p5ya1-44321',equations:'Printed p.5 Eq.(9) and p.6 Eq.(12), visually checked in primary report',scope:'Sharp-leading-edge zero-thickness flat plate, leading-edge detachment, linearized flow. Author cautions accuracy beyond l/c about 0.5; lower branch l/c < about 0.74.'},interpretation:'These finite-thickness/fixed-detachment nonlinear probes do not establish a matched flat-plate limit: the vanishing-thickness/zero-recovery sequence encounters rejected or folded branches. Do not quote an accuracy percentage or claim Acosta validation for the GUI NACA/recovery cases.',cases};
fs.writeFileSync(path.join(__dirname,'flatplate-limit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
