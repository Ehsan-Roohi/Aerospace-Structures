// Research diagnostics, not an independent cavitation validation gate.
'use strict';
const C=require('../cavitation.js'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const input=JSON.parse(fs.readFileSync(path.join(__dirname,'closure-regularity-probe.json'),'utf8'));
function endpointDerivative(height,n){
 const p=height.slice(-n),x=p.at(-1).x;let derivative=0;
 for(let j=0;j<n;j++){
  let weight=0;
  for(let m=0;m<n;m++)if(m!==j){let t=1/(p[j].x-p[m].x);for(let k=0;k<n;k++)if(k!==j&&k!==m)t*=(x-p[k].x)/(p[j].x-p[k].x);weight+=t;}
  derivative+=weight*p[j].h;
 }
 return derivative;
}
function circulation(p,phi=p.map(v=>v.potential)){
 const n=p.length,u=p[0].length/(p[0].length+p[1].length),l=p[n-1].length/(p[n-1].length+p[n-2].length);
 return (1+u)*phi[0]-u*phi[1]-(1+l)*phi[n-1]+l*phi[n-2];
}
// Verify the sign and normalisation against the independent Joukowski map.
const N=320,alpha=4,a=alpha*Math.PI/180,e=.08,R=1+e,zle=-e-R+1/(-e-R),chord=2-zle;
const points=Array.from({length:N+1},(_,i)=>{const t=2*Math.PI*i/N,x=-e+R*Math.cos(t),y=R*Math.sin(t),r2=x*x+y*y;return [(x+x/r2-zle)/chord,(y-y/r2)/chord];});
const wet=C.wetted(points,alpha),exactGamma=4*Math.PI*R*Math.sin(a)/chord,G=circulation(wet.panels,wet.phi);
assert.ok(Math.abs(G-exactGamma)<.002);
const rows=input.meshes.map(m=>{
 const g=circulation(m.panels),clKJ=2*g;
 return {N:m.N,A:m.attenuation,endpointGapSlopeThreePoint:endpointDerivative(m.height,3),endpointGapSlopeFivePoint:endpointDerivative(m.height,5),pressureIntegratedCl:m.coefficients.cl,circulation:g,kuttaJoukowskiCl:clKJ,clIdentityDifference:m.coefficients.cl-clKJ,clIdentityRelativeDifference:Math.abs(m.coefficients.cl-clKJ)/Math.abs(clKJ)};
});
for(let i=1;i<rows.length;i++){
 assert.ok(Math.abs(rows[i].endpointGapSlopeFivePoint)<Math.abs(rows[i-1].endpointGapSlopeFivePoint));
 assert.ok(rows[i].clIdentityRelativeDifference<rows[i-1].clIdentityRelativeDifference);
}
assert.equal(input.independentAcostaGate,'NOT_PASSED');
const result={version:C.VERSION,status:'INTERNAL_C1_RESEARCH_DIAGNOSTICS_ONLY',scope:'The three-point gap derivative defines the candidate equation. A separate five-point derivative measures its stencil sensitivity. Pressure-integrated lift is checked against circulation via Kutta-Joukowski; this is a conservation identity, not a cavitating reference benchmark.',joukowskiSignAndUnitsControl:{panels:N,alphaDeg:alpha,exactCirculation:exactGamma,numericalCirculation:G,absoluteError:Math.abs(G-exactGamma)},rows,independentAcostaGate:'NOT_PASSED',experimentalValidation:false};
fs.writeFileSync(path.join(__dirname,'closure-consistency-study.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
