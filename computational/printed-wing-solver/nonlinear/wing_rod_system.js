/* Independent multi-beam rod/sleeve system. Units mm,N,MPa.
 * Bonded: rigid-offset centreline displacement and axial-spin ties.
 * Rod bending rotations remain independent (embedded line-bond idealization).
 * Sleeve: independent rod beams; circular radial clearance, compressive-only
 * frictionless contact, no axial friction and no rod-spin tie. All roots clamped.
 * Small-displacement beam kinematics; no adhesive/contact strength prediction.
 */
const WingRodSystem=(()=>{
'use strict';
const F=typeof WingFrame3D!=='undefined'?WingFrame3D:require('../web/wing_frame3d.js');
const zero=n=>Array.from({length:n},()=>new Float64Array(n)),dot=F.dot,add=F.add,sub=F.sub,mul=F.scale;
function factor(A){
 const d=A.map((r,i)=>Math.sqrt(r[i])),L=zero(A.length);
 for(let i=0;i<A.length;i++)for(let j=0;j<=i;j++){let v=A[i][j]/d[i]/d[j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];if(i===j){if(!(v>0))throw Error('Rod system is singular; check root restraints/contact constraints.');L[i][j]=Math.sqrt(v);}else L[i][j]=v/L[j][j];}
 const back=b=>{const y=new Float64Array(b.length),x=new Float64Array(b.length);for(let i=0;i<b.length;i++){let v=b[i]/d[i];for(let j=0;j<i;j++)v-=L[i][j]*y[j];y[i]=v/L[i][i];}for(let i=b.length-1;i>=0;i--){let v=y[i];for(let j=i+1;j<b.length;j++)v-=L[j][i]*x[j];x[i]=v/L[i][i];}return x.map((v,i)=>v/d[i]);};
 return b=>{const x=back(b);for(let pass=0;pass<4;pass++){const r=A.map((row,i)=>{let sum=0,c=0;for(let j=0;j<row.length;j++){const v=row[j]*x[j],t=sum+v;c+=Math.abs(sum)>=Math.abs(v)?sum-t+v:v-t+sum;sum=t;}return b[i]-(sum+c);}),dx=back(r);dx.forEach((v,i)=>x[i]+=v);}return x;};
}

// Exact force-based flexibility of a root-clamped chain of prismatic frame
// elements. N and the global moment about the origin are constant between
// nodal loads. Integrate D^-1 [N1,M2,M3,T] and the small-rotation kinematics.
// This is the same condensed Euler-Bernoulli element law without forming an
// ill-conditioned global stiffness inverse for each independent sleeve beam.
function cantileverFlex(ns,members,ids,free,nShell){
 if(members.length!==ns.length-1||members.some((e,i)=>e.a!==i||e.b!==i+1))throw Error('Sleeve flexibility requires an ordered, root-clamped beam chain.');
 const inverses=members.map(e=>Array.from({length:4},(_,j)=>{const b=[0,0,0,0];b[j]=1;return F.solveSPD(e.D,b);}));
 return rhs=>{
  const loads=new Float64Array(nShell);ids.forEach((i,j)=>loads[free[i]%nShell]=rhs[j]);
  const forces=Array.from({length:ns.length+1},()=>[0,0,0]),moments=Array.from({length:ns.length+1},()=>[0,0,0]);
  for(let i=ns.length-1;i>=0;i--){const f=Array.from(loads.slice(6*i,6*i+3)),m=Array.from(loads.slice(6*i+3,6*i+6));forces[i]=add(forces[i+1],f);moments[i]=add(moments[i+1],add(m,F.cross(ns[i],f)));}
  const out=new Float64Array(nShell);let u=[0,0,0],theta=[0,0,0];
  for(let i=0;i<members.length;i++){
   const e=members[i],N=forces[i+1],fl=F.toLocal(e.R,N),strain=p=>{const ml=F.toLocal(e.R,sub(moments[i+1],F.cross(p,N))),w=[fl[0],ml[1],ml[2],ml[0]];return [0,1,2,3].map(k=>inverses[i].reduce((v,col,j)=>v+col[k]*w[j],0));},a=strain(ns[i]),b=strain(ns[i+1]),k0=F.toGlobal(e.R,[a[3],a[1],a[2]]),k1=F.toGlobal(e.R,[b[3],b[1],b[2]]),integratedTheta=add(mul(theta,e.L),mul(add(mul(k0,1/3),mul(k1,1/6)),e.L**2));
   u=add(u,add(F.cross(integratedTheta,e.R[0]),mul(e.R[0],e.L*(a[0]+b[0])/2)));theta=add(theta,mul(add(k0,k1),e.L/2));
   out.set([...u,...theta],6*(i+1));
  }
  return Float64Array.from(ids,i=>out[free[i]%nShell]);
 };
}
function offsetRows(arm){const [x,y,z]=arm;return [[1,0,0,0,z,-y],[0,1,0,-z,0,x],[0,0,1,y,-x,0],[0,0,0,1,0,0],[0,0,0,0,1,0],[0,0,0,0,0,1]];}
function solve({nodes,elements,rods,mode='bonded',gap=0,contactStations=null,tolerance=1e-6,maxIterations=6000}){
 if(!['bonded','sleeve'].includes(mode)||!Number.isFinite(gap)||gap<0)throw Error('Choose bonded or sleeve and a finite nonnegative radial clearance.');
 if(!rods?.length||rods.some(r=>r.nodes.length!==nodes.length))throw Error('Rod paths need one node per shell station.');
 const count=nodes.length,nShell=count*6,total=mode==='bonded'?nShell+2*count*rods.length:nShell*(1+rods.length),K=zero(total),f=new Float64Array(total),all=[];
 function insert(ns,es,id){const members=es.map(e=>F.element(ns,e));for(const e of members){let maps=e.dofs.map(d=>{const station=Math.floor(d/6),j=d%6;if(!id)return [[d,1]];if(mode==='sleeve')return [[id*nShell+d,1]];if(j<3)return offsetRows(sub(ns[station],nodes[station]))[j].flatMap((v,k)=>v?[[station*6+k,v]]:[]);const R=F.basis(ns[Math.max(0,station-1)],ns[Math.min(count-1,station+1)]),h=j-3,b=nShell+(id-1)*2*count+2*station;return [...R[0].flatMap((v,k)=>v*R[0][h]?[[station*6+3+k,v*R[0][h]]]:[]),[b,R[1][h]],[b+1,R[2][h]]];});for(let i=0;i<12;i++)for(const[a,v]of maps[i]){f[a]+=v*e.fg[i];for(let j=0;j<12;j++)for(const[b,w]of maps[j])K[a][b]+=v*w*e.kg[i][j];}all.push({id,e,maps});}}
 insert(nodes,elements,0);rods.forEach((r,i)=>insert(r.nodes,r.elements,i+1));
 const fixed=new Set(Array.from({length:mode==='bonded'?1:1+rods.length},(_,i)=>Array.from({length:6},(_,j)=>i*nShell+j)).flat().concat(mode==='bonded'?rods.flatMap((_,i)=>[nShell+i*2*count,nShell+i*2*count+1]):[])),free=Array.from({length:total},(_,i)=>i).filter(i=>!fixed.has(i)),map=new Map(free.map((v,i)=>[v,i])),solveK=(()=>{const blocks=Array.from({length:mode==='bonded'?1:rods.length+1},(_,k)=>{const ids=free.flatMap((v,i)=>(mode==='bonded'||Math.floor(v/nShell)===k)?[i]:[]),back=mode==='sleeve'?cantileverFlex(k?rods[k-1].nodes:nodes,all.filter(a=>a.id===k).map(a=>a.e),ids,free,nShell):factor(ids.map(i=>Float64Array.from(ids,j=>K[free[i]][free[j]])));return {ids,back};});return b=>{const x=new Float64Array(free.length);for(const block of blocks){const z=block.back(block.ids.map(i=>b[i]));block.ids.forEach((d,i)=>x[d]=z[i]);}return x;};})(),ff=Float64Array.from(free,i=>f[i]),u0=solveK(ff),contacts=[];
 if(mode==='sleeve')rods.forEach((r,k)=>{for(let i=1;i<count;i++){if(contactStations&&!contactStations.includes(i))continue;const arm=sub(r.nodes[i],nodes[i]),T=offsetRows(arm),R=F.basis(r.nodes[Math.max(0,i-1)],r.nodes[Math.min(count-1,i+1)]),C=R.slice(1).map(normal=>{const row=new Float64Array(free.length);for(let j=0;j<6;j++){const v=normal.reduce((s,a,h)=>s+a*T[h][j],0);row[map.get(i*6+j)]+=v;}for(let j=0;j<3;j++)row[map.get((k+1)*nShell+i*6+j)]-=normal[j];return row;});contacts.push({rod:k,station:i,C});}});
 const C=contacts.flatMap(c=>c.C),Z=C.map(c=>solveK(c)),W=C.map(a=>Float64Array.from(Z,z=>dot(a,z))),d0=C.map(c=>dot(c,u0));let relative=d0.slice(),iterations=0;
 // Enforce elastic reciprocity at floating-point precision. Independent
 // backsolves can otherwise leave a tiny skew part in the compliance matrix.
 for(let i=0;i<W.length;i++)for(let j=0;j<i;j++){const mean=.5*(W[i][j]+W[j][i]);W[i][j]=W[j][i]=mean;}
 // Convex dual: min 1/2 lambda.W.lambda - d0.lambda + gap sum |lambda_i|.
 // Each exact two-component coordinate minimization is a 2x2 solve plus
 // scalar bisection. No tensile force or artificial contact stiffness.
 const radial=new Float64Array(C.length),Wr=new Float64Array(C.length);let contactResidual=0,contactDefectCorrections=0;
 const maxSweeps=Math.max(10000,maxIterations*20);
 if(contacts.length&&gap===0){const exact=F.solveSPD(W,d0);exact.forEach((v,i)=>radial[i]=v);W.forEach((row,i)=>Wr[i]=dot(row,radial));contactResidual=Math.max(...d0.map((v,i)=>Math.abs(v-Wr[i])));}
 for(iterations=0;gap>0&&iterations<maxSweeps;iterations++){
  for(let k=0;k<contacts.length;k++){
   const i=2*k,a=W[i][i],b=W[i][i+1],c=W[i+1][i+1],x=radial[i],y=radial[i+1],bx=d0[i]-Wr[i]+a*x+b*y,by=d0[i+1]-Wr[i+1]+b*x+c*y;
   let nx=0,ny=0;
   if(Math.hypot(bx,by)>gap){
    const at=mu=>{const aa=a+mu,cc=c+mu,det=aa*cc-b*b;return [(cc*bx-b*by)/det,(aa*by-b*bx)/det];};
    let mu=0;
    if(gap){let lo=0,hi=Math.max(a,c);while(hi*Math.hypot(...at(hi))<gap)hi*=2;for(let j=0;j<44;j++){const mid=(lo+hi)/2;if(mid*Math.hypot(...at(mid))<gap)lo=mid;else hi=mid;}mu=(lo+hi)/2;}
    [nx,ny]=at(mu);
   }
   radial[i]=nx;radial[i+1]=ny;const dx=nx-x,dy=ny-y;
   if(dx||dy)for(let j=0;j<C.length;j++)Wr[j]+=W[j][i]*dx+W[j][i+1]*dy;
  }
  if(iterations%10===0&&iterations>0){
   const groups=contacts.map((_,k)=>k).filter(k=>Math.hypot(radial[2*k],radial[2*k+1])>1e-10),ids=groups.flatMap(k=>[2*k,2*k+1]);
   if(ids.length){
    const H=ids.map(i=>Float64Array.from(ids,j=>W[i][j])),rhs=ids.map(i=>d0[i]-Wr[i]);
    groups.forEach((k,a)=>{const i=2*k,r=Math.hypot(radial[i],radial[i+1]),n=[radial[i]/r,radial[i+1]/r];for(let h=0;h<2;h++){rhs[2*a+h]-=gap*n[h];for(let j=0;j<2;j++)H[2*a+h][2*a+j]+=gap/r*((h===j?1:0)-n[h]*n[j]);}});
    const du=F.solveSPD(H,rhs),objective=(x,wx)=>.5*dot(x,wx)-dot(d0,x)+gap*contacts.reduce((v,_,k)=>v+Math.hypot(x[2*k],x[2*k+1]),0),old=objective(radial,Wr);
    for(let ls=0;ls<18;ls++){
     const trial=radial.slice();ids.forEach((i,j)=>trial[i]+=du[j]*2**(-ls));const wt=W.map(row=>dot(row,trial));
     const merit=(x,wx)=>Math.max(0,...contacts.map((_,k)=>{const i=2*k,r=Math.hypot(x[i],x[i+1]),dx=d0[i]-wx[i],dy=d0[i+1]-wx[i+1];return r>1e-12?Math.hypot(dx-gap*x[i]/r,dy-gap*x[i+1]/r):Math.max(0,Math.hypot(dx,dy)-gap);}));
     if(merit(trial,wt)<merit(radial,Wr)*(1-1e-4*2**(-ls))){trial.forEach((v,i)=>radial[i]=v);wt.forEach((v,i)=>Wr[i]=v);break;}
    }
   }
  }
  if(iterations%10===0){
   contactResidual=0;
   for(let k=0;k<contacts.length;k++){const i=2*k,x=d0[i]-Wr[i],y=d0[i+1]-Wr[i+1],r=Math.hypot(radial[i],radial[i+1]);contactResidual=Math.max(contactResidual,r>1e-12?Math.hypot(x-gap*radial[i]/r,y-gap*radial[i+1]/r):Math.max(0,Math.hypot(x,y)-gap));}
   if(contactResidual<=tolerance*.5){
    // Check the actual primal field, not only the approximate dual compliance.
    // Correct its numerical defect without changing any applied load or gap.
    const rhs=ff.map((v,i)=>v-C.reduce((sum,c,j)=>sum+c[i]*radial[j],0)),primal=solveK(rhs),actual=C.map(c=>dot(c,primal));
    const trueResidual=Math.max(0,...contacts.map((_,k)=>{const i=2*k,r=Math.hypot(radial[i],radial[i+1]),x=actual[i],y=actual[i+1];return r>1e-12?Math.hypot(x-gap*radial[i]/r,y-gap*radial[i+1]/r):Math.max(0,Math.hypot(x,y)-gap);}));
    if(trueResidual<=tolerance*.5)break;
    actual.forEach((v,i)=>d0[i]=v+Wr[i]);contactDefectCorrections++;
   }
  }
 }
 if(mode==='sleeve'&&(maxIterations===0||iterations===maxSweeps))throw Error('Circular sleeve contact did not converge; no partial structural result accepted.');
 relative=d0.map((v,i)=>v-Wr[i]);
 const contactRhs=ff.map((v,i)=>v-C.reduce((s,c,j)=>s+c[i]*radial[j],0)),uf=solveK(contactRhs),u=new Float64Array(total);free.forEach((d,i)=>u[d]=uf[i]);
 relative=C.map(c=>dot(c,uf));
 contactResidual=Math.max(0,...contacts.map((_,k)=>{const i=2*k,r=Math.hypot(radial[i],radial[i+1]),x=relative[i],y=relative[i+1];return r>1e-12?Math.hypot(x-gap*radial[i]/r,y-gap*radial[i+1]/r):Math.max(0,Math.hypot(x,y)-gap);}));
 const residual=K.map((r,i)=>dot(r,u)-f[i]);C.forEach((c,j)=>c.forEach((v,i)=>residual[free[i]]+=v*radial[j]));
 const recover=id=>all.filter(a=>a.id===id).map(({e,maps})=>{const ug=maps.map(row=>row.reduce((s,[d,v])=>s+v*u[d],0)),ul=e.T.map(row=>dot(row,ug)),bubble=(e.axialMode.load-dot(e.axialMode.coupling,ul))/e.axialMode.stiffness;return {...e,ul,bubble};});
 const members=recover(0),rodMembers=rods.map((_,i)=>recover(i+1)),displacements=nodes.map((_,i)=>Array.from(u.slice(i*6,i*6+3))),rotations=nodes.map((_,i)=>Array.from(u.slice(i*6+3,i*6+6))),contact=contacts.map((c,i)=>({...c,C:undefined,radialDisplacement:relative.slice(2*i,2*i+2),force: Array.from(radial.slice(2*i,2*i+2)),gap})),maxPenetration=Math.max(0,...contact.map(c=>Math.hypot(...c.radialDisplacement)-gap)),freeResidual=Math.max(0,...free.map(i=>Math.abs(residual[i]))),scale=Math.max(1,...f.map(Math.abs));
 if(maxPenetration>tolerance*1.01||freeResidual>1e-5*scale)throw Error('Rod equilibrium/contact checks failed; no accepted response. '+JSON.stringify({maxPenetration,gapTolerance:tolerance*1.01,freeResidual,residualTolerance:1e-5*scale,contactResidual,iterations}));
 const totalForce=[0,0,0],totalMoment=[0,0,0],supportForce=[0,0,0],supportMoment=[0,0,0];
 // Sum loads on their physical body nodes, before constraint elimination.
 for(const {id,e} of all){const ns=id?rods[id-1].nodes:nodes;for(let h=0;h<2;h++){const af=Array.from(e.fg.slice(6*h,6*h+3)),am=add(Array.from(e.fg.slice(6*h+3,6*h+6)),F.cross(ns[h?e.b:e.a],af));for(let j=0;j<3;j++){totalForce[j]+=af[j];totalMoment[j]+=am[j];}}}
 for(let id=0;id<(mode==='bonded'?1:rods.length+1);id++){
  const point=id?rods[id-1].nodes[0]:nodes[0],base=id*nShell,rf=Array.from(residual.slice(base,base+3)),rm=add(Array.from(residual.slice(base+3,base+6)),F.cross(point,rf));for(let j=0;j<3;j++){supportForce[j]+=rf[j];supportMoment[j]+=rm[j];}
 }
 if(mode==='bonded')rods.forEach((r,i)=>{const R=F.basis(r.nodes[0],r.nodes[1]),b=nShell+i*2*count;for(let j=0;j<3;j++)supportMoment[j]+=R[1][j]*residual[b]+R[2][j]*residual[b+1];});
 const forceError=F.norm(add(totalForce,supportForce)),momentError=F.norm(add(totalMoment,supportMoment));
 const internalWork=all.reduce((s,a)=>s+a.e.axialMode.load**2/a.e.axialMode.stiffness,0),energy=.5*[...members,...rodMembers.flat()].reduce((sum,e)=>sum+F.GAUSS.reduce((v,[t,w])=>{const strain=F.strainMatrix(t,e.L,true).map(row=>dot(row,[...e.ul,e.bubble]));return v+w*e.L*dot(strain,e.D.map(row=>dot(row,strain)));},0),0),work=dot(u,f)+internalWork,contactWork=dot(radial,relative),energyError=Math.abs(2*energy-work+contactWork)/Math.max(1,Math.abs(work));
 if(forceError>1e-5*Math.max(1,F.norm(totalForce))||momentError>1e-5*Math.max(1,F.norm(totalMoment))||energyError>1e-7||contactResidual>tolerance)throw Error('Rod force/moment/energy/contact verification failed; no accepted response. '+JSON.stringify({forceError,momentError,energyError,contactResidual,maxPenetration}));
 return {nodes,elements:members,rodElements:rodMembers,displacements,rotations,u,applied:f.slice(0,nShell),reactions:[...fixed].map(d=>({dof:d,value:residual[d]})),energy,work,verification:{forceError,momentError,totalForce,totalMoment,supportForce,supportMoment,freeResidual,maxPenetration,energyError,iterations,contactResidual,contactDefectCorrections,contactWork},contact,mode,method:mode==='bonded'?'Separate rod beams with centreline displacement and axial-spin bonded ties; independent rod bending rotations':'Separate rod beams with unilateral circular-clearance frictionless sleeve contact',scope:'Small displacement; shell and every rod root fully clamped; continuous sleeve sampled at beam stations; no friction, glue failure, bearing strength, sleeve crushing or geometric nonlinearity.'};
}
return {solve,offsetRows};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingRodSystem;
