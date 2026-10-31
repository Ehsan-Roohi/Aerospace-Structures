// Isolated numerical experiment. No changes to the default numerical kernel.
// Independent wake jump plus a linear total-velocity Kutta row, following the
// boundary-condition distinction in Krishnaswamy thesis §2.3, eqs.2.41–2.42.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=String.raw`
function velocityKuttaWeights(p){
  let arc=0;const s=p.map(v=>{const q=arc+v.length/2;arc+=v.length;return q;}),N=p.length,w=new Float64Array(N);
  for(let j=0;j<N;j++)if(j<5||j>=N-5){const e=new Float64Array(N);e[j]=1;w[j]=regionDerivative(s,e,0,0,5,5)+regionDerivative(s,e,N-1,N-5,N,5);}
  return w;
}
function wettedVelocity(points,alpha=0){
  const {p,S,K}=matrices(points,false),N=p.length,U=flow(alpha),q=p.map(v=>-dot(v.n,U)),w=velocityKuttaWeights(p),A=Array.from({length:N+1},()=>new Float64Array(N+1)),b=new Float64Array(N+1);
  for(let i=0;i<N;i++){for(let j=0;j<N;j++){A[i][j]=K[i][j];b[i]+=S[i][j]*q[j];}A[i][N]=-Math.atan2(p[i].y-points[0][1],points[0][0]-p[i].x)/TWO_PI;}
  for(let j=0;j<N;j++){A[N][j]=w[j];b[N]-=w[j]*dot([p[j].x,p[j].y],U);}
  const sol=linearSolve(A,b),phi=Array.from(sol.x.slice(0,N)),vt=surfaceTangentialSpeed(points,phi,alpha),cp=vt.map(v=>1-v*v);
  return {points,panels:p,phi,q,vt,cp,circulation:sol.x[N],linearResidual:sol.residual,velocityKuttaResidual:vt[0]+vt.at(-1),...integrate(p,cp,alpha)};
}
function mixedVelocity(points,ids,foilS,o){
  const {p,S,K}=matrices(points,false),N=p.length,U=flow(o.alpha),set=new Set(ids),wet=[],m=ids.length;
  for(let j=0;j<N;j++)if(!set.has(j))wet.push(j);
  const profile=recoveryProfile(foilS,o),known=p.map(v=>-dot(v.n,U)),constant=new Float64Array(N),speed=new Float64Array(N),g=[],rd=points[ids[0]+1];let cumulative=0;
  for(let k=0;k<m;k++){const j=ids[k],s0=foilS[k],s1=foilS[k+1],sm=(s0+s1)/2,ratio=p[j].length/(s1-s0);g.push(profile.g(sm));speed[j]=cumulative+ratio*(profile.I(sm)-profile.I(s0));cumulative+=ratio*(profile.I(s1)-profile.I(s0));constant[j]=-dot([p[j].x-rd[0],p[j].y-rd[1]],U);}
  const A=Array.from({length:N+3},()=>new Float64Array(N+3)),b=new Float64Array(N+3);
  for(let i=0;i<N;i++){
    for(let k=0;k<wet.length;k++){const j=wet[k];A[i][k]=K[i][j];b[i]+=S[i][j]*known[j];}
    for(let k=0;k<m;k++){const j=ids[k];A[i][wet.length+k]=-S[i][j];A[i][N]+=K[i][j];A[i][N+1]+=K[i][j]*speed[j];b[i]-=K[i][j]*constant[j];}
    A[i][N+2]=-Math.atan2(p[i].y-points[0][1],points[0][0]-p[i].x)/TWO_PI;
  }
  const wi=Array.from({length:4},(_,j)=>ids[0]+1+j),sw=[];let distance=0;
  for(const j of wi){sw.push(distance+p[j].length/2);distance+=p[j].length;}
  for(let j=0;j<4;j++){let w=1;for(let k=0;k<4;k++)if(j!==k)w*=-sw[k]/(sw[j]-sw[k]);A[N][wet.indexOf(wi[j])]=w;}A[N][N]=-1;
  for(let k=0;k<m;k++){const j=ids[k],v=p[j].length/g[k];A[N+1][wet.length+k]=v;b[N+1]-=v*dot(p[j].n,U);}
  const w=velocityKuttaWeights(p);
  for(let j=0;j<N;j++){
    if(!w[j])continue;
    const k=wet.indexOf(j);if(k>=0)A[N+2][k]+=w[j];else{A[N+2][N]+=w[j];A[N+2][N+1]+=w[j]*speed[j];b[N+2]-=w[j]*constant[j];}
    b[N+2]-=w[j]*dot([p[j].x,p[j].y],U);
  }
  const sol=linearSolve(A,b),z=sol.x,phi=Array(N).fill(0),q=known.slice();
  wet.forEach((j,k)=>phi[j]=z[k]);ids.forEach((j,k)=>{phi[j]=z[N]+z[N+1]*speed[j]+constant[j];q[j]=z[wet.length+k];});
  const qc=z[N+1];if(!(qc>0&&qc<8))fail('No forward velocity-Kutta cavity-speed branch.');
  const vn=ids.map(j=>dot(p[j].n,U)+q[j]),dh=[0];for(let k=0;k<m;k++)dh.push(dh[k]+vn[k]*p[ids[k]].length/(qc*g[k]));
  return {p,phi,q,qc,sigma:qc*qc-1,vn,dh,g,profile,linearResidual:sol.residual,circulation:z[N+2]};
}
`;
function load(){
 let source=fs.readFileSync(path.join(__dirname,'reference/cavity-core-0.2.0-morino.js'),'utf8');
 source=source.replace('function mixed(points,ids,foilS,o){','function mixed(points,ids,foilS,o){ return mixedVelocity(points,ids,foilS,o); /* research alternative */');
 source=source.replace('const api={VERSION,','const api={wettedVelocity,VERSION,');
 source=source.replace('function options(input={},scope=',code+'\nfunction options(input={},scope=');
 const module={exports:{}};new Function('module',source)(module);return module.exports;
}
module.exports=load;
if(require.main===module){
 const C=load(),rows=[];
 for(const resolution of [24,32,48,64]){
  const t=performance.now(),r=C.solve({closureMode:'smooth-contact',resolution});
  const row={resolution,N:r.panels.length,status:r.status,A:r.closure?.selectedAttenuation,sigma:r.sigma,cl:r.coefficients.cl,cm:r.coefficients.cm,corner:r.metrics.closureTurningAngleDeg,pressureResidual:r.metrics.maximumPressureReconstructionError,kuttaResidual:r.panels[0].tangentialSpeed+r.panels.at(-1).tangentialSpeed,seconds:(performance.now()-t)/1000};rows.push(row);console.log(JSON.stringify(row));
 }
 fs.writeFileSync(path.join(__dirname,'velocity-kutta-research.json'),JSON.stringify({status:'RESEARCH_ONLY_NOT_ADOPTED',rows},null,2)+'\n');
}
