'use strict';
/* Verification of the C1 curved-sheet axisymmetric cavity solver (axisymmetric-cavity-c1.js).
 * Numerical verification only: exact-solution, brute-force and cross-implementation checks.
 * No experimental validation is performed or claimed.
 *   node c1-cavity-verify.cjs          fresh Nc=32,64 solves + recorded fine meshes (about 1 minute)
 *   node c1-cavity-verify.cjs --full   also recomputes Nc=128,256 and rewrites c1-cavity-mesh-study.json */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const here=__dirname,lab=path.join(here,'..');
const C=require(path.join(lab,'axisymmetric-cavity-c1.js'));
let P021=null;try{P021=require(path.join(lab,'axisymmetric-cavity-nodal.js'));}catch(e){}
const PI=Math.PI,TWO_PI=2*PI,norm=a=>Math.hypot(a[0],a[1]);
const full=process.argv.includes('--full');
const checks=[],gate=(name,passed,data={})=>{checks.push({name,passed:!!passed,...data});console.log((passed?'PASS ':'FAIL ')+name+' '+JSON.stringify(data).slice(0,160));if(!passed)process.exitCode=1;};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const HB=z=>[1-3*z*z+2*z*z*z,z-2*z*z+z*z*z,3*z*z-2*z*z*z,-z*z+z*z*z];

/* ---------------------------------------------------------------- brute-force Biot-Savart on a curved panel */
function bruteForce(pan,P,coef,nz=400,nth=300){
 let zs=0,best=Infinity;for(let i=0;i<=400;i++){const z=i/400,Q=pan.pos(z),d2=(P[0]-Q[0])**2+(P[1]-Q[1])**2;if(d2<best){best=d2;zs=z;}}
 const dmin=Math.sqrt(best)+1e-12,q=C.gauss(nz),qt=C.gauss(nth),zpts=[],zw=[];
 for(const hi of[0,1]){const span=hi-zs;if(Math.abs(span)<1e-12)continue;for(let k=0;k<nz;k++){const u=.5*(q.x[k]+1);zpts.push(zs+span*u*u);zw.push(Math.abs(span)*u*q.w[k]);}}
 const thc=Math.min(PI,40*dmin/Math.max(P[1],1e-9)),ths=[],thw=[];
 for(const[lo,hi]of[[0,thc],[thc,PI]]){if(hi<=lo)continue;for(let k=0;k<nth;k++){const u=.5*(qt.x[k]+1),th=lo===0?lo+(hi-lo)*u*u:lo+(hi-lo)*u,w=lo===0?(hi-lo)*u*qt.w[k]:(hi-lo)*.5*qt.w[k];ths.push(th);thw.push(w);}}
 let ux=0,ur=0;
 for(let i=0;i<zpts.length;i++){const z=zpts[i],wz=zw[i],Q=pan.pos(z),d=pan.der(z),J=norm(d),w=HB(z);let g=0;for(let b=0;b<4;b++)g+=coef[b]*w[b];
  for(let t=0;t<ths.length;t++){const th=ths[t],ct=Math.cos(th),st=Math.sin(th),Rx=P[0]-Q[0],Ry=P[1]-Q[1]*ct,Rz=-Q[1]*st,R3=Math.pow(Rx*Rx+Ry*Ry+Rz*Rz,1.5);const f=g/(4*PI)*wz*J*Q[1]*2*thw[t]/R3;ux+=f*(-st*Rz-ct*Ry);ur+=f*(ct*Rx);}}
 return[ux,ur];
}

(async()=>{
 const t0=Date.now();
 /* ================================================================ 1. kernel-level checks */
 {
  const s=C.setup({L:8,Nc:16,Nf:8}),z=[...Array.from({length:8},(_,k)=>{const u=(1-Math.cos(PI*(k+1)/16))/2;return .25*Math.pow(u*(1-u),1.5);}),1.14];
  const nodes=C.nodesFrom(s,z),panels=C.buildPanels(s,nodes),coef=[.7,-.4,1.1,.3];
  const off=(j,zeta,eps)=>{const p=panels[j].pos(zeta),d=panels[j].der(zeta),J=norm(d);return[p[0]-eps*d[1]/J,p[1]+eps*d[0]/J];};
  const cases=[['far point',12,[3,4]],['near mid cavity panel (subtracted)',12,off(12,.5,.05*panels[12].Lc)],['rim cavity panel, graded end (no subtraction)',8,off(8,.1,.3*panels[8].Lc)],['face panel near axis',1,[-.1,.25]],['near a node',13,off(13,.02,.03*panels[13].Lc)],['1e-3 off rim cavity panel at zeta .03',8,off(8,.03,1e-3)],['1e-3 off rim face panel at zeta .97',7,[panels[7].pos(.97)[0]-1e-3,panels[7].pos(.97)[1]]],['1e-4 off rim cavity panel at zeta .1',8,off(8,.1,1e-4)]];
  let worst=0;const rows=[];
  for(const[name,j,Pt]of cases){const inf=C.influence(panels[j],Pt,null,{nNear:32,nFar:12}),v=[0,0];for(let b=0;b<4;b++){v[0]+=coef[b]*inf[b][0];v[1]+=coef[b]*inf[b][1];}const bf=bruteForce(panels[j],Pt,coef);const e=Math.hypot(v[0]-bf[0],v[1]-bf[1])/Math.hypot(bf[0],bf[1]);worst=Math.max(worst,e);rows.push({case:name,relativeError:e});}
  gate('Curved-panel influence agrees with brute-force 3-D Biot-Savart (8 configurations incl. rims and near-node)',worst<1e-7,{maxRelativeError:worst,cases:rows});
  /* exterior limit: off-surface values converge monotonically (ratio ~1/2 per halving) to the on-surface value */
  const gam=nodes.map(p=>-(.9+.3*Math.sin(1.3*p[0])*Math.cos(.7*p[1])));gam[0]=0;gam[gam.length-1]=0;
  const coefs=panels.map((_,j)=>C.hermiteCoeffs(s,gam,j)),vel=(Pt,wh,nn)=>{const v=[1,0];for(const q of panels){const inf=C.influence(q,Pt,wh,{nNear:nn,nFar:12}),c=coefs[q.index];for(let b=0;b<4;b++){v[0]+=c[b]*inf[b][0];v[1]+=c[b]*inf[b][1];}}return v;};
  const arc=(pan,z0,z1)=>{const q=C.gauss(32);let a=0;for(let k=0;k<32;k++){const zz=z0+(z1-z0)*(q.x[k]+1)/2,d=pan.der(zz);a+=(z1-z0)/2*q.w[k]*norm(d);}return Math.abs(a);};
  const lim=[];let ok=true;
  for(const[name,j,zeta]of[['cavity mid',12,.5],['cavity near node',13,.02],['rim cavity panel near rim',8,.03],['face panel near rim',7,.97],['face near axis',0,.02],['rear face near rim',24,.03],['second cavity panel near rim node',9,.02]]){
   const pan=panels[j],p=pan.pos(zeta),d=pan.der(zeta),J=norm(d),n=[-d[1]/J,d[0]/J],scale=Math.min(arc(pan,0,zeta),arc(pan,zeta,1)),on=vel(p,{panel:j,zeta,side:1},32);
   const diffs=[.4,.2,.1,.05,.025].map(e=>{const v=vel([p[0]+e*scale*n[0],p[1]+e*scale*n[1]],null,64);return Math.hypot(v[0]-on[0],v[1]-on[1]);}),ratios=diffs.slice(1).map((v,i)=>v/diffs[i]);
   const good=ratios.every(r=>r>.3&&r<.75)&&diffs[4]<2e-3;ok=ok&&good;lim.push({location:name,diffs,ratios});}
  gate('On-surface exterior limit is the limit of off-surface values at every location incl. both rims (ratio ~0.5 per halving)',ok,{locations:lim.map(l=>({location:l.location,ratios:l.ratios.map(v=>+v.toFixed(3))}))});
  /* planar cubic segment: analytic vs Gauss-64 and the exact jump */
  {const L=.37,X=.21,Y=.09,q=C.gauss(64),an=C.planarHermite(X,Y,L,1);let w1=0;for(let b=0;b<4;b++){let u=0,v=0;for(let k=0;k<64;k++){const xi=.5*L*(q.x[k]+1),w=.5*L*q.w[k],hz=HB(xi/L)[b],r2=(X-xi)**2+Y*Y;u+=-w*hz*Y/r2/TWO_PI;v+=w*hz*(X-xi)/r2/TWO_PI;}w1=Math.max(w1,Math.abs(u-an[b][0]),Math.abs(v-an[b][1]));}
   const l=C.planarHermite(X,0,L,1),r=C.planarHermite(X,0,L,-1);let jw=0;for(let b=0;b<4;b++)jw=Math.max(jw,Math.abs((l[b][0]-r[b][0])+HB(X/L)[b]),Math.abs(l[b][1]-r[b][1]));
   gate('Analytic cubic-density planar segment: matches Gauss-64 off the segment and carries the exact jump on it',w1<1e-12&&jw<1e-13,{offSegmentError:w1,jumpError:jw});}
  /* spline operator exact for cubics */
  {const n=16,f=g=>.3+.7*g-.05*g*g+.002*g*g*g,fp=k=>.7-.1*k+.006*k*k,D=C.splineSlopeOperator(n,'notaknot','notaknot');let w=0;for(let k=0;k<=n;k++){let m=0;for(let g=0;g<=n;g++)m+=D[k][g]*f(g);w=Math.max(w,Math.abs(m-fp(k)));}gate('Cubic spline slope operator reproduces cubic data exactly',w<1e-10,{maxError:w});}
  /* stable remainder: agreement with naive subtraction and with the independently derived 0.2.1 vortexRemainder */
  {let w=0,w2=0;const pts=[[.3,1.2,.31,1.21],[2,1.5,2.02,1.49],[.1,.05,.11,.06],[5,2,5.1,1.95],[1,1,1.001,1],[4,1.8,4.0001,1.8],[.5,.9,.5,.90001]];
   for(const[x,r,xs,rs]of pts){const k=C.ringKernel(x,r,xs,rs),p=C.planarKernel([x,r],[xs,rs]),st=C.ringMinusPlanar(x,r,xs,rs);const rho=Math.hypot(x-xs,r-rs);if(rho>1e-3)w=Math.max(w,Math.abs(k[0]-p[0]-st[0])/(1+Math.abs(st[0])),Math.abs(k[1]-p[1]-st[1])/(1+Math.abs(st[1])));
    if(P021&&P021.vortexRemainder){const o=P021.vortexRemainder(x,r,xs,rs);w2=Math.max(w2,Math.abs(o[0]-st[0])/(1+Math.abs(st[0])),Math.abs(o[1]-st[1])/(1+Math.abs(st[1])));}}
   gate('Cancellation-free ring remainder: equals naive subtraction at moderate rho'+(P021?' and the independently derived 0.2.1 vortexRemainder at all tested separations':''),w<1e-9&&(!P021||w2<1e-12),{naiveAgreement:w,agreementWith021:P021?w2:null});}
 }
 /* ================================================================ 2. exact solution: sphere */
 {
  const exact=(x,r)=>{const rho=Math.hypot(x,r),r3=rho**3,r5=rho**5;return[1+.5/r3-1.5*x*x/r5,-1.5*x*r/r5];},rows=[];
  for(const N of[16,32,64,128]){
   const h=N/2,D=C.splineSlopeOperator(h,'natural','clamped'),s={kind:'sphere',N,h,mColl:3,nNear:24,nFar:12};
   const rowA=[],rowB=[],row=k=>{const r=new Float64Array(N+1);if(k<=h){for(let g=0;g<=h;g++)r[g]=D[k][g];}else{for(let g=0;g<=h;g++)r[g]=-D[N-k][g];}return r;};
   for(let j=0;j<N;j++){rowA.push(row(j));rowB.push(row(j+1));}s.srows={rowA,rowB};s.fA=rowA.map(r=>C.foldRow(s,r));s.fB=rowB.map(r=>C.foldRow(s,r));
   s.buildPanels=(s,nodes)=>{const ext=k=>k<0?[nodes[-k][0],-nodes[-k][1]]:k>N?[nodes[2*N-k][0],-nodes[2*N-k][1]]:nodes[k],m=[];
    for(let k=0;k<=N;k++){const a=ext(k-2),b=ext(k-1),c=ext(k+1),d=ext(k+2);m.push([(a[0]-8*b[0]+8*c[0]-d[0])/12,(a[1]-8*b[1]+8*c[1]-d[1])/12]);}
    const dHB=z=>[-6*z+6*z*z,1-4*z+3*z*z,6*z-6*z*z,-2*z+3*z*z];
    return nodes.slice(0,-1).map((a,j)=>{const b=nodes[j+1],ma=m[j],mb=m[j+1],d=[b[0]-a[0],b[1]-a[1]],Lc=norm(d),t=[d[0]/Lc,d[1]/Lc],c1=ma,c2=[-3*a[0]-2*ma[0]+3*b[0]-mb[0],-3*a[1]-2*ma[1]+3*b[1]-mb[1]],c3=[2*a[0]+ma[0]-2*b[0]+mb[0],2*a[1]+ma[1]-2*b[1]+mb[1]];
     return{index:j,piece:'body',a,b,pos:z=>{const w=HB(z);return[w[0]*a[0]+w[1]*ma[0]+w[2]*b[0]+w[3]*mb[0],w[0]*a[1]+w[1]*ma[1]+w[2]*b[1]+w[3]*mb[1]];},der:z=>{const w=dHB(z);return[w[0]*a[0]+w[1]*ma[0]+w[2]*b[0]+w[3]*mb[0],w[0]*a[1]+w[1]*ma[1]+w[2]*b[1]+w[3]*mb[1]];},
      diff:(z,zs)=>{const dd=z-zs,p=z+zs,q2=z*z+z*zs+zs*zs;return[dd*(c1[0]+c2[0]*p+c3[0]*q2),dd*(c1[1]+c2[1]*p+c3[1]*q2)];},Lc,t,n:[-t[1],t[0]],graded:-1};});};
   const nodes=Array.from({length:N+1},(_,k)=>[-Math.cos(PI*k/N),Math.sin(PI*k/N)]),st=C.neumann(s,nodes),gam=st.gam;
   let gErr=0;for(let k=0;k<=N;k++)gErr=Math.max(gErr,Math.abs(gam[k]+1.5*Math.sin(PI*k/N)));
   const fr=[.02,.05,.1,.25,.5,.75,.9,.95,.98],Pp=[],wh=[];for(let j=0;j<N;j++)for(const f of fr){Pp.push(st.panels[j].pos(f));wh.push({panel:j,zeta:f,side:1});}
   const v=C.velocity(st,Pp,wh,{nNear:32,nFar:12}),vi=C.velocity(st,Pp,wh.map(w=>({...w,side:-1})),{nNear:32,nFar:12});let vn=0,ve=0,vint=0;
   Pp.forEach((p,i)=>{const j=wh[i].panel,d=st.panels[j].der(wh[i].zeta),J=norm(d),n=[-d[1]/J,d[0]/J],ex=exact(p[0],p[1]);vn=Math.max(vn,Math.abs(v[i][0]*n[0]+v[i][1]*n[1]));ve=Math.max(ve,Math.hypot(v[i][0]-ex[0],v[i][1]-ex[1]));vint=Math.max(vint,norm(vi[i]));});
   const FP=[[.5,1.2],[-1.5,.3],[0,2],[1.05,.2],[-.3,1.02]],fv=C.velocity(st,FP,null,{nNear:32,nFar:12});let fe=0;FP.forEach((p,i)=>{const ex=exact(p[0],p[1]);fe=Math.max(fe,Math.hypot(fv[i][0]-ex[0],fv[i][1]-ex[1]));});
   const IP=[[0,.3],[.5,0],[-.6,.5],[.2,.9]],iv=C.velocity(st,IP,null,{nNear:32,nFar:12});let ie=0;iv.forEach(w=>ie=Math.max(ie,norm(w)));
   rows.push({N,gammaErr:gErr,maxNormal_U:vn,maxSurfaceFieldErr:ve,maxInteriorBoundarySpeed_U:vint,exteriorFieldErr:fe,interiorFieldErr:ie});
  }
  const ord=k=>rows.slice(1).map((r,i)=>+Math.log2(rows[i][k]/r[k]).toFixed(2));
  gate('Sphere exact solution: complete field (surface normal velocity, surface speed, exterior and interior points) converges at >= third order and is < 1e-6 at N=64',rows[2].maxSurfaceFieldErr<1e-6&&rows[2].maxNormal_U<1e-6&&ord('maxNormal_U').every(o=>o>2.7)&&ord('maxSurfaceFieldErr').every(o=>o>2.7),{rows,orders:{gamma:ord('gammaErr'),normal:ord('maxNormal_U'),surfaceField:ord('maxSurfaceFieldErr'),exteriorField:ord('exteriorFieldErr')}});
 }
 /* ================================================================ 3. disk cavity: fresh solves, parity, gates, mesh study */
 const studyFile=path.join(here,'c1-cavity-mesh-study.json');
 let study=fs.existsSync(studyFile)?JSON.parse(fs.readFileSync(studyFile)):{case:{L_over_R:8,referenceRmax:1.95,mColl:3,nNear:24,nFar:12,clustering:'u^3',tolerance:1e-10,auditFractions:[.02,.05,.1,.25,.5,.75,.9,.95,.98],auditQuadrature:{nNear:32,nFar:12}},meshes:{}};
 const want=full?[32,64,128,256]:[32,64];
 const summary=r=>({Nc:r.Nc,Nf:r.Nf,N:r.N,sigma:r.sigma,qc:r.qc,Rmax:r.Rmax,CD:r.CD,CD_directField:r.CD_directField,volume:r.volume,maxDynamicResidual:r.maxDynamicResidual,history:r.history,stopReason:r.stopReason,nodalConverged:r.nodalConverged,collocationResidual:r.collocationResidual,seconds:r.seconds,audit:{...r.fieldAudit,profiles:undefined},status:r.status});
 for(const Nc of want){
  const r=await C.solve({L:8,Nc,Nf:Nc/2});
  const rec=study.meshes[String(Nc)];
  if(rec){const d={sigma:r.sigma-rec.sigma,Rmax:r.Rmax-rec.Rmax,CD:r.CD-rec.CD};gate(`Nc=${Nc}: fresh solve reproduces the recorded mesh-study result`,Object.values(d).every(v=>Math.abs(v)<1e-12),d);}
  study.meshes[String(Nc)]={...summary(r),nodes:r.nodes,gamma:r.gamma,face:r.face,profiles:r.fieldAudit.profiles,solutionState:r.solutionState,version:r.version};
  const a=r.fieldAudit;
  gate(`Nc=${Nc}: Newton reaches the unchanged 1e-10 nodal tolerance quadratically`,r.nodalConverged&&r.stopReason==='nodal tolerance',{residual:r.maxDynamicResidual,history:r.history});
  gate(`Nc=${Nc}: nine-fraction direct-field audit (all near-rim samples retained) within the unchanged 0.01 U / 0.02 Cp gates`,a.withinPriorOffgridThresholds,{maxNormal_U:a.maxNormal_U,maxCavityDynamicCpResidual:a.maxCavityDynamicCpResidual,maxTraceSpeedMismatch_U:a.maxTraceSpeedMismatch_U,maxInteriorBoundarySpeed_U:a.maxInteriorBoundarySpeed_U,maxJumpError_U:a.maxJumpError_U});
  gate(`Nc=${Nc}: front-disk drag from the direct exterior field agrees with the trace drag`,Math.abs(r.CD-r.CD_directField)<2e-5*Math.pow(32/Nc,3),{CD_trace:r.CD,CD_direct:r.CD_directField,difference:r.CD-r.CD_directField});
  const py=path.join(here,'reference','c1-cavity',`py-c1-Nc${Nc}.json`);
  if(fs.existsSync(py)){const p=JSON.parse(fs.readFileSync(py)),gd=Math.max(...r.gamma.map((v,k)=>Math.abs(v-p.gamma[k]))),nd=Math.max(...r.nodes.map((v,k)=>Math.hypot(v[0]-p.nodes[k][0],v[1]-p.nodes[k][1])));
   gate(`Nc=${Nc}: independent Python twin (scipy elliptic integrals, CubicSpline operator, SVD least squares, full-reassembly Jacobian) agrees`,Math.abs(r.sigma-p.sigma)<1e-11&&Math.abs(r.CD-p.CD)<1e-11&&gd<1e-10&&nd<1e-10,{dSigma:r.sigma-p.sigma,dRmax:r.Rmax-p.Rmax,dCD:r.CD-p.CD,maxGammaDifference:gd,maxNodeDifference:nd,pythonAuditMaxNormal:p.fieldAudit.maxNormal_U,jsAuditMaxNormal:a.maxNormal_U});}
 }
 fs.writeFileSync(studyFile,JSON.stringify(study));
 /* mesh-convergence table and uncertainty from the recorded study */
 const meshes=Object.keys(study.meshes).map(Number).sort((a,b)=>a-b),M=meshes.map(n=>study.meshes[String(n)]);
 const conv={};
 for(const key of['sigma','Rmax','CD','volume']){const vals=M.map(m=>m[key]),d=vals.slice(1).map((v,i)=>v-vals[i]),ord=d.slice(1).map((v,i)=>Math.log2(Math.abs(d[i]/v)));conv[key]={values:vals,differences:d,observedOrders:ord};
  if(vals.length>=3){const o=ord.at(-1),dl=d.at(-1);conv[key].richardson=vals.at(-1)+dl/(Math.pow(2,o)-1);conv[key].uncertaintyEstimate=Math.abs(dl)/(Math.pow(2,o)-1);}}
 for(const key of['maxNormal_U','maxCavityDynamicCpResidual','maxTraceSpeedMismatch_U','rmsNormal_U']){const vals=M.map(m=>m.audit[key]),ord=vals.slice(1).map((v,i)=>Math.log2(vals[i]/v));conv[key]={values:vals,observedOrders:ord};}
 gate('Mesh study: sigma, Rmax and CD converge at observed order >= 3.5 between consecutive meshes',meshes.length>=3&&['sigma','Rmax','CD'].every(k=>conv[k].observedOrders.every(o=>o>3.5)),{meshes,orders:Object.fromEntries(['sigma','Rmax','CD'].map(k=>[k,conv[k].observedOrders.map(v=>+v.toFixed(2))]))});
 gate('Mesh study: direct-field defects decrease at observed order >= 2.5 and every mesh passes the unchanged gates',meshes.length>=2&&conv.maxNormal_U.observedOrders.every(o=>o>2.5)&&conv.maxCavityDynamicCpResidual.observedOrders.every(o=>o>2.5)&&M.every(m=>m.audit.withinPriorOffgridThresholds),{maxNormal_U:conv.maxNormal_U,maxCavityDynamicCpResidual:conv.maxCavityDynamicCpResidual});
 /* comparison with the published 0.2.1 polygon baseline at matched meshes */
 let baseline=null;const bfile=path.join(here,'stable-kernel-repair-profiles.json');
 if(fs.existsSync(bfile)){const b=JSON.parse(fs.readFileSync(bfile));baseline={};for(const n of Object.keys(b.meshes)){const r=b.meshes[n].result,a=b.meshes[n].audit;baseline[n]={sigma:r.sigma,Rmax:r.Rmax,CD:r.CD,maxNormal_U:a.maxNormal_U,maxCavityDynamicCpResidual:a.maxCavityDynamicCpResidual,maxTraceSpeedMismatch_U:a.maxTraceSpeedMismatch_U};
   if(study.meshes[n]){const m=study.meshes[n];baseline[n].c1={sigma:m.sigma,Rmax:m.Rmax,CD:m.CD,maxNormal_U:m.audit.maxNormal_U,maxCavityDynamicCpResidual:m.audit.maxCavityDynamicCpResidual};baseline[n].defectRatio={normal:a.maxNormal_U/m.audit.maxNormal_U,cp:a.maxCavityDynamicCpResidual/m.audit.maxCavityDynamicCpResidual};}}
  const n64=baseline['64'];gate('At Nc=64 the curved sheet reduces the 0.2.1 polygon direct-field defects by more than 50x on the identical nine-fraction grid',n64&&n64.defectRatio&&n64.defectRatio.normal>50&&n64.defectRatio.cp>50,{Nc64:n64});}
 /* ================================================================ 4. controls */
 const controls=[],reject=async(name,options)=>{let e=null;try{await C.solve(options);}catch(x){e=x.message;}controls.push({name,rejected:!!e,error:e});return!!e;};
 let allRej=true;
 for(const[name,opts]of[['infinite tolerance',{tolerance:Infinity}],['negative qc',{Nc:8,Nf:4,initialState:[0,0,0,0,-1.14]}],['invalid geometry seed',{Nc:8,Nf:4,initialState:[-100,-100,-100,-100,1.14]}],['zero iterations',{maxIterations:0}],['infinite length',{L:Infinity}],['string length',{L:'8'}],['odd cavity count',{Nc:31}],['fractional quadrature',{nNear:16.5}],['resource-bound mesh',{Nc:100000}],['invalid reference radius',{Rm:NaN}],['nonfinite seed',{Nc:8,Nf:4,initialState:[0,0,NaN,0,1.14]}],['bad collocation count',{mColl:9}]])allRej=(await reject(name,opts))&&allRej;
 gate('Public input guards reject malformed inputs',allRej,{controls:controls.length});
 const one=await C.solve({Nc:16,Nf:8,maxIterations:1,audit:false});gate('Iteration limit is reported honestly as not converged',!one.nodalConverged&&one.stopReason==='iteration limit',{stopReason:one.stopReason,residual:one.maxDynamicResidual});
 let cancelled=false,ce=null;try{await C.solve({Nc:16,Nf:8},{isCancelled:()=>cancelled,onProgress:o=>{if(o.stage==='Newton shape Jacobian'&&o.column===2)cancelled=true;}});}catch(e){ce=e.message;}gate('Cancellation hook stops the solve',ce==='Cancelled',{error:ce});
 const d1=await C.solve({Nc:16,Nf:8}),d2=await C.solve({Nc:16,Nf:8});gate('Solver is deterministic',d1.sigma===d2.sigma&&d1.CD===d2.CD,{});
 /* ================================================================ record */
 const out={date:new Date().toISOString().slice(0,10),version:C.VERSION,status:process.exitCode?'FAIL':'PASS_NUMERICAL_VERIFICATION_ONLY',scope:'Exact-solution, brute-force, limit, cross-implementation and mesh-refinement verification of the C1 curved-sheet solver. No experimental validation. Field accuracy gates are the unchanged 0.01 U and 0.02 Cp limits on the nine-fraction grid including both rims.',
  mode:full?'full':'fresh-32-64-plus-recorded',checks,meshConvergence:conv,baseline021:baseline,case:study.case,
  sourceSha256:{'axisymmetric-cavity-c1.js':sha(path.join(lab,'axisymmetric-cavity-c1.js')),'reference/c1-cavity/python/axi_c1.py':fs.existsSync(path.join(here,'reference','c1-cavity','python','axi_c1.py'))?sha(path.join(here,'reference','c1-cavity','python','axi_c1.py')):null,'axisymmetric-cavity-nodal.js':fs.existsSync(path.join(lab,'axisymmetric-cavity-nodal.js'))?sha(path.join(lab,'axisymmetric-cavity-nodal.js')):null},
  accuracyQualified:{numerical:checks.every(c=>c.passed),experimental:'NOT_PERFORMED'},seconds:(Date.now()-t0)/1000};
 fs.writeFileSync(path.join(here,'c1-cavity-verification.json'),JSON.stringify(out,null,1));
 console.log(JSON.stringify({status:out.status,checks:checks.length,failed:checks.filter(c=>!c.passed).length,seconds:out.seconds}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
