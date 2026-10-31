// Analytic verification of the isolated TE velocity condition before adoption.
const C=require('../cavitation.js'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const div=(a,b)=>{const d=b[0]**2+b[1]**2;return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];},mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
function reference(n,alpha){
 const e=.08,R=1+e,zle=-e-R+1/(-e-R),chord=2-zle,a=alpha*Math.PI/180,G=4*Math.PI*R*Math.sin(a);
 const point=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],iz=div([1,0],z);return [(z[0]+iz[0]-zle)/chord,(z[1]+iz[1])/chord];};
 const cp=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],w=[R*Math.cos(t),R*Math.sin(t)],s=div([R*R*Math.cos(a),R*R*Math.sin(a)],mul(w,w)),v=div([0,G/(2*Math.PI)],w),J=div([1,0],mul(z,z)),q=div([Math.cos(a)-s[0]+v[0],-Math.sin(a)-s[1]+v[1]],[1-J[0],-J[1]]);return 1-q[0]**2-q[1]**2;};
 return {points:Array.from({length:n+1},(_,i)=>point(2*Math.PI*i/n)),cp,cl:2*G/chord};
}
const rows=[];
for(const alpha of [0,4])for(const n of [80,160,320,640]){
 const ref=reference(n,alpha),r=C.wettedVelocity(ref.points,alpha),err=r.cp.map((v,i)=>v-ref.cp(2*Math.PI*(i+.5)/n));
 const interior=err.filter((v,i)=>r.panels[i].x>.02&&r.panels[i].x<.98),rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
 const row={alpha,n,cl:r.cl,exactCl:ref.cl,clAbsoluteError:Math.abs(r.cl-ref.cl),cpRMSAll:rms(err),cpRMSInterior:rms(interior),maxAll:Math.max(...err.map(Math.abs)),velocityKuttaResidual:r.velocityKuttaResidual,linearResidual:r.linearResidual};rows.push(row);console.log(JSON.stringify(row));
 assert.ok(r.linearResidual<1e-9&&Math.abs(r.velocityKuttaResidual)<1e-8);
 if(n===640){assert.ok(row.clAbsoluteError<.005);assert.ok(row.cpRMSInterior<.015);}
}
for(const alpha of [0,4]){const r=rows.filter(x=>x.alpha===alpha);assert.ok(r.at(-1).cpRMSAll<r[0].cpRMSAll);assert.ok(r.at(-1).maxAll<r[0].maxAll);}
fs.writeFileSync(path.join(__dirname,'velocity-kutta-analytic.json'),JSON.stringify({status:'PASS_ANALYTIC_FULLY_WETTED_ONLY',rows,coverage:'All endpoint samples retained in cpRMSAll/maxAll; separately labelled interior RMS uses .02<x/c<.98. Not independent free-boundary cavitation validation.'},null,2)+'\n');
