const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=path.resolve(__dirname,'../../../docs/wing-panel-stress-analyzer'),ctx=vm.createContext({module:{exports:{}},console,performance});vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);const A=ctx.module.exports;
const g={naca:'2412',semiSpan:900,rootChord:260,tipChord:100},flow={speed:20,density:1.225,alphaDeg:2,viscosity:1.81e-5,speedOfSound:340.29},mesh={chordPanels:8,spanPanels:4},cache=new Map();
const rigid=A.solve(g,flow,mesh,{cache}),identity=A.solve(g,flow,mesh,{cache,pointTransform:(y,p)=>p.slice(),deformationKey:'identity'});
for(const k of ['CL','CDpressure','CDiTrefftz','Cm'])assert.equal(identity.coefficients[k],rigid.coefficients[k],k+' exact identity');
const positive=A.solve(g,flow,mesh,{cache,pointTransform:(y,p)=>{const t=.01*y/g.semiSpan,x=p[0]-.25*(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan);return [.25*(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan)+Math.cos(t)*x+Math.sin(t)*p[2],p[1],-Math.sin(t)*x+Math.cos(t)*p[2]];},deformationKey:'positive-incidence'});
assert.ok(positive.coefficients.CL>rigid.coefficients.CL,'actual finite-rotation vertex geometry changes pressure lift in the expected direction');
assert.throws(()=>A.prepare(g,mesh,{pointTransform:(y,p)=>p}),/shape key/);
const sum=A.stripWrenches(positive).reduce((s,r)=>s.map((v,i)=>v+r[i+2]),[0,0,0,0,0,0]);sum.slice(0,3).forEach((v,i)=>assert.ok(Math.abs(v-positive.semiWing.force_N[i])<1e-9));sum.slice(3).forEach((v,i)=>assert.ok(Math.abs(v-positive.semiWing.momentAboutRootOrigin_Nmm[i])<1e-7));
console.log('PASS: identity pressure solve, deformed-surface lift direction, shape cache guard and six-component pressure wrench conservation.');

const trimModel=A.prepare(g,mesh),target=rigid.aircraft.lift_N*1.1,trim=A.alphaForLift(trimModel,flow,target),trimmed=A.evaluate(trimModel,{...flow,alphaDeg:trim.alphaDeg});assert.ok(Math.abs(trimmed.aircraft.lift_N-target)/Math.abs(target)<1e-9);console.log('PASS: selected target-lift trim meets its actual pressure-integral target.');
