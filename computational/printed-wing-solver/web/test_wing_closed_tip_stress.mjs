/* Independent nominal-stress checks, not 3-D solid or experimental validation.
 * References below integrate the analytic NACA 0020 vertical ordinates using
 * Simpson quadrature. They do not call engine polygon/section integrators.
 * CAD comparisons additionally include finite rib/cap unions, not point masses.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js');
const near=(a,b,t=1e-6,label='')=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b} (tolerance ${t})`);
const relative=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1e-12,Math.abs(b)),`${label}: ${a} != ${b} (relative tolerance ${t})`);
function simpson(f,a,b,n=256){let v=f(a)+f(b);for(let i=1;i<n;i++)v+=(i%2?4:2)*f(a+(b-a)*i/n);return v*(b-a)/(3*n);}
function adaptive(f,a,b,tol=1e-7,depth=0){const whole=simpson(f,a,b,8),mid=(a+b)/2,half=simpson(f,a,mid,8)+simpson(f,mid,b,8);if(Math.abs(half-whole)<tol*Math.max(1,Math.abs(half))||depth===18)return half+(half-whole)/15;return adaptive(f,a,mid,tol/2,depth+1)+adaptive(f,mid,b,tol/2,depth+1);}
const chord=(g,y)=>g.rootChord*(g.planform==='delta'?1-y/g.semiSpan:Math.sqrt(Math.max(0,1-(y/g.semiSpan)**2)));
function half(g,c,u,te){const natural=5*.2*(.2969-.126-.3516+.2843-.1015);return c*(5*.2*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1015*u**4)-natural*u**4)+te*u**4/2;}
function reference(g){
  // NACA 0020 thickness is unimodal on the selected cavity interval, so its
  // minimum is at an endpoint. Closure matches the documented 0.8 mm gap rule.
  let a=0,b=g.semiSpan;
  for(let k=0;k<60;k++){const y=(a+b)/2,c=chord(g,y),gap=2*Math.min(half(g,c,g.cavityStart,g.te),half(g,c,g.cavityEnd,g.te))-2*g.skin;if(gap>=.8)a=y;else b=y;}
  const closeY=(a+b)/2,capEnd=closeY-g.cap,ribs=g.customInteriorRibs||Array.from({length:g.interiorRibs},(_,i)=>g.semiSpan*(i+1)/(g.interiorRibs+1));
  const breaks=[...new Set([0,g.semiSpan,g.cap,capEnd,closeY,...ribs.flatMap(y=>[Math.max(0,y-g.ribThickness/2),Math.min(g.semiSpan,y+g.ribThickness/2)])])].sort((x,y)=>x-y);
  function section(y,ignoreFill=false){
    const c=chord(g,y),te=g.te*Math.min(1,c/(12*g.skin));
    const filled=!ignoreFill&&(y<g.cap||y>=capEnd||ribs.some(q=>Math.abs(q-y)<=g.ribThickness/2));
    // x=c*t^2 removes the square-root leading-edge singularity.
    const outerA=simpson(t=>4*c*t*half(g,c,t*t,te),0,1),outerI=simpson(t=>4*c*t*half(g,c,t*t,te)**3/3,0,1);
    let innerA=0,innerI=0;
    if(y<closeY&&!filled){innerA=simpson(u=>2*c*(half(g,c,u,g.te)-g.skin),g.cavityStart,g.cavityEnd);innerI=simpson(u=>2*c*(half(g,c,u,g.te)-g.skin)**3/3,g.cavityStart,g.cavityEnd);}
    return {A:outerA-innerA,I:outerI-innerI,c,filled,closeY,te};
  }
  const integrate=f=>breaks.slice(1).reduce((sum,b,i)=>sum+adaptive(f,breaks[i]+1e-10,b-1e-10),0);
  return {section,closeY,breaks,volume:()=>integrate(y=>section(y).A),firstMoment:()=>integrate(y=>y*section(y).A)};
}
const geometry={naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,cavityStart:.12,cavityEnd:.8,modules:1,rodFractions:[],interiorRibs:0,customInteriorRibs:[5,53,118],ribThickness:4,interfaceOffset:5,cap:2,sweepDeg:0,dihedralDeg:0};
const make=(planform,distribution='uniform',factor=1,selfWeight=false)=>({geometry:{...geometry,planform},load:{kind:'flight',aircraftMass:factor,loadFactor:1,distribution,liftFraction:.25,inertiaRelief:false,selfWeight},nGrid:25,nElements:8,nSections:3});
for(const planform of ['delta','elliptic']){
  const original=make(planform),snapshot=JSON.stringify(original),r=E.solve(original),g=r.geometry,L=g.semiSpan,F=9.81/2,ref=reference(g);
  assert.equal(JSON.stringify(original),snapshot,'source study is immutable');assert.equal(r.geometry.tipChord,0,'no physical tip-chord floor');
  assert.equal(E.chordAt(g,L),0);assert.equal(r.analysis3D.stressOnly,true);
  near(r.appliedForce,F,2e-8,'uniform resultant');near(r.appliedMoment,F*L/2,2e-8,'uniform root moment');
  const chordLoad=E.solve(make(planform,'planform')),ellipseLoad=E.solve(make(planform,'elliptic'));
  near(chordLoad.appliedForce,F,1e-6,'chord load conservation');near(chordLoad.appliedMoment,F*L*(planform==='delta'?1/3:4/(3*Math.PI)),2e-5,'chord root moment');
  near(ellipseLoad.appliedForce,F,1e-6,'ellipse load conservation');near(ellipseLoad.appliedMoment,F*L*4/(3*Math.PI),2e-5,'ellipse root moment');
  for(const y of [L*.25,L*.995]){
    const s=ref.section(y),z=half(g,s.c,.3,s.te),M=F*(L-y)**2/(2*L),actual=r.analysis3D.evaluateStress(y,[.3*s.c,z]);
    assert.ok(actual.resolved);relative(actual.value,-M*z/s.I,.003,'independent Simpson Mc/I, hollow and solid');
    assert.equal(r.analysis3D.cutAt(y).filled,s.filled);
    // Recover N and M by integrating the returned affine stress through
    // vertical strips. Integration uses the analytic airfoil, not engine loops.
    const sig=(u,z)=>r.analysis3D.evaluateStress(y,[u*s.c,z]).value;
    const strip=(u,h,moment)=>moment?(sig(u,h)-sig(u,-h))*h*h/3:(sig(u,h)+sig(u,-h))*h;
    function integral(moment){let v=simpson(t=>2*s.c*t*strip(t*t,half(g,s.c,t*t,s.te),moment),0,1);if(!s.filled&&y<ref.closeY)v-=simpson(u=>s.c*strip(u,half(g,s.c,u,g.te)-g.skin,moment),g.cavityStart,g.cavityEnd);return v;}
    near(integral(false),0,1e-7,'normal force closure');relative(integral(true),-M,.003,'normal moment closure');
  }
  const zero=E.solve({...make(planform),load:{kind:'custom',items:[]}}),negative=E.solve({...make(planform),load:{kind:'custom',items:[{kind:'distributed',start:0,end:L,qStart:-F/L,qEnd:-F/L,fraction:.25}]}});
  const combined=E.solve({...make(planform),load:{kind:'custom',items:[{kind:'distributed',start:0,end:L,qStart:F/L,qEnd:F/L,fraction:.25},{kind:'distributed',start:0,end:L,qStart:-F/L,qEnd:-F/L,fraction:.25}]}});
  const probe=[.3*chord(g,30),3],evaluate=q=>q.analysis3D.evaluateStress(30,probe).value;
  near(evaluate(negative),-evaluate(r),1e-10,'load reversal');near(evaluate(combined),evaluate(r)+evaluate(negative),1e-10,'superposition');near(evaluate(zero),0,1e-10);
  const interiorPoint=E.solve({...make(planform),load:{kind:'custom',items:[{kind:'point',position:L*.6,force:2,fraction:.3}]}});
  near(interiorPoint.appliedForce,2,1e-10,'finite-section point load');near(interiorPoint.appliedMoment,2*.6*L,1e-10,'point root moment');
  near(interiorPoint.analysis3D.cutAt(.7*L).moment[0],0,1e-10,'outboard cut of finite point load');
  const gravity=E.solve({...make(planform),load:{kind:'custom',items:[],selfWeight:true}}),rho=r.pla.rho/1000,volume=ref.volume(),first=ref.firstMoment();
  near(r.mass.total,volume*rho,.002,'independent finite cap/rib union mass');near(gravity.mass.total,r.mass.total,1e-10);
  near(gravity.appliedForce,-volume*rho*.00981,.002,'gravity mg');near(gravity.appliedMoment,-first*rho*.00981,.002,'gravity mg ybar');
  near(gravity.load.gravitySummary.weightN,gravity.mass.total*.00981,1e-10,'reported gravity mass consistency');
  const tip=r.analysis3D.evaluateStress(L,[0,0]);assert.equal(tip.resolved,false);assert.ok(Number.isNaN(tip.value));assert.equal(r.tipBehavior.endpoint,'undefined-zero-area');assert.equal(r.tipBehavior.globalMaximumCertified,false);
  const samples=r.tipBehavior.samples,magnitude=q=>Math.max(q.tension,q.compression);
  if(planform==='delta'){
    assert.equal(r.tipBehavior.status,'divergent');assert.ok(magnitude(samples.at(-1))>1000*magnitude(samples.at(-4)),'uniform delta divergence is visible');
    const chordSamples=chordLoad.tipBehavior.samples,ellipseSamples=ellipseLoad.tipBehavior.samples;
    relative(magnitude(chordSamples.at(-1)),magnitude(chordSamples.at(-3)),1e-6,'delta chord load finite nonzero stress limit');
    assert.ok(magnitude(chordSamples.at(-1))>0);
    assert.ok(magnitude(ellipseSamples.at(-1))>20*magnitude(ellipseSamples.at(-4)),'delta elliptic load stress diverges despite zero endpoint load');
    assert.equal(ellipseLoad.tipBehavior.globalMaximumCertified,false,'no finite certified maximum for elliptic-load delta singularity');
  }
  else{assert.equal(r.tipBehavior.status,'vanishing-for-bounded-line-load');assert.ok(magnitude(samples.at(-1))<.05*magnitude(samples.at(-4)),'ellipse nominal stress tends to zero');}
  for(const q of [r,chordLoad,ellipseLoad,gravity]){assert.ok(q.deflection.every(Number.isNaN));assert.ok(q.twist.every(Number.isNaN));assert.equal(q.checks.length,0,'no unsupported overall strength certification');}
  assert.throws(()=>E.solve({...make(planform),load:{kind:'tip',tipForce:1}}),/apex|zero.area/i);
  assert.throws(()=>E.solve({...make(planform),load:{kind:'custom',items:[],tipMass:1,selfWeight:true}}),/apex|attachment/i);
  for(const angles of [{sweepDeg:1},{dihedralDeg:1},{twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'0020'},incidenceDeg:1},{eta:1,airfoil:{kind:'naca4',code:'0020'},incidenceDeg:0}]}])assert.throws(()=>E.solve({...make(planform),geometry:{...g,...angles}}),/zero|incidence|sweep|dihedral/i);
  console.log(`PASS ${planform}: independent force/moment, Simpson section stress, normal equilibrium, union mass/self-weight, superposition and tip reporting`);
  // One real browser-mesh build per geometry: checks a separate 3-D volume
  // construction against continuous section integration. This does not validate
  // the stress approximation or local stress concentrations in that mesh.
  const P=require('./wing_print_mesh.js'),{default:Module}=await import('./vendor/manifold-3.5.4/manifold.js');
  const wasm=await Module();wasm.setup();const stl=await P.build({geometry:g},wasm);
  const serialized=P.inspectSTL(stl.files[0].bytes);
  near(serialized.volumeMm3,volume,.004,'actual STL volume vs independent area integral');near(stl.report.printedMassG,r.mass.total,.004,'actual STL mass vs stress geometry');
  console.log(`PASS ${planform}: actual watertight browser STL volume/mass agrees with independent finite cap/rib union; mass g analytical=${(volume*rho).toFixed(6)}, stress=${r.mass.total.toFixed(6)}, STL=${stl.report.printedMassG.toFixed(6)}`);
}
console.log('Scientific scope: nominal linear section-equilibrium bending only. These checks do not validate local taper/apex/rib stresses, torsion/shear, displacement, buckling, joint strength or flight safety.');


