import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),T=require('./teaching_models.js'),E=require('./engine.js');
let checks=0;
function near(a,b,tol=1e-5){assert.ok(Math.abs(a-b)<=tol*Math.max(Math.abs(b),1e-12),a+' != '+b);checks++;}
const p={a:100,b:100,t:1.2,E:2000,nu:.3,pressure:1};
const square=T.panel(p);
near(square.plate.w*square.D/(1e-6*100**4),.00406235,2e-5);
near(square.plate.sigmaA,square.plate.sigmaB,1e-10);
const rectangular=T.panel({...p,a:450,b:135,pressure:120});
const rotated=T.panel({...p,a:135,b:450,pressure:120});
near(rectangular.plate.w,rotated.plate.w,1e-10);
near(rectangular.plate.sigmaA,rotated.plate.sigmaB,1e-10);
near(T.panel({...p,a:450,b:135,pressure:240}).plate.w,2*rectangular.plate.w);
near(T.panel({...p,a:225,b:135,pressure:120}).strip.w,rectangular.strip.w/16);
near(T.panel({...p,a:225,b:135,pressure:120}).strip.sigmaA,rectangular.strip.sigmaA/4);
assert.ok(rectangular.plate.w<rectangular.strip.w);checks++;
assert.ok(rectangular.strip.status.startsWith('Outside'));checks++;
near(T.panel({...p,pressure:0}).plate.w,0);
for(const a of [30,100,450]) {
 const c=T.panel({...p,a,b:135}),d=T.panel({...p,a,b:135,terms:101});
 near(c.plate.w,d.plate.w,2e-4);near(c.plate.sigmaA,d.plate.sigmaA,2e-3);
}
for(const bad of [{a:0},{b:NaN},{pressure:-1},{nu:.5},{terms:202}]){assert.throws(()=>T.panel({...p,...bad}));checks++;}
const fit=T.fitObservations([[0,.02],[1,1.12],[2,2.22],[3,3.32]]);
near(fit.compliance,1.1);near(fit.offset,.02);near(fit.r2,1);
assert.throws(()=>T.fitObservations([[1,0],[1,1],[1,2]]));checks++;
for(const [g,a] of [[{},{seamsBonded:true}],[{},{seamsBonded:false}],[{tipChord:160},{seamsBonded:true}]]) {
 const input={geometry:g,assembly:a,load:{kind:'tip',tipForce:2,tipFraction:.3}};
 const r=E.solve(input),z=T.zeroTipTwist(r,E),zero=E.solve({...input,load:{...input.load,tipFraction:z.fraction}});
 assert.ok(Math.abs(zero.twist.at(-1))<1e-10);checks++;
 if(g.tipChord===160)near(z.x,r.props.xsc[0],1e-5);
 else {assert.ok(Math.max(...zero.twist.map(Math.abs))>1e-8);checks++;}
 const student=T.studentResult(r);
 assert.ok(student.bucklingUnresolved&&!student.checks.some(c=>c.name.includes('buckling')));checks++;
 assert.ok(r.checks.some(c=>c.name.includes('buckling')));checks++;
 near(student.deflection.at(-1),r.deflection.at(-1));
 const b=T.buckling(r);assert.ok(b.flat>0&&b.cylinder>0&&b.legacy>0);checks++;
}
console.log('PASS: '+checks+' plate/strip benchmarks, convergence, scaling, validation, data fitting, zero-tip-twist and separate buckling-presentation checks.');
