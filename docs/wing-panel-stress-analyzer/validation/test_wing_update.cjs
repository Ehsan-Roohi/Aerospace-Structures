const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),root=path.resolve(app,'../..');
const ctx=vm.createContext({window:{},module:{exports:{}},console,performance,TextEncoder,TextDecoder});
const read=p=>fs.readFileSync(path.join(app,p),'utf8');
vm.runInContext(read('wing-aero/aero_bundle.js'),ctx);const A=ctx.module.exports;
vm.runInContext(read('ui/wing-aero-ui.js'),ctx);const U=ctx.module.exports;
vm.runInContext(read('ui/wx-aero-results.js'),ctx);const P=ctx.window.WingAirfoilPanel2D;
const e=(value,uncertainty=.001)=>({value,uncertainty,finest:value,base:value});
const c={coefficients:{CL:e(.6),CDiTrefftz:e(.03),Cm:e(-.1)}};
const perf=U.performanceSummary(c,{flow:{dynamicPressure_Pa:100},reference:{area_mm2:200000,mac_mm:200}});
assert.equal(perf.ratio,20);assert.equal(perf.drag.value,.6);assert.equal(perf.moment.value,-.4);
c.coefficients.CDiTrefftz=e(.0001,.001);assert.equal(U.performanceSummary(c,{flow:{dynamicPressure_Pa:100},reference:{area_mm2:200000,mac_mm:200}}).ratio,null);
const adm={admitted:false,rows:[{kind:'aeroelastic',admitted:false},{kind:'force',admitted:true},{kind:'torque',admitted:true}]};
assert.equal(U.prescribedLoadEligible(adm),true);assert.equal(adm.admitted,false);
adm.rows.push({kind:'torque',admitted:false});assert.equal(U.prescribedLoadEligible(adm),false);adm.rows.pop();
adm.rows.push({kind:'transfer',admitted:false});assert.equal(U.prescribedLoadEligible(adm),false);
const g={naca:'2412',semiSpan:900,rootChord:160,tipChord:100};
for(const n of [81,240,321]){const sec=P.section(g,.5,n);assert.equal(sec.points.length,2*n+1);const r=P.solveCoordinates(sec.points,4);assert.ok(Number.isFinite(r.cl)&&Number.isFinite(r.cm));assert.ok(r.maxResidual<1e-8);console.log('User-selected count',n,'cl',r.cl,'cm',r.cm);}
for(const n of [NaN,7,513,80.5])assert.throws(()=>P.section(g,.5,n));
for(const file of ['index.html','wing-lab.html']){
 const html=read(file);assert.equal((html.match(/if \(R.prescribedAeroStudy\) \{ chip/g)||[]).length,1);
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];let parsed=0;
 for(const m of scripts){if(!m[1].trim()||/^\s*\{/.test(m[1]))continue;new vm.Script(m[1],{filename:file});parsed++;}assert.ok(parsed>0);
 assert.ok(html.includes('prescribedLoadEligible(adm)'));assert.ok(html.includes('max:\'512\''));
}
console.log('PASS: arbitrary odd/even panel counts, invalid inputs, units/signs, unresolved ratio, transfer/coupling guard, inline syntax.');
