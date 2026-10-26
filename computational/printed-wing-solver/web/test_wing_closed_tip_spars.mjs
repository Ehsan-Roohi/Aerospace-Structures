/* Independent analytic-strip integration and real Manifold volume checks.
 * These verify nominal section mechanics and union bookkeeping, not local
 * spar-runout, rib, root, bond or apex stress, nor 3-D solid FE accuracy.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
const relative=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1e-10,Math.abs(b)),`${label}: ${a} != ${b} (${t})`);
const near=(a,b,t,label)=>assert.ok(Math.abs(a-b)<=t,`${label}: ${a} != ${b}`);
const simpson=(f,a,b,n=120)=>{let s=f(a)+f(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+(b-a)*i/n);return s*(b-a)/(3*n);};
function adaptive(f,a,b,depth=0){const m=(a+b)/2,u=simpson(f,a,b,8),v=simpson(f,a,m,8)+simpson(f,m,b,8);if(depth>16||Math.abs(u-v)<1e-7*Math.max(1,Math.abs(v)))return v+(v-u)/15;return adaptive(f,a,m,depth+1)+adaptive(f,m,b,depth+1);}
const chord=(g,y)=>g.rootChord*(g.planform==='delta'?1-y/g.semiSpan:Math.sqrt(1-(y/g.semiSpan)**2));
function half(c,u,te){const natural=.2969-.126-.3516+.2843-.1015;return c*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1015*u**4-natural*u**4)+te*u**4/2;}
const material={name:'Integral printed PLA',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10};
const geometry={naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,cavityStart:.12,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:0,customInteriorRibs:[5,53],ribThickness:4,interfaceOffset:5,cap:2,sweepDeg:0,dihedralDeg:0};
const spar=fraction=>({fraction,length:65,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material});
const make=(planform,spars)=>({geometry:{...geometry,planform,spars},pla:material,assembly:{seamsBonded:true},load:{kind:'custom',items:[{kind:'distributed',start:0,end:130,qStart:.02,qEnd:0,fraction:.25}],selfWeight:true},nGrid:25});
function reference(g){
  let a=0,b=g.semiSpan;for(let k=0;k<60;k++){const y=(a+b)/2,c=chord(g,y),gap=2*Math.min(half(c,g.cavityStart,g.te),half(c,g.cavityEnd,g.te))-2*g.skin;if(gap>=.8)a=y;else b=y;}const closure=(a+b)/2;
  function filled(y){return y<g.cap||y>=closure-g.cap||g.customInteriorRibs.some(v=>Math.abs(y-v)<=g.ribThickness/2);}
  function sparMoment(y,power=0){
    if(filled(y))return 0;const c=chord(g,y),hi=x=>half(c,x/c,g.te)-g.skin;
    let sum=0;
    for(const s of g.spars){if(y>s.length)return sum;const x=s.fraction*c;
      for(const[width,t]of[[s.topWidth,s.topThickness],[s.bottomWidth,s.bottomThickness]])sum+=simpson(q=>power===0?t:(hi(q)**3-(hi(q)-t)**3)/3,x-width/2,x+width/2);
      sum+=simpson(q=>power===0?2*(hi(q)-s.topThickness):2*(hi(q)-s.topThickness)**3/3,x-s.webThickness/2,x+s.webThickness/2);
    }
    return sum;
  }
  function inertia(y){const c=chord(g,y),te=g.te*Math.min(1,c/(12*g.skin));let I=simpson(t=>4*c*t*half(c,t*t,te)**3/3,0,1,400);if(!filled(y)&&y<closure)I-=simpson(u=>2*c*(half(c,u,g.te)-g.skin)**3/3,g.cavityStart,g.cavityEnd,400);return I+sparMoment(y,2);}
  const breaks=[...new Set([0,...g.spars.map(s=>s.length),g.cap,closure-g.cap,...g.customInteriorRibs.flatMap(y=>[y-g.ribThickness/2,y+g.ribThickness/2])])].filter(y=>y>=0&&y<=Math.max(...g.spars.map(s=>s.length))).sort((a,b)=>a-b);
  const volume=()=>breaks.slice(1).reduce((v,b,i)=>v+adaptive(y=>sparMoment(y),breaks[i]+1e-9,b-1e-9),0);
  return {sparMoment,inertia,volume,filled};
}
for(const planform of ['delta','elliptic'])for(const count of [1,2]){
  const input=make(planform,[spar(.3),spar(.6)].slice(0,count)),snapshot=JSON.stringify(input),r=E.solve(input),bare=E.solve(make(planform,[])),ref=reference(r.geometry),rho=material.rho/1000;
  assert.equal(JSON.stringify(input),snapshot,'input immutable');assert.equal(r.geometry.tipChord,0);assert.ok(r.analysis3D.stressOnly);assert.ok(r.mass.spars>0);
  relative(r.mass.spars,ref.volume()*rho,.003,'independent cap/web union mass');near(r.mass.total-bare.mass.total,r.mass.spars,1e-7,'no rib/cap double-counting');near(r.mass.printed,r.mass.total,1e-10,'integral spars are printed mass');
  for(const y of [20,40,60]){const cut=r.analysis3D.cutAt(y),I=ref.inertia(y);relative(cut.sparA,ref.sparMoment(y),.003,'independent spar strip area');relative(cut.Izz*cut.scale**4,I,.003,'independent strip bending inertia');const z=half(chord(r.geometry,y),.3,r.geometry.te),sig=r.analysis3D.evaluateStress(y,[.3*cut.scale,z]).value;relative(sig,-cut.moment[0]*z/I,.003,'signed normal stress from independent I');}
  for(const y of [1,5,53]){const cut=r.analysis3D.cutAt(y);assert.ok(cut.filled);near(cut.sparA,0,1e-10,'filled slab includes spar union without duplicate volume');}
  near(r.analysis3D.cutAt(66).sparA,0,1e-10,'finite runout');assert.ok(r.y.includes(65),'runout is explicit stress/quadrature boundary');assert.ok(r.stress.spars.length>0);assert.ok(r.deflection.every(Number.isNaN));assert.equal(r.analysis3D.evaluateStress(130,[0,0]).resolved,false);
  const noWeight=E.solve({...input,load:{...input.load,selfWeight:false}});relative(noWeight.appliedForce-r.appliedForce,r.mass.total*.00981,1e-8,'actual union gravity force');assert.ok(r.verification.normalStressEquilibriumRelativeResidual<1e-8);
  assert.throws(()=>E.solve({...input,geometry:{...input.geometry,spars:[{...spar(.3),material:{...material,E:3000}}]}}),/same.material|same material|mixed.material/i);
  assert.throws(()=>E.solve({...input,geometry:{...input.geometry,spars:[{...spar(.3),length:130}]}}),/finite|tip|cavity|fit/i);
  console.log(`PASS ${planform} ${count} integral spar(s): independent strip area/inertia/stress, union mass, filled slabs, runout and gravity`);
  if(count===2){const P=require('./wing_print_mesh.js'),{default:Module}=await import('./vendor/manifold-3.5.4/manifold.js'),wasm=await Module();wasm.setup();const stl=await P.build({geometry:r.geometry},wasm),info=P.inspectSTL(stl.files[0].bytes);relative(info.volumeMm3*rho,r.mass.total,.004,'actual Manifold/STL union mass');console.log(`PASS ${planform} actual two-spar Manifold/STL volume vs stress union (${(info.volumeMm3*rho).toFixed(6)} vs ${r.mass.total.toFixed(6)} g)`);}
}
console.log('Scope: homogeneous nominal normal stress only; local spar-runout/bond/taper stresses, deformation, torsion, shear and safety certification remain unresolved.');
