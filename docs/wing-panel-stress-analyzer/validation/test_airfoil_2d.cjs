// Independent analytic conformal-map reference; no panel solver supplies expected Cp or lift.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),ctx=vm.createContext({window:{},module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(app,'ui/wx-aero-results.js'),'utf8'),ctx);const P=ctx.window.WingAirfoilPanel2D;
const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],div=(a,b)=>{const d=b[0]**2+b[1]**2;return[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
function joukowski(N,alpha){
  const e=.08,R=1+e,lead=-e-R,zle=lead+1/lead,chord=2-zle,a=alpha*Math.PI/180,G=4*Math.PI*R*Math.sin(a);
  const point=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],iz=div([1,0],z);return[(z[0]+iz[0]-zle)/chord,(z[1]+iz[1])/chord];};
  const cp=t=>{const z=[-e+R*Math.cos(t),R*Math.sin(t)],w=[R*Math.cos(t),R*Math.sin(t)],w2=mul(w,w),s=div([R*R*Math.cos(a),R*R*Math.sin(a)],w2),v=div([0,G/(2*Math.PI)],w),J=div([1,0],mul(z,z)),q=div([Math.cos(a)-s[0]+v[0],-Math.sin(a)-s[1]+v[1]],[1-J[0],-J[1]]);return 1-q[0]**2-q[1]**2;};
  return {points:Array.from({length:N+1},(_,i)=>point(-2*Math.PI*i/N)),cp,cl:2*G/chord};
}
const rows=[];
for(const alpha of [0,4]){
 const errors=[];
 for(const N of [80,160,320]){
  const exact=joukowski(N,alpha),r=P.solveCoordinates(exact.points,alpha),saved=JSON.stringify(exact.points);
  const es=r.panels.flatMap((p,i)=>p.x>.02&&p.x<.98?[(p.cp-exact.cp(-2*Math.PI*(i+.5)/N))**2]:[]),rms=Math.sqrt(es.reduce((a,b)=>a+b,0)/es.length),liftError=Math.abs(r.cl-exact.cl);
  rows.push({alphaDeg:alpha,panels:N,cl:r.cl,exact_cl:exact.cl,lift_absolute_error:liftError,Cp_RMS_x_02_to_98:rms,normal_velocity_residual:r.maxResidual});errors.push({rms,liftError});
  assert.equal(JSON.stringify(exact.points),saved);assert.ok(r.maxResidual<1e-9);assert.ok(r.kuttaResidual<1e-12);assert.ok(r.panels.every(p=>p.cp<=1+1e-12));
  if(N===320){assert.ok(rms<.02,'Analytic Joukowski Cp RMS < 0.02 away from LE/cusp');assert.ok(liftError<.003,'Analytic integrated lift absolute error < 0.003');}
 }
 assert.ok(errors[2].rms<errors[1].rms&&errors[1].rms<errors[0].rms,'Cp converges against analytic solution');
 if(alpha)assert.ok(errors[2].liftError<errors[1].liftError&&errors[1].liftError<errors[0].liftError);
}
for(const n of [40,80,160]){
 const sec=P.section({naca:'0012',semiSpan:900,rootChord:160,tipChord:100},.5,n),r=P.solveCoordinates(sec.points,0);
 assert.ok(Math.abs(r.cl)<1e-10);assert.ok(Math.abs(r.cm)<1e-10);assert.ok(Math.abs(r.clCirculation)<1e-10);
}
const g={naca:'2412',semiSpan:900,rootChord:160,tipChord:100};
const c=P.solveCoordinates(P.section(g,.5,80).points,4),fine=P.solveCoordinates(P.section(g,.5,160).points,4);
assert.ok(c.cl>.5&&c.cm<0);assert.ok(Math.abs(fine.cl-fine.clCirculation)<Math.abs(c.cl-c.clCirculation));
assert.throws(()=>P.section({...g,planform:'delta',tipChord:0},1,80),/zero-chord/);assert.throws(()=>P.section(g,-.1,80),/eta/);assert.throws(()=>P.solveCoordinates(P.section(g,.5,80).points,90),/angle/);
const imported=vm.runInContext("WingAirfoils.preset('clarky')",ctx);
for(const profile of [{kind:'naca5',code:'23012'},imported]){const r=P.solveCoordinates(P.section({...g,airfoil:profile,naca:profile.code||'2412'},.4,80).points,2);assert.ok(Number.isFinite(r.cl)&&Number.isFinite(r.cm));}
const mixed={...g,twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:2},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:-2}]};
const middle=P.section(mixed,.5,80);assert.equal(middle.incidenceDeg,0);assert.ok(Number.isFinite(P.solveCoordinates(middle.points,4).cl));
const report={method:'Original analytic-influence linear vortex-sheet panel method with midpoint impermeability and endpoint Kutta condition',reference:'Exact Joukowski conformal-map flow, independent of the panel equations',rows,NACA0012_zero_alpha_symmetry:true,NACA2412_pressure_circulation_refinement:true,coordinate_profile_and_five_digit_and_station_blend:true,zero_chord_tip_refused:true,limits:'Cp benchmark excludes x/c < 0.02 and > 0.98; integrated lift uses every panel. No viscous or experimental validation is claimed.'};
fs.writeFileSync(path.join(app,'validation/AIRFOIL_2D_REVIEW.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
