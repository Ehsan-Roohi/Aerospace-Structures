/* Small-displacement spatial Euler–Bernoulli frame, six DOFs/node.
 * mm, N, MPa; rotations rad. Includes axial extension, both bending planes,
 * unsymmetric cross-section bending, axial/bending reference-axis coupling,
 * Saint-Venant torsion, and consistent global forces and eccentric moments.
 * It is a locally prismatic 1-D beam approximation, not a 3-D solid FE model.
 * Strain energy is integrated from [u', kappa_2, kappa_3, phi'] and a symmetric
 * sectional constitutive matrix. Reference axes and loads are explicit.
 */
const WingFrame3D=(()=>{
 'use strict';
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,k)=>a.map(v=>v*k),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
 const unit=a=>{const l=norm(a);if(!(l>1e-12))throw Error('A frame axis is degenerate.');return scale(a,1/l);};
 const zero=(m,n=m)=>Array.from({length:m},()=>new Float64Array(n));
 const finite=(v,name)=>{if(!Number.isFinite(v))throw Error(`${name} must be finite.`);return v;};
 const GAUSS=Object.freeze([[.06943184420297371,.1739274225687269],[.33000947820757187,.3260725774312731],[.6699905217924281,.3260725774312731],[.9305681557970262,.1739274225687269]]);
 function integrate(fn,a,b,tolerance=1e-10,maxDepth=16){
   const gauss=(lo,hi)=>{let out;for(const[t,w]of GAUSS){const value=fn(lo+t*(hi-lo));if(!out)out=new Float64Array(value.length);value.forEach((v,i)=>out[i]+=v*w*(hi-lo));}return out;};
   const refine=(lo,hi,whole,depth)=>{const mid=(lo+hi)/2,left=gauss(lo,mid),right=gauss(mid,hi),sum=left.map((v,i)=>v+right[i]);let relative=0;for(let i=0;i<sum.length;i++)relative=Math.max(relative,Math.abs(sum[i]-whole[i])/Math.max(1,Math.abs(sum[i])));if(depth===0||relative<=tolerance)return sum;const x=refine(lo,mid,left,depth-1),y=refine(mid,hi,right,depth-1);return x.map((v,i)=>v+y[i]);};
   return refine(a,b,gauss(a,b),maxDepth);
 }
 function basis(a,b,orientation=[1,0,0]){
   const e1=unit(sub(b,a));let p=sub(orientation,scale(e1,dot(orientation,e1)));
   if(norm(p)<1e-9){const fallback=Math.abs(e1[2])<.9?[0,0,1]:[0,1,0];p=sub(fallback,scale(e1,dot(fallback,e1)));}
   const e2=unit(p),e3=unit(cross(e1,e2));return[e1,e2,e3];
 }
 function shapes(t,L){
   const H=[1-3*t*t+2*t*t*t,L*(t-2*t*t+t*t*t),3*t*t-2*t*t*t,L*(-t*t+t*t*t)];
   const dH=[(-6*t+6*t*t)/L,1-4*t+3*t*t,(6*t-6*t*t)/L,-2*t+3*t*t];
   const ddH=[(-6+12*t)/(L*L),(-4+6*t)/L,(6-12*t)/(L*L),(-2+6*t)/L];
   return {H,dH,ddH,N:[1-t,t]};
 }
 function strainMatrix(t,L,withAxialBubble=false){
   const {ddH}=shapes(t,L),B=zero(4,withAxialBubble?13:12);
   B[0][0]=-1/L;B[0][6]=1/L;
   if(withAxialBubble)B[0][12]=4*(1-2*t)/L;
   [2,4,8,10].forEach((i,k)=>B[1][i]=ddH[k]*(k%2?1:-1));
   [1,5,7,11].forEach((i,k)=>B[2][i]=ddH[k]);
   B[3][3]=-1/L;B[3][9]=1/L;return B;
 }
 function constitutive(s){
   for(const k of ['EA','EI22','EI33','GJ'])if(!(finite(s[k],k)>0))throw Error(`${k} must be positive.`);
   const EI23=finite(s.EI23??0,'EI23'),first2=finite(s.first2??0,'first2'),first3=finite(s.first3??0,'first3');
   // first2 = integral E*q2 dA, first3 = integral E*q3 dA.
   const D=[[s.EA,first3,-first2,0],[first3,s.EI22,-EI23,0],[-first2,-EI23,s.EI33,0],[0,0,0,s.GJ]];
   cholesky(D);return D;
 }
 function cholesky(A){
   const n=A.length,L=zero(n);
   for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let v=A[i][j];for(let k=0;k<j;k++)v-=L[i][k]*L[j][k];if(i===j){if(!(v>0)||!Number.isFinite(v))throw Error('Frame stiffness is not positive definite; check restraints and section properties.');L[i][j]=Math.sqrt(v);}else L[i][j]=v/L[j][j];}
   return L;
 }
 function solveSPD(A,b){
   // Diagonal equilibration prevents mm/radian stiffness scales degrading SPD
   // admission and gives a useful residual even for slender classroom models.
   const d=A.map((r,i)=>{if(!(r[i]>0))throw Error('A frame DOF has no positive stiffness.');return Math.sqrt(r[i]);});
   const C=A.map((r,i)=>Float64Array.from(r,(v,j)=>v/(d[i]*d[j]))),L=cholesky(C),n=b.length;
   const back=rhs=>{const y=new Float64Array(n),x=new Float64Array(n);for(let i=0;i<n;i++){let v=rhs[i]/d[i];for(let j=0;j<i;j++)v-=L[i][j]*y[j];y[i]=v/L[i][i];}for(let i=n-1;i>=0;i--){let v=y[i];for(let j=i+1;j<n;j++)v-=L[j][i]*x[j];x[i]=v/L[i][i];}return x.map((v,i)=>v/d[i]);};
   const x=back(b);
   // Reuse the same factorization for two compensated-residual corrections.
   // Closely spaced mandatory stations can otherwise lose support equilibrium
   // digits even after diagonal scaling. No stiffness or loads are altered.
   if(n>12)for(let pass=0;pass<2;pass++){const residual=A.map((r,i)=>{let s=0,c=0;for(let j=0;j<n;j++){const v=r[j]*x[j],t=s+v;c+=Math.abs(s)>=Math.abs(v)?s-t+v:v-t+s;s=t;}return b[i]-(s+c);}),dx=back(residual);dx.forEach((v,i)=>x[i]+=v);}
   return x;
 }
 function matvec(A,x){return Float64Array.from(A,r=>dot(r,x));}
 function toLocal(R,v){return R.map(r=>dot(r,v));}
 function toGlobal(R,v){return [0,1,2].map(j=>R.reduce((s,r,i)=>s+r[j]*v[i],0));}
 function pointLoadVector(R,L,t,globalForce=[0,0,0],globalMoment=[0,0,0]){
   const force=toLocal(R,globalForce),moment=toLocal(R,globalMoment),{H,dH,N}=shapes(t,L),v=new Float64Array(13);
   [0,6].forEach((j,i)=>{v[j]+=N[i]*force[0];v[j+3]+=N[i]*moment[0];});v[12]=4*t*(1-t)*force[0];
   [1,5,7,11].forEach((j,i)=>v[j]+=H[i]*force[1]+dH[i]*moment[2]);
   [2,4,8,10].forEach((j,i)=>v[j]+=(i%2?-1:1)*(H[i]*force[2]-dH[i]*moment[1]));return v;
 }
 function element(nodes,s){
   if(!Number.isInteger(s.a)||!Number.isInteger(s.b)||s.a<0||s.b<0||s.a>=nodes.length||s.b>=nodes.length||s.a===s.b)throw Error('Frame element needs two different existing nodes.');
   const a=nodes[s.a],b=nodes[s.b],L=norm(sub(b,a)),R=basis(a,b,s.orientation);
   if(!(L>1e-8))throw Error('Frame element has zero length.');
   // A centroid offset couples axial strain to the linearly varying Hermite
   // bending curvatures. Linear axial displacement alone cannot represent
   // the corresponding zero-N field and introduces artificial axial locking.
   // Add one quadratic axial bubble, then statically condense it: global
   // nodes retain exactly six DOFs and no reduced-integration mechanism.
   const D=constitutive(s),fullK=zero(13),fullF=new Float64Array(13);
   for(const [t,w]of GAUSS){
     const B=strainMatrix(t,L,true),DB=D.map(r=>Float64Array.from({length:13},(_,j)=>r.reduce((v,c,h)=>v+c*B[h][j],0)));
     for(let i=0;i<13;i++)for(let j=0;j<13;j++)for(let h=0;h<4;h++)fullK[i][j]+=B[h][i]*DB[h][j]*w*L;
   }
   if(s.distributed)fullF.set(integrate(t=>{
     const q=s.distributed(t,add(a,scale(sub(b,a),t)))||{},force=toLocal(R,q.force||[0,0,0]),moment=toLocal(R,q.moment||[0,0,0]),{H,dH,N}=shapes(t,L),v=new Float64Array(13);
     [0,6].forEach((j,i)=>{v[j]+=L*N[i]*force[0];v[j+3]+=L*N[i]*moment[0];});
     v[12]=L*4*t*(1-t)*force[0];
     [1,5,7,11].forEach((j,i)=>v[j]+=L*(H[i]*force[1]+dH[i]*moment[2]));
     [2,4,8,10].forEach((j,i)=>v[j]+=L*(i%2?-1:1)*(H[i]*force[2]-dH[i]*moment[1]));return v;
   },0,1));
   if(s.consistentLoad){if(s.consistentLoad.length!==13||Array.from(s.consistentLoad).some(v=>!Number.isFinite(v)))throw Error('An element consistent load needs 13 finite entries including its axial bubble.');s.consistentLoad.forEach((v,i)=>fullF[i]+=v);}
   const axialMode={stiffness:fullK[12][12],coupling:Float64Array.from(fullK[12].slice(0,12)),load:fullF[12]};
   const k=zero(12),f=new Float64Array(12);
   for(let i=0;i<12;i++){f[i]=fullF[i]-fullK[i][12]*axialMode.load/axialMode.stiffness;for(let j=0;j<12;j++)k[i][j]=fullK[i][j]-fullK[i][12]*fullK[12][j]/axialMode.stiffness;}
   const T=zero(12);for(let block=0;block<4;block++)for(let i=0;i<3;i++)for(let j=0;j<3;j++)T[3*block+i][3*block+j]=R[i][j];
   const kg=zero(12),fg=new Float64Array(12);
   for(let i=0;i<12;i++){for(let h=0;h<12;h++)fg[i]+=T[h][i]*f[h];for(let j=0;j<12;j++)for(let h=0;h<12;h++)if(T[h][i])for(let l=0;l<12;l++)if(T[l][j])kg[i][j]+=T[h][i]*k[h][l]*T[l][j];}
   return {...s,L,R,D,k,f,T,kg,fg,axialMode,dofs:[...Array.from({length:6},(_,i)=>6*s.a+i),...Array.from({length:6},(_,i)=>6*s.b+i)]};
 }
 function solve({nodes,elements,loads=[],fixed=[0,1,2,3,4,5]}){
   if(!Array.isArray(nodes)||nodes.length<2||nodes.length>161||nodes.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('Use 2–161 finite spatial frame nodes.');
   const n=6*nodes.length,K=zero(n),f=new Float64Array(n),es=elements.map(s=>element(nodes,s));
   for(const e of es)for(let i=0;i<12;i++){f[e.dofs[i]]+=e.fg[i];for(let j=0;j<12;j++)K[e.dofs[i]][e.dofs[j]]+=e.kg[i][j];}
   for(const l of loads){if(!Number.isInteger(l.node)||l.node<0||l.node>=nodes.length)throw Error('A frame load references a missing node.');const values=[...(l.force||[0,0,0]),...(l.moment||[0,0,0])];if(values.length!==6||values.some(v=>!Number.isFinite(v)))throw Error('Frame forces and moments need three finite components.');values.forEach((v,i)=>f[6*l.node+i]+=v);}
   if(!Array.isArray(fixed)||fixed.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid frame restraint DOF.');
   const fixedSet=new Set(fixed),free=Array.from({length:n},(_,i)=>i).filter(i=>!fixedSet.has(i)),u=new Float64Array(n),uf=solveSPD(free.map(i=>Float64Array.from(free,j=>K[i][j])),free.map(i=>f[i]));free.forEach((d,i)=>u[d]=uf[i]);
   const residual=matvec(K,u).map((v,i)=>v-f[i]),reactions=fixed.map(d=>({dof:d,value:residual[d]}));
   const member=es.map(e=>{const ul=matvec(e.T,e.dofs.map(d=>u[d])),end=matvec(e.k,ul).map((v,i)=>v-e.f[i]),bubble=(e.axialMode.load-dot(e.axialMode.coupling,ul))/e.axialMode.stiffness;return {...e,ul,bubble,end,globalEnd:matvec(e.T.map((r,i)=>Float64Array.from(r,(_,j)=>e.T[j][i])),end)};});
   const totalForce=[0,0,0],totalMoment=[0,0,0],supportForce=[0,0,0],supportMoment=[0,0,0];
   for(let i=0;i<nodes.length;i++){const F=Array.from(f.slice(6*i,6*i+3)),M=add(Array.from(f.slice(6*i+3,6*i+6)),cross(nodes[i],F));for(let j=0;j<3;j++){totalForce[j]+=F[j];totalMoment[j]+=M[j];}const RF=Array.from({length:3},(_,j)=>fixedSet.has(6*i+j)?residual[6*i+j]:0),RM=add(Array.from({length:3},(_,j)=>fixedSet.has(6*i+j+3)?residual[6*i+j+3]:0),cross(nodes[i],RF));for(let j=0;j<3;j++){supportForce[j]+=RF[j];supportMoment[j]+=RM[j];}}
   const internalWork=es.reduce((s,e)=>s+e.axialMode.load**2/e.axialMode.stiffness,0),energy=.5*(dot(u,matvec(K,u))+internalWork),work=dot(u,f)+internalWork,forceError=norm(add(totalForce,supportForce)),momentError=norm(add(totalMoment,supportMoment)),freeResidual=Math.max(0,...free.map(i=>Math.abs(residual[i])));
   return {nodes,elements:member,displacements:nodes.map((_,i)=>Array.from(u.slice(6*i,6*i+3))),rotations:nodes.map((_,i)=>Array.from(u.slice(6*i+3,6*i+6))),u,applied:f,reactions,energy,work,verification:{forceError,momentError,freeResidual,energyError:Math.abs(2*energy-work)/Math.max(Math.abs(work),1e-30),totalForce,totalMoment,supportForce,supportMoment},method:'6-DOF spatial Euler–Bernoulli frame; condensed quadratic axial mode + coupled biaxial bending + Saint-Venant torsion'};
 }
 function sampleElement(e,t){
   const {H,dH,N}=shapes(t,e.L),u=e.ul,local=[N[0]*u[0]+N[1]*u[6]+4*t*(1-t)*(e.bubble||0),[1,5,7,11].reduce((s,j,i)=>s+H[i]*u[j],0),[2,4,8,10].reduce((s,j,i)=>s+H[i]*(i%2?-1:1)*u[j],0)],rotation=[N[0]*u[3]+N[1]*u[9],-[2,4,8,10].reduce((s,j,i)=>s+dH[i]*(i%2?-1:1)*u[j],0),[1,5,7,11].reduce((s,j,i)=>s+dH[i]*u[j],0)];
   const strain=matvec(strainMatrix(t,e.L,true),[...u,e.bubble||0]),resultant=matvec(e.D,strain);
   return {displacement:toGlobal(e.R,local),rotation:toGlobal(e.R,rotation),strain:Array.from(strain),resultant:Array.from(resultant)};
 }
 return {solve,element,basis,constitutive,strainMatrix,sampleElement,pointLoadVector,toLocal,toGlobal,dot,add,sub,scale,cross,norm,unit,solveSPD,integrate,GAUSS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingFrame3D;
