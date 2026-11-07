/* Geometrically exact spatial beam, small elastic strains. Optional symmetric
 * transverse-shear compliance gives a Reissner beam; absent compliance retains Kirchhoff.
 * Reference elements and section D use mm, N, MPa. Finite rotations are unit
 * quaternions; position, force and moment equilibrium are solved in space.
 * Distributed loads are per reference span coordinate, not deformed arc length.
 * Independent implementation: r'=Q [1+epsilon,gamma2,gamma3], Q'=Q hat(kappa),
 * n'=-f, m'=-r' cross n-c. Reference element triad jumps preserve natural curvature.
 * Static shooting follows load continuation; convergence is NOT a stability test.
 */
const WingNonlinearBeam=(()=>{
 'use strict';
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,t)=>a.map(v=>v*t),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
 const unit=a=>{const n=norm(a);if(!(n>1e-14))throw Error('Degenerate nonlinear beam axis.');return mul(a,1/n);};
 const qm=(a,b)=>[a[0]*b[0]-dot(a.slice(1),b.slice(1)),...add(add(mul(b.slice(1),a[0]),mul(a.slice(1),b[0])),cross(a.slice(1),b.slice(1)))];
 const qc=q=>[q[0],-q[1],-q[2],-q[3]],qn=q=>mul(q,1/norm(q));
 const rotate=(q,v)=>{const u=q.slice(1),t=mul(cross(u,v),2);return add(v,add(mul(t,q[0]),cross(u,t)));};
 function fromBasis(R){
  const m=[0,1,2].map(i=>R.map(r=>r[i])),t=m[0][0]+m[1][1]+m[2][2];let q;
  if(t>0){const s=2*Math.sqrt(t+1);q=[s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s];}
  else {let i=0;if(m[1][1]>m[i][i])i=1;if(m[2][2]>m[i][i])i=2;const j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]),v=[0,0,0];v[i]=s/4;v[j]=(m[j][i]+m[i][j])/s;v[k]=(m[k][i]+m[i][k])/s;q=[(m[k][j]-m[j][k])/s,...v];}
  return qn(q);
 }
 function rotationVector(q){if(q[0]<0)q=mul(q,-1);const n=norm(q.slice(1));return n<1e-12?mul(q.slice(1),2):mul(q.slice(1),2*Math.atan2(n,q[0])/n);}
 function linearSolve(A,b){A=A.map((r,i)=>[...r,b[i]]);const n=b.length;for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;if(Math.abs(A[p][k])<1e-20)throw Error('Nonlinear beam shooting Jacobian is singular; no equilibrium accepted.');[A[k],A[p]]=[A[p],A[k]];for(let i=k+1;i<n;i++){const f=A[i][k]/A[k][k];for(let j=k;j<=n;j++)A[i][j]-=f*A[k][j];}}const x=new Array(n);for(let i=n-1;i>=0;i--){let s=A[i][n];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i];}return x;}
 function inverse(D){
  if(D.length!==4||D.some(r=>r.length!==4||Array.from(r).some(v=>!Number.isFinite(v))))throw Error('A nonlinear beam section needs a finite 4 by 4 elastic matrix.');
  const C=Array.from({length:4},()=>[0,0,0,0]);for(let i=0;i<4;i++)for(let j=0;j<=i;j++){if(Math.abs(D[i][j]-D[j][i])>1e-10*Math.max(1,Math.abs(D[i][j]),Math.abs(D[j][i])))throw Error('The section elastic matrix must be symmetric.');let v=D[i][j];for(let k=0;k<j;k++)v-=C[i][k]*C[j][k];if(i===j){if(!(v>0))throw Error('The section elastic matrix must be positive definite.');C[i][j]=Math.sqrt(v);}else C[i][j]=v/C[j][j];}
  return D.map((_,j)=>linearSolve(D,D.map((__,i)=>+(i===j)))).map((_,i,cols)=>cols.map(c=>c[i]));}
 function solve(input){
  const {nodes,elements}=input;if(!nodes?.length||!elements?.length)throw Error('A nonlinear beam needs reference nodes and section elements.');
  const steps=input.stepsPerElement??4,tol=input.tolerance??1e-8,maxIterations=input.maxIterations??25;
  if(!Number.isInteger(steps)||steps<1||steps>64)throw Error('Use 1–64 integration steps per reference element.');
  const es=elements.map(e=>{const a=e.spanStart??nodes[e.a][0],b=e.spanEnd??nodes[e.b][0],L=norm(sub(nodes[e.b],nodes[e.a])),R=e.R||(()=>{const x=unit(sub(nodes[e.b],nodes[e.a])),v=e.orientation||[0,1,0],y=unit(sub(v,mul(x,dot(x,v))));return[x,y,cross(x,y)];})();if(!(b>a&&L>0))throw Error('Reference span stations must increase.');const D=e.D||[[e.EA,e.first3||0,-(e.first2||0),0],[e.first3||0,e.EI22,-(e.EI23||0),0],[-(e.first2||0),-(e.EI23||0),e.EI33,0],[0,0,0,e.GJ]];const H=e.shearCompliance;if(H&&(!Array.isArray(H)||H.length!==2||H.some(r=>r.length!==2||Array.from(r).some(v=>!Number.isFinite(v)))||H[0][0]<=0||H[1][1]<=0||Math.abs(H[0][1]-H[1][0])>1e-12*Math.sqrt(H[0][0]*H[1][1])||H[0][0]*H[1][1]-H[0][1]*H[1][0]<=0))throw Error('Transverse shear compliance must be finite, symmetric and positive definite.');return {...e,y0:a,y1:b,L,R,q0:fromBasis(R),invD:inverse(D)};});
  const y0=es[0].y0,y1=es.at(-1).y1,span=y1-y0,root=nodes[es[0].a].slice(),loads=input.distributed||[],points=(input.pointLoads||[]).filter(p=>p.y>y0+1e-10);
  for(const p of loads)if(!Number.isFinite(p.y0)||!Number.isFinite(p.y1)||p.y0<y0||p.y1>y1||p.y1<=p.y0)throw Error('A distributed load must lie within the reference span.');
  for(const p of input.pointLoads||[])if(!Number.isFinite(p.y)||p.y<y0||p.y>y1)throw Error('A point load must lie within the reference span.');
  for(const p of [...loads,...points])for(const v of [...(p.force||[]),...(p.couple||p.moment||[])])if(!Number.isFinite(v))throw Error('Nonlinear beam loads must be finite.');
  const elementAt=y=>{let i=0;while(i<es.length-1&&y>=es[i].y1-1e-10)i++;return es[i];};
  const refAt=(e,y)=>add(nodes[e.a],mul(sub(nodes[e.b],nodes[e.a]),(y-e.y0)/(e.y1-e.y0)));
  const fAt=y=>loads.reduce((s,p)=>add(s,mul(p.force||[0,0,0],Math.max(0,p.y1-Math.max(y,p.y0)))),points.reduce((s,p)=>p.y>y+1e-10?add(s,p.force||[0,0,0]):s,[0,0,0]));
  const knots=[y0,y1,...es.flatMap(e=>Array.from({length:steps+1},(_,k)=>e.y0+(e.y1-e.y0)*k/steps)),...loads.flatMap(p=>[p.y0,p.y1]),...points.map(p=>p.y)].filter(y=>y>=y0&&y<=y1).sort((a,b)=>a-b).filter((y,i,a)=>i===0||y-a[i-1]>1e-8);
  const scale=Math.max(1,norm(fAt(y0))*span,...points.map(p=>norm(p.moment||[0,0,0])),...loads.map(p=>norm(p.couple||[0,0,0])*(p.y1-p.y0)));
  const arm=(p,y,q,e)=>rotate(qm(q,qc(e.q0)),p.armAt?p.armAt(y):(p.arm||[0,0,0]));
  function integrate(M,lambda,collect=false){
   let z=[...root,...es[0].q0,...M],last=es[0],samples=[],segments=[],maxAxialStrain=0,maxShearStrain=0;
   const record=(y,e)=>{if(collect)samples.push({y,position:z.slice(0,3),quaternion:qn(z.slice(3,7)),moment:z.slice(7,10),element:e});};record(y0,last);
   for(let k=1;k<knots.length;k++){
    const a=knots[k-1],b=knots[k],mid=(a+b)/2,h=b-a,e=elementAt(mid);
    if(e!==last){z.splice(3,4,...qn(qm(z.slice(3,7),qm(qc(last.q0),e.q0))));last=e;}
    const active=loads.filter(p=>mid>p.y0&&mid<p.y1),f=mul(active.reduce((s,p)=>add(s,p.force||[0,0,0]),[0,0,0]),lambda),nm=mul(fAt(mid),lambda),ds=e.L/(e.y1-e.y0);
    function rhs(y,s){const q=qn(s.slice(3,7)),n=sub(nm,mul(f,y-mid)),m=s.slice(7,10),nl=rotate(qc(q),n),ml=rotate(qc(q),m),v=[nl[0],ml[1],ml[2],ml[0]],strain=e.invD.map(r=>dot(r,v));maxAxialStrain=Math.max(maxAxialStrain,Math.abs(strain[0]));const gamma=e.shearCompliance?e.shearCompliance.map(r=>r[0]*nl[1]+r[1]*nl[2]):[0,0];maxShearStrain=Math.max(maxShearStrain,norm(gamma));const dr=mul(rotate(q,[1+strain[0],...gamma]),ds),dq=mul(qm(q,[0,strain[3],strain[1],strain[2]]),.5*ds);let c=[0,0,0];for(const p of active)c=add(c,mul(add(cross(arm(p,y,q,e),p.force||[0,0,0]),p.couple||[0,0,0]),lambda));return [...dr,...dq,...mul(add(cross(dr,n),c),-1)];}
    const start=collect?z.slice():null;const k1=rhs(a,z),k2=rhs(mid,add(z,mul(k1,h/2))),k3=rhs(mid,add(z,mul(k2,h/2))),k4=rhs(b,add(z,mul(k3,h)));z=z.map((v,i)=>v+h/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]));z.splice(3,4,...qn(z.slice(3,7)));
    if(collect)segments.push({a,b,start,end:z.slice(),element:e,forceMid:nm,forceDensity:f});
    for(const p of points)if(Math.abs(p.y-b)<1e-8){const q=z.slice(3,7),m=mul(add(p.moment||[0,0,0],cross(arm(p,b,q,e),p.force||[0,0,0])),lambda);for(let j=0;j<3;j++)z[7+j]-=m[j];}
    if(z.some(v=>!Number.isFinite(v)))throw Error('Nonlinear beam integration diverged.');record(b,e);
   }
   return {residual:z.slice(7,10),samples,segments,maxAxialStrain,maxShearStrain,tip:z.slice(0,3)};
  }
  let M=(input.initialRootMoment||[0,0,0]).slice(),previous=0,history=[];
  const stages=input.continuation||[.25,.5,.75,1];if(stages.at(-1)!==1)throw Error('Load continuation must finish at the full requested load.');
  for(const lambda of stages){if(!previous&&input.initialRootMoment)M=mul(input.initialRootMoment,lambda);if(!(lambda>previous&&lambda<=1))throw Error('Continuation fractions must increase to one.');if(previous)M=mul(M,lambda/previous);let converged=false;
   for(let it=0;it<maxIterations;it++){
    const run=integrate(M,lambda),error=norm(run.residual)/scale;history.push({lambda,iteration:it,residual:error});if(error<=tol){converged=true;break;}
    const dh=scale*1e-5,cols=[0,1,2].map(j=>{const d=[0,0,0];d[j]=dh;return mul(sub(integrate(add(M,d),lambda).residual,integrate(sub(M,d),lambda).residual),1/(2*dh));}),J=[0,1,2].map(i=>cols.map(c=>c[i])),delta=linearSolve(J,mul(run.residual,-1));
    let accepted=false;for(let ls=0;ls<12;ls++){const candidate=add(M,mul(delta,2**(-ls)));let trial;try{trial=integrate(candidate,lambda);}catch{continue;}if(norm(trial.residual)<norm(run.residual)){M=candidate;accepted=true;break;}}
    if(!accepted)throw Error(`Nonlinear beam equilibrium did not converge at load fraction ${lambda}; no accepted field returned.`);
   }
   if(!converged)throw Error(`Nonlinear beam iteration limit reached at load fraction ${lambda}.`);previous=lambda;
  }
  const final=integrate(M,1,true);
  function at(y){if(y<y0-1e-7||y>y1+1e-7)throw Error('Nonlinear beam sample lies outside the reference span.');let i=0;while(i<final.segments.length-1&&y>final.segments[i].b)i++;const v=final.segments[i],t=(y-v.a)/(v.b-v.a),e=v.element,aa=v.start.slice(3,7),bb=v.end.slice(3,7),q=qn(add(mul(aa,1-t),mul(bb,(dot(aa,bb)<0?-1:1)*t))),position=add(mul(v.start.slice(0,3),1-t),mul(v.end.slice(0,3),t)),reference=refAt(e,y),moment=add(mul(v.start.slice(7,10),1-t),mul(v.end.slice(7,10),t)),force=sub(v.forceMid,mul(v.forceDensity,y-(v.a+v.b)/2)),delta=qm(q,qc(e.q0)),nl=rotate(qc(q),force),ml=rotate(qc(q),moment),strain=e.invD.map(r=>dot(r,[nl[0],ml[1],ml[2],ml[0]]));return {y,position,reference,displacement:sub(position,reference),quaternion:q,rotation:rotationVector(delta),rotationQuaternion:delta,force,moment,localForce:nl,localMoment:ml,strain,shearStrain:e.shearCompliance?e.shearCompliance.map(r=>r[0]*nl[1]+r[1]*nl[2]):[0,0],R:[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(q,v)),element:e};}
  function deformPoint(y,P){const s=at(y);return add(s.position,rotate(s.rotationQuaternion,sub(P,s.reference)));}
  return {method:es.some(e=>e.shearCompliance)?'Geometrically exact spatial Reissner beam with transverse shear; finite rotations and shooting equilibrium':'Geometrically exact spatial Kirchhoff beam; unit-quaternion finite rotations, load continuation and shooting equilibrium',at,deformPoint,samples:final.samples,rootForce:fAt(y0),rootMoment:M,tipPosition:final.tip,history,maxAxialStrain:final.maxAxialStrain,maxShearStrain:final.maxShearStrain,shearIncluded:es.some(e=>e.shearCompliance),verification:{freeTipMomentResidual: norm(final.residual),relativeResidual:norm(final.residual)/scale,stepsPerElement:steps},scope:'Linear elastic section law, small strain, finite displacement/rotation. Transverse shear is included only when section shear compliance is supplied. No section distortion, material failure, flutter or equilibrium-branch stability certification.'};
 }
 return {solve,rotate,fromBasis,rotationVector,qm,qc,qn,linearSolve,add,sub,mul,dot,cross,norm};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingNonlinearBeam;
