// Independent analytic Joukowski reference: no panel output supplies expected values.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(app,'ui/wx-aero-results.js'),'utf8');
const ctx=vm.createContext({window:{},module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);
vm.runInContext(source,ctx);const solver=ctx.window.WingAirfoilPanel2D;
const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],div=(a,b)=>{const d=b[0]**2+b[1]**2;return[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
function exactJoukowski(alpha){
 const e=.08,R=1+e,lead=-e-R,zle=lead+1/lead,c=2-zle,a=alpha*Math.PI/180,G=4*Math.PI*R*Math.sin(a);
 function at(t){
  const z=[-e+R*Math.cos(t),R*Math.sin(t)],w=[R*Math.cos(t),R*Math.sin(t)],iz=div([1,0],z),J=div([1,0],mul(z,z));
  const s=div([R*R*Math.cos(a),R*R*Math.sin(a)],mul(w,w)),v=div([0,G/(2*Math.PI)],w);
  const q=div([Math.cos(a)-s[0]+v[0],-Math.sin(a)-s[1]+v[1]],[1-J[0],-J[1]]);
  const dz=mul([1-J[0],-J[1]],[-R*Math.sin(t),R*Math.cos(t)]).map(v=>v/c);
  return {x:(z[0]+iz[0]-zle)/c,z:(z[1]+iz[1])/c,cp:1-q[0]**2-q[1]**2,dx:dz[0],dz:dz[1]};
 }
 // Clockwise contour, midpoint quadrature avoids the analytic TE 0/0 form.
 let Fx=0,Fz=0,Cm=0;const n=60000,dt=-2*Math.PI/n;
 for(let i=0;i<n;i++){const p=at((i+.5)*dt),fx=p.cp*p.dz*dt,fz=-p.cp*p.dx*dt;Fx+=fx;Fz+=fz;Cm+=p.z*fx-(p.x-.25)*fz;}
 const cl=2*G/c,quadratureCl=Fz*Math.cos(a)-Fx*Math.sin(a),cd=Fx*Math.cos(a)+Fz*Math.sin(a);
 assert.ok(Math.abs(quadratureCl-cl)<1e-7,'Independent pressure integral agrees with exact circulation lift');
 assert.ok(Math.abs(cd)<1e-7,'Exact inviscid 2D drag is zero');
 return {at,cl,cm:Cm,cd,quadratureCl};
}
const rows=[],profiles=[];
for(const alpha of [-4,0,4,8]){
 const exact=exactJoukowski(alpha),errors=[];
 for(const N of [80,160,320]){
  const points=Array.from({length:N+1},(_,i)=>{const p=exact.at(-2*Math.PI*i/N);return[p.x,p.z];});
  if(alpha===4)fs.writeFileSync(path.join(__dirname,`joukowski_${N}.dat`),'Exact Joukowski e0.08 R1.08 unit chord\n'+points.map(p=>p.map(v=>v.toPrecision(17)).join(' ')).join('\n')+'\n');
  const t=performance.now(),r=solver.solveCoordinates(points,alpha),seconds=(performance.now()-t)/1000;
  const data=r.panels.map((p,i)=>{const e=exact.at(-2*Math.PI*(i+.5)/N);return{x:p.x,side:p.side,cp:p.cp,exact_cp:e.cp,reference_x:e.x};});
  const inside=data.filter(p=>p.x>=.02&&p.x<=.98),rms=Math.sqrt(inside.reduce((s,p)=>s+(p.cp-p.exact_cp)**2,0)/inside.length);
  const row={alphaDeg:alpha,panels:N,cl:r.cl,exact_cl:exact.cl,cm:r.cm,exact_cm:exact.cm,pressure_drag:r.pressureDrag,cl_circulation:r.clCirculation,Cp_RMS_x_02_to_98:rms,cl_error:Math.abs(r.cl-exact.cl),cm_error:Math.abs(r.cm-exact.cm),normal_residual:r.maxResidual,kutta_residual:r.kuttaResidual,seconds};
  rows.push(row);profiles.push({alphaDeg:alpha,panels:N,data});errors.push(row);
  assert.ok(r.maxResidual<1e-9&&r.kuttaResidual<1e-12,'Linear boundary and Kutta residuals');
  assert.ok(r.panels.every(p=>p.cp<=1+1e-12),'Bernoulli Cp upper bound');
  if(N===320){assert.ok(rms<.02,'Cp RMS < 0.02 away from LE/TE');assert.ok(row.cl_error<.004,'Integrated lift absolute error < 0.004');assert.ok(row.cm_error<.002,'Quarter-chord moment absolute error < 0.002');}
 }
 assert.ok(errors[2].Cp_RMS_x_02_to_98<errors[1].Cp_RMS_x_02_to_98&&errors[1].Cp_RMS_x_02_to_98<errors[0].Cp_RMS_x_02_to_98,'Cp converges under independent mesh refinement');
 if(alpha)assert.ok(errors[2].cl_error<errors[1].cl_error&&errors[1].cl_error<errors[0].cl_error,'Lift converges');
}
const result={date:new Date().toISOString(),scope:'Published independent 2D airfoil solver, not the experimental 3D core',source_sha256:crypto.createHash('sha256').update(source).digest('hex'),reference:'Exact symmetric Joukowski map; e=0.08, R=1.08, unit chord. Exact circulation and independent dense pressure integration. No viscous/experimental validation.',sampling:'Panel Cp at midpoint parameter compared to exact curved profile midpoint; 2% chord edge exclusion only for Cp RMS. All panels retained in force/moment integration and profile files.',rows,profiles};
fs.writeFileSync(path.join(__dirname,'AIRFOIL_INDEPENDENT.json'),JSON.stringify(result));
fs.writeFileSync(path.join(__dirname,'AIRFOIL_PROFILES.csv'),'alpha_deg,panels,side,x_c,reference_x_c,Cp,exact_Cp\n'+profiles.flatMap(p=>p.data.map(d=>[p.alphaDeg,p.panels,d.side,d.x,d.reference_x,d.cp,d.exact_cp].join(','))).join('\n')+'\n');
console.log(JSON.stringify(rows,null,2));
