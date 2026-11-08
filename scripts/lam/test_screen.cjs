const assert=require('node:assert/strict'),S=require('../../docs/wing-panel-stress-analyzer/ml-airfoil/screen.js');
const close=(a,b,t=1e-12)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
// Exact flat-plate result: Cp_lower=1, Cp_upper=0 gives CN=1,
// Cm_quarter=-1/4 and a moment shift to x/c=.35 adds +.10 CN.
const surface=[[0,0],[.5,0],[1,0]],W=S.weights(surface,surface),cp=[0,0,0,1,1,1],mean=W.map(w=>w.reduce((s,v,i)=>s+v*cp[i],0));close(mean[0],0);close(mean[1],1);close(mean[2],-.25);
const linearCp=[0,-1,-2,0,0,0];close(W[1].reduce((s,v,i)=>s+v*linearCp[i],0),1);close(W[2].reduce((s,v,i)=>s+v*linearCp[i],0),-5/12);
const diamond=S.weights([[0,0],[.5,.1],[1,0]],[[0,0],[.5,-.1],[1,0]]);for(const row of diamond)close(row.reduce((s,v)=>s+v,0),0);
const r={upper:surface,lower:surface,cpMean:cp,cpStd:Array(6).fill(.1),alphaDeg:0,mach:.15,forceMoment:{mean,covariance:[[.01,0,0],[0,.04,.006],[0,.006,.09]]}};
const a=S.assess(r,{re:3e6,xsc:.35});close(a.lift.mean,1);close(a.moment.mean,-.15);close(a.moment.std,Math.sqrt(.09+.1**2*.04+2*.1*.006));assert.equal(a.scope.eligible,true);assert.equal(S.assess(r,{re:4e5}).scope.eligible,false);assert.equal(S.scope(1e6,0,.15).eligible,false);assert.equal(S.scope(3e6,13,.15).eligible,false);
const bad=structuredClone(r);bad.forceMoment.covariance[1][2]=1;assert.throws(()=>S.validate(bad),/covariance/i);const inconsistent=structuredClone(r);inconsistent.forceMoment.mean[1]=2;assert.throws(()=>S.validate(inconsistent),/disagree/);assert.throws(()=>S.assess(r,{re:3e6,xsc:2}),/bounds/);
console.log('PASS: exact force/moment signs, reference transfer, joint covariance cross-term, domain refusal and malformed data checks.');
