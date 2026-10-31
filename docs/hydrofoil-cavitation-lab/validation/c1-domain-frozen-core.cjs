/* Hydrofoil Cavitation Lab 0.1.1 — research prototype, not experimental validation.
 * Original implementation of the potential mixed-boundary formulation described in:
 * Kinnas & Fine (1993), doi:10.1017/S0022112093002071;
 * Kinnas (2010), chapter 9, eqs. 9.9–9.16;
 * Krishnaswamy (2000/2001), section 3.3, eqs. 3.23–3.30.
 * No upstream implementation or reference measurements are embedded here.
 * Coordinates/chord and freestream speed are normalized to 1 inside the BEM.
 * CCW contour, body-outward normal into liquid, upper cavity s runs downstream.
 */
(function(root){
'use strict';
const TWO_PI=2*Math.PI, VERSION='0.1.1';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const maxabs=a=>Math.max(...Array.from(a,Math.abs));
const sum=a=>a.reduce((s,v)=>s+v,0);
const fail=m=>{throw new Error(m);};
function linearSolve(A,b){
  const n=b.length, a=A.map((r,i)=>Float64Array.from([...r,b[i]]));
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    if(Math.abs(a[pivot][k])<1e-13)fail('Singular mixed-boundary system. Change the section, detachment station or mesh.');
    [a[k],a[pivot]]=[a[pivot],a[k]];
    for(let i=k+1;i<n;i++){
      const v=a[i][k]/a[k][k];a[i][k]=0;
      for(let j=k+1;j<=n;j++)a[i][j]-=v*a[k][j];
    }
  }
  const x=new Float64Array(n);
  for(let i=n-1;i>=0;i--){let v=a[i][n];for(let j=i+1;j<n;j++)v-=a[i][j]*x[j];x[i]=v/a[i][i];}
  let residual=0;
  for(let i=0;i<n;i++){let v=-b[i];for(let j=0;j<n;j++)v+=A[i][j]*x[j];residual=Math.max(residual,Math.abs(v));}
  if(!Number.isFinite(residual)||residual>1e-8)fail('The mixed-boundary linear residual failed.');
  return {x,residual};
}
function geometry(points){
  const panels=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(!(length>1e-10))fail('Zero-length boundary panel.');
    panels.push({a,b,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,length,t:[dx/length,dy/length],n:[dy/length,-dx/length]});
  }
  return panels;
}
function influences(p,c,self=false){
  const dx=c[0]-p.a[0],dy=c[1]-p.a[1],X=dx*p.t[0]+dy*p.t[1],Y=-dx*p.t[1]+dy*p.t[0],L=p.length;
  const F=u=>.5*u*Math.log(Math.max(1e-300,u*u+Y*Y))-u+Math.abs(Y)*Math.atan2(u,Math.abs(Y));
  return {S:(F(L-X)-F(-X))/TWO_PI,D:self?0:Math.atan2(Y*L,X*X-X*L+Y*Y)/TWO_PI};
}
function matrices(points,wake=true){
  const p=geometry(points),N=p.length;
  const S=Array.from({length:N},()=>new Float64Array(N)),K=S.map(()=>new Float64Array(N));
  const te=new Float64Array(N);
  te[0]=1+p[0].length/(p[0].length+p[1].length);te[1]=-p[0].length/(p[0].length+p[1].length);
  te[N-1]=-1-p[N-1].length/(p[N-1].length+p[N-2].length);te[N-2]=p[N-1].length/(p[N-1].length+p[N-2].length);
  for(let i=0;i<N;i++){
    const W=wake?-Math.atan2(p[i].y-points[0][1],points[0][0]-p[i].x)/TWO_PI:0;
    for(let j=0;j<N;j++){const q=influences(p[j],[p[i].x,p[i].y],i===j);S[i][j]=q.S;K[i][j]=q.D+W*te[j]+(i===j?.5:0);}
  }
  return {p,S,K,te};
}
function regionDerivative(xs,ys,i,start,end,maxPoints=5){
  const count=end-start;
  if(count<3)return (ys[end-1]-ys[start])/(xs[end-1]-xs[start]);
  const n=Math.min(maxPoints,count),lo=Math.max(start,Math.min(i-Math.floor(n/2),end-n));let r=0;
  const scale=Math.max(...Array.from({length:n},(_,k)=>Math.abs(xs[lo+k]-xs[i]))),xi=Array.from({length:n},(_,k)=>(xs[lo+k]-xs[i])/scale);
  for(let j=0;j<n;j++){
    let denominator=1,numerator=0;
    for(let k=0;k<n;k++)if(k!==j)denominator*=xi[j]-xi[k];
    for(let m=0;m<n;m++)if(m!==j){let term=1;for(let k=0;k<n;k++)if(k!==j&&k!==m)term*=-xi[k];numerator+=term;}
    r+=ys[lo+j]*numerator/denominator/scale;
  }
  return r;
}
function flow(alpha){const a=alpha*Math.PI/180;return [Math.cos(a),Math.sin(a)];}
function surfaceTangentialSpeed(points,phi,alpha=0,breaks=[],stencilSize=5){
  if(stencilSize!==3&&stencilSize!==5)fail('Use a three- or five-point surface gradient stencil.');
  const p=geometry(points),U=flow(alpha),bounds=[0,...breaks,p.length];let arc=0;
  const s=p.map(v=>{const mid=arc+v.length/2;arc+=v.length;return mid;});
  // Differentiate TOTAL potential with one common five-point geometric stencil.
  // An exact panel U.t plus a finite-difference perturbation-potential derivative
  // mixes two geometric approximations and fails at a corner even for an
  // exactly linear total potential. No cavity BC target is inserted here.
  const total=phi.map((v,i)=>v+dot([p[i].x,p[i].y],U));
  return p.map((_,i)=>{const k=bounds.findIndex((b,j)=>j<bounds.length-1&&i>=b&&i<bounds[j+1]);return regionDerivative(s,total,i,bounds[k],bounds[k+1],stencilSize);});
}
function integrate(p,cp,alpha){
  let fx=0,fy=0,cm=0;
  for(let i=0;i<p.length;i++){const x=-cp[i]*p[i].n[0]*p[i].length,y=-cp[i]*p[i].n[1]*p[i].length;fx+=x;fy+=y;cm+=(p[i].x-.25)*y-p[i].y*x;}
  const U=flow(alpha);return {cl:fy*U[0]-fx*U[1],pressureDrag:fx*U[0]+fy*U[1],cm,fx,fy};
}
function wetted(points,alpha=0,wake=true){
  const {p,S,K,te}=matrices(points,wake),U=flow(alpha),q=p.map(v=>-dot(v.n,U));
  const b=S.map(r=>sum(Array.from(r,(v,j)=>v*q[j]))),sol=linearSolve(K,b),phi=Array.from(sol.x);
  // Preserve the previously verified fully-wetted postprocessor. The mixed-
  // boundary candidate below has a separate total-potential derivative study.
  let arc=0;const s=p.map(v=>{const mid=arc+v.length/2;arc+=v.length;return mid;});
  const vt=p.map((v,i)=>dot(v.t,U)+regionDerivative(s,phi,i,0,p.length,3)),cp=vt.map(v=>1-v*v);
  return {points,panels:p,phi,q,cp,vt,linearResidual:sol.residual,circulation:dotDense(te,phi),...integrate(p,cp,alpha)};
}
function dotDense(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
// Assembly diagnostic, not an independent cavitating-flow reference. Prescribe
// the discrete fully-wetted potential on a panel block and recover its Neumann
// data from the mixed system. This checks the mixed-column signs and ordering.
function mixedBoundaryDiagnostic(points,alpha=0,indices=[]){
  const reference=wetted(points,alpha),{p,S,K}=matrices(points),N=p.length;
  const cavity=[...new Set(indices)];
  if(!cavity.length||cavity.length>=N||cavity.some(j=>!Number.isInteger(j)||j<0||j>=N))fail('Choose a proper, nonempty block of boundary panel indices.');
  const set=new Set(cavity),wet=Array.from({length:N},(_,j)=>j).filter(j=>!set.has(j));
  const A=Array.from({length:N},()=>new Float64Array(N)),b=new Float64Array(N);
  for(let i=0;i<N;i++){
    wet.forEach((j,k)=>{A[i][k]=K[i][j];b[i]+=S[i][j]*reference.q[j];});
    cavity.forEach((j,k)=>{A[i][wet.length+k]=-S[i][j];b[i]-=K[i][j]*reference.phi[j];});
  }
  const solution=linearSolve(A,b),potentialError=maxabs(wet.map((j,k)=>solution.x[k]-reference.phi[j]));
  const normalDerivativeError=maxabs(cavity.map((j,k)=>solution.x[wet.length+k]-reference.q[j]));
  return {boundaryPanels:N,dirichletPanels:cavity.length,potentialError,normalDerivativeError,linearResidual:solution.residual};
}
const cosine=(a,b,n)=>Array.from({length:n+1},(_,i)=>a+(b-a)*(1-Math.cos(Math.PI*i/n))/2);
function ordinate(x,t){return 5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x*x*x-.1036*x*x*x*x);}
function buildFoil(o){
  const n=o.resolution,xd=o.detachment,xe=xd+o.length,nc=n,nu=Math.max(8,Math.round(n/3));
  const xs=[...cosine(0,xd,nu).slice(0,-1),...cosine(xd,xe,nc).slice(0,-1),...cosine(xe,1,n)];
  const up=xs.map(x=>[x,ordinate(x,o.thickness)]).reverse(),lo=cosine(0,1,n).map(x=>[x,-ordinate(x,o.thickness)]);
  up[0][1]=0;lo[lo.length-1][1]=0;
  const points=[...up,...lo.slice(1)],p=geometry(points),ids=[];
  for(let i=p.length-1;i>=0;i--)if(i<up.length-1&&p[i].x>xd&&p[i].x<xe)ids.push(i);
  const nodes=[ids[0]+1,...ids],base=nodes.map(i=>points[i].slice());
  const foilS=[0];for(let i=0;i<base.length-1;i++)foilS.push(foilS[i]+Math.hypot(base[i+1][0]-base[i][0],base[i+1][1]-base[i][1]));
  return {points,ids,nodes,base,foilS};
}
function recoveryProfile(foilS,o){
  const end=foilS.at(-1),start=end*(1-o.recovery),width=end-start;
  if(o.recovery===0||o.attenuation===0)return {g:()=>1,I:s=>s,start:end,end};
  const g=s=>1-o.attenuation*Math.pow(Math.max(0,(s-start)/width),o.exponent);
  const I=s=>s-o.attenuation*Math.pow(Math.max(0,s-start),o.exponent+1)/((o.exponent+1)*Math.pow(width,o.exponent));
  return {g,I,start,end};
}
function mixed(points,ids,foilS,o){
  const {p,S,K,te}=matrices(points),N=p.length,wet=[],set=new Set(ids),m=ids.length,U=flow(o.alpha);
  for(let i=0;i<N;i++)if(!set.has(i))wet.push(i);
  const profile=recoveryProfile(foilS,o),qKnown=p.map(v=>-dot(v.n,U)),phiConst=new Float64Array(N),speedIntegral=new Float64Array(N),g=[];
  let cumulative=0;
  const rd=points[ids[0]+1];
  for(let k=0;k<m;k++){
    const j=ids[k],sf0=foilS[k],sf1=foilS[k+1],mid=(sf0+sf1)/2,ratio=p[j].length/(sf1-sf0);
    g.push(profile.g(mid));
    speedIntegral[j]=cumulative+ratio*(profile.I(mid)-profile.I(sf0));
    cumulative+=ratio*(profile.I(sf1)-profile.I(sf0));
    phiConst[j]=-dot([p[j].x-rd[0],p[j].y-rd[1]],U);
  }
  const A=Array.from({length:N+2},()=>new Float64Array(N+2)),b=new Float64Array(N+2);
  for(let i=0;i<N;i++){
    for(let k=0;k<wet.length;k++){const j=wet[k];A[i][k]=K[i][j];b[i]+=S[i][j]*qKnown[j];}
    for(let k=0;k<m;k++){const j=ids[k];A[i][wet.length+k]=-S[i][j];A[i][N]+=K[i][j];A[i][N+1]+=K[i][j]*speedIntegral[j];b[i]-=K[i][j]*phiConst[j];}
  }
  // Extra phiD unknown plus this cubic anchor is equivalent to eliminating phiD.
  const first=ids[0]+1,wi=Array.from({length:4},(_,j)=>first+j),sw=[];let dist=0;
  for(const j of wi){if(!wet.includes(j))fail('Detachment needs four upstream wetted panels.');sw.push(dist+p[j].length/2);dist+=p[j].length;}
  for(let j=0;j<4;j++){
    let w=1;for(let k=0;k<4;k++)if(k!==j)w*=-sw[k]/(sw[j]-sw[k]);
    A[N][wet.indexOf(wi[j])]=w;
  }
  A[N][N]=-1;
  for(let k=0;k<m;k++){const j=ids[k],weight=p[j].length/g[k];A[N+1][wet.length+k]=weight;b[N+1]-=dot(p[j].n,U)*weight;}
  const sol=linearSolve(A,b),z=sol.x,q=qKnown.slice(),phi=Array(N).fill(0);
  wet.forEach((j,k)=>phi[j]=z[k]);
  ids.forEach((j,k)=>{phi[j]=z[N]+z[N+1]*speedIntegral[j]+phiConst[j];q[j]=z[wet.length+k];});
  const qc=z[N+1],vn=ids.map(j=>dot(p[j].n,U)+q[j]),dh=[0];
  if(!(qc>0&&qc<8))fail('No admissible forward cavity-speed branch was found.');
  for(let k=0;k<m;k++)dh.push(dh[k]+vn[k]*p[ids[k]].length/(qc*g[k]));
  return {p,phi,q,qc,sigma:qc*qc-1,vn,dh,g,profile,linearResidual:sol.residual,circulation:dotDense(te,phi)};
}
function options(input={},scope='standard'){
  const o={thickness:.12,alpha:4,detachment:.01,length:.4,resolution:32,recovery:.15,attenuation:.3,exponent:1,relaxation:.4,maxIterations:100,normalTolerance:1e-5,shapeTolerance:1e-6,...input};
  const benchmark=scope==='thin-foil-benchmark';
  for(const k of Object.keys(o))if(!Number.isFinite(o[k]))fail('Every solver setting must be a finite number.');
  if(o.thickness<(benchmark?.0001:.04)||o.thickness>.2)fail('The thickness ratio is outside this calculation mode. The GUI supports 0.04–0.20.');
  if(o.alpha<=0||o.alpha>10)fail('Upper-surface partial-cavity mode currently requires 0 < angle of attack ≤ 10 degrees.');
  if(o.detachment<(benchmark?1e-4:.002)||o.detachment>.15||o.length<.06||o.detachment+o.length>.85)fail('Use detachment 0.002–0.15 and a partial cavity ending before x/c = 0.85.');
  if(!Number.isInteger(o.resolution)||o.resolution<16||o.resolution>(benchmark?192:96))fail('Resolution must be an integer from 16 to 96 in the GUI (192 in the asymptotic benchmark).');
  if(o.recovery<(benchmark?0:.05)||o.recovery>.4||(benchmark?o.attenuation<0:o.attenuation<=0)||o.attenuation>=.75||o.exponent<.5||o.exponent>4)fail('Invalid pressure-recovery closure parameters.');
  if(o.relaxation<.05||o.relaxation>.65||o.maxIterations<1||o.maxIterations>300||!Number.isInteger(o.maxIterations))fail('Invalid iteration controls.');
  if(o.normalTolerance<=0||o.normalTolerance>1e-3||o.shapeTolerance<=0||o.shapeTolerance>1e-4)fail('Residual tolerances must remain within the research admission range.');
  return o;
}
function* iterate(input={},scope='standard'){
  const o=options(input,scope),mesh=buildFoil(o),original=mesh.points.map(p=>p.slice()),points=mesh.points.map(p=>p.slice()),history=[];
  const fullyWetted=wetted(original,o.alpha);let r,converged=false,reason='Iteration limit reached.';
  for(let it=0;it<o.maxIterations;it++){
    r=mixed(points,mesh.ids,mesh.foilS,o);
    const row={iteration:it+1,sigma:r.sigma,maxNormalVelocity:maxabs(r.vn),maxShapeCorrection:maxabs(r.dh),linearResidual:r.linearResidual,closureError:Math.abs(r.dh.at(-1))};
    history.push(row);yield row;
    if(row.maxNormalVelocity<o.normalTolerance&&row.maxShapeCorrection<o.shapeTolerance){converged=true;reason='Discrete cavity equations converged.';break;}
    if(it===o.maxIterations-1)break;
    // Normal correction reparameterized onto fixed x stations: dz = dh / n_y.
    // No height clipping or pressure clipping is applied.
    for(let k=1;k<mesh.nodes.length-1;k++){
      const nz=(r.p[mesh.ids[k-1]].n[1]+r.p[mesh.ids[k]].n[1])/2;
      if(nz<.1)fail('The cavity folds over; this graph-surface prototype cannot continue.');
      const dz=o.relaxation*r.dh[k]/nz;
      if(Math.abs(dz)>.1)fail('The cavity update left the small-correction range. Change the detachment/closure parameters.');
      points[mesh.nodes[k]][1]+=dz;
    }
  }
  const height=mesh.nodes.map(i=>({x:points[i][0],h:points[i][1]-ordinate(points[i][0],o.thickness),y:points[i][1]}));
  const minimumHeight=Math.min(...height.map(v=>v.h));
  const geometryValid=minimumHeight>=-1e-8&&height.every(v=>v.h<.25)&&r.sigma>0;
  if(!geometryValid){converged=false;reason=minimumHeight< -1e-8?'The computed cavity intersects the foil. This branch is rejected; change detachment or closure settings.':'The computed branch has no positive cavitation number or an excessive cavity height.';}
  const lo=Math.min(...mesh.ids),hi=Math.max(...mesh.ids)+1;
  // Do not differentiate across a mixed-boundary junction with a single stencil.
  // Each side uses its own polynomial derivative; no values are smoothed or clipped.
  const U=flow(o.alpha),vt=surfaceTangentialSpeed(points,r.phi,o.alpha,[lo,hi]),vnAll=r.p.map((v,i)=>dot(v.n,U)+r.q[i]);
  // Pressure is reconstructed from solved total-potential derivatives. The prescribed
  // cavity target is a separate diagnostic and is NOT substituted for measured residuals.
  const cp=vt.map((v,i)=>1-v*v-vnAll[i]*vnAll[i]);
  const cpTarget=mesh.ids.map((j,k)=>1-(r.qc*r.g[k])**2);
  const pressureError=mesh.ids.map((j,k)=>cp[j]-cpTarget[k]);
  const plateau=mesh.ids.map((j,k)=>mesh.foilS[k+1]<=r.profile.start?pressureError[k]:null).filter(v=>v!==null);
  const pressureRMS=Math.sqrt(sum(plateau.map(v=>v*v))/Math.max(1,plateau.length));
  const fluxError=Math.abs(sum(r.q.map((q,j)=>q*r.p[j].length)));
  const near=[];for(let k=0;k<mesh.ids.length;k++)near.push(mesh.ids[k]);
  const targetByPanel=Object.fromEntries(mesh.ids.map((j,k)=>[j,cpTarget[k]]));
  const closurePanel=r.p[lo],aftWetPanel=r.p[lo-1];
  const metrics={...history.at(-1),minimumHeight,maximumHeight:Math.max(...height.map(v=>v.h)),fluxError,pressureReconstructionRMS:pressureRMS,
    closureTurningAngleDeg:Math.acos(Math.max(-1,Math.min(1,dot(closurePanel.t,aftWetPanel.t))))*180/Math.PI,
    closurePanelNormalY:closurePanel.n[1],
    maximumPressureReconstructionError:maxabs(pressureError),discreteConverged:converged,geometryValid,
    pressureNote:'Pressure residual uses a local five-point derivative of solved total potential within each boundary region (fewer points if needed), with one-sided stencils at detachment and closure. It compares to an imposed BC, not an experiment.'};
  return {version:VERSION,status:converged?'converged-prototype':'rejected',reason,options:o,points,original,panels:r.p.map((p,i)=>({...p,cp:cp[i],potential:r.phi[i],normalDerivative:r.q[i],tangentialSpeed:vt[i],normalVelocity:vnAll[i],fullyWettedCp:fullyWetted.cp[i],cavity:targetByPanel[i]!==undefined,targetCp:targetByPanel[i]??null})),
    sigma:r.sigma,cavitySpeedRatio:r.qc,height,history,metrics,coefficients:integrate(r.p,cp,o.alpha),fullyWetted:{cl:fullyWetted.cl,cm:fullyWetted.cm,cpMin:Math.min(...fullyWetted.cp),panels:fullyWetted.panels.map((p,i)=>({x:p.x,y:p.y,cp:fullyWetted.cp[i]}))},
    calculationMode:scope,scope:'Steady 2-D inviscid potential flow; prescribed upper partial-cavity length and detachment; algebraic pressure recovery; no re-entrant jet, viscosity, shedding, erosion or 3-D wing solution. Numerically verified prototype; cavitation predictions not experimentally validated.',
    provenance:{formulation:'Constant source/doublet mixed-potential BIE; cubic upstream detachment potential; extrapolated Morino TE jump; fixed-x nonlinear cavity updates.',closure:'q(s)=qc[1-A((sf-sT)/(sL-sT))^nu] in the recovery zone; sf is the original foil arclength. A, lambda and nu are model inputs, not fitted benchmark data.'}};
}
function solve(input={},scope='standard'){const it=iterate(input,scope);let r;do{r=it.next();}while(!r.done);return r.value;}
function liquid(input={}){
  const o={rho:998.2,speed:15,pressureAbsolute:101325,vapourPressure:2339,chord:.16,...input};
  if(Object.values(o).some(v=>!Number.isFinite(v))||o.rho<=0||o.speed<=0||o.chord<=0||o.vapourPressure<0||o.pressureAbsolute<=o.vapourPressure)fail('Use positive liquid density, speed and chord, and absolute ambient pressure above vapour pressure.');
  const dynamicPressure=.5*o.rho*o.speed**2;
  return {...o,dynamicPressure,sigma:(o.pressureAbsolute-o.vapourPressure)/dynamicPressure};
}
const api={VERSION,solve,iterate,wetted,geometry,influences,liquid,options,ordinate,buildFoil,mixedBoundaryDiagnostic,surfaceTangentialSpeed,solveBenchmark:input=>solve(input,'thin-foil-benchmark')};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.HydrofoilCavitation=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
