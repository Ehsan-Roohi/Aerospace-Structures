/* Planar, pin-jointed, small-displacement linear elastic truss. mm, N, MPa. */
(function(root){
 'use strict';
 const finite=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(label+' must be a finite number.');return v;};
 function normalize(raw){
  if(!raw||!Array.isArray(raw.nodes)||!Array.isArray(raw.members))throw Error('A model needs nodes and members arrays.');
  if(raw.nodes.length>60||raw.members.length>160)throw Error('Limit: 60 nodes and 160 members.');
  const ids=new Set();
  const nodes=raw.nodes.map(n=>{
   if(!Number.isInteger(n.id)||n.id<1||ids.has(n.id))throw Error('Node IDs must be unique positive integers.');ids.add(n.id);
   if(!['free','pin','rollerY','rollerX'].includes(n.support))throw Error('Unknown support.');
   return {id:n.id,x:finite(n.x,'x'),y:finite(n.y,'y'),fx:finite(n.fx,'Fx'),fy:finite(n.fy,'Fy'),support:n.support};
  });
  const pairs=new Set();
  const members=raw.members.map(m=>{
   if(!ids.has(m.a)||!ids.has(m.b)||m.a===m.b)throw Error('Every member needs two different existing nodes.');
   const pair=[m.a,m.b].sort((a,b)=>a-b).join(':');if(pairs.has(pair))throw Error('Duplicate member.');pairs.add(pair);
   const E=finite(m.E,'E'),A=finite(m.A,'A');if(E<=0||A<=0)throw Error('E and A must be positive.');
   const type=m.type??'bar';if(!['bar','cable'].includes(type))throw Error('Member type must be bar or cable.');
   const Imin=m.Imin==null?null:finite(m.Imin,'Imin'),Kfactor=m.Kfactor??1;
   finite(Kfactor,'Effective length factor');if(Kfactor<=0||(Imin!==null&&Imin<=0))throw Error('Imin and effective length factor must be positive.');
   return {a:m.a,b:m.b,E,A,type,Imin,Kfactor};
  });
  return {nodes,members};
 }
 function linear(K,F){
  const n=F.length;if(!n)return [];
  // Symmetric diagonal scaling avoids treating a stiff but valid model as singular just because of units.
  const d=K.map((r,i)=>Math.sqrt(r[i]));if(d.some(v=>!Number.isFinite(v)||v<=0))throw Error('Mechanism or disconnected unrestrained node.');
  const a=K.map((r,i)=>[...r.map((v,j)=>v/(d[i]*d[j])),F[i]/d[i]]);
  for(let k=0;k<n;k++){
   let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
   if(Math.abs(a[p][k])<1e-11)throw Error('Unstable or nearly singular truss: add suitable restraints or triangulation.');
   [a[k],a[p]]=[a[p],a[k]];
   for(let i=k+1;i<n;i++){const c=a[i][k]/a[k][k];for(let j=k;j<=n;j++)a[i][j]-=c*a[k][j];}
  }
  const z=Array(n).fill(0);for(let i=n-1;i>=0;i--){let b=a[i][n];for(let j=i+1;j<n;j++)b-=a[i][j]*z[j];z[i]=b/a[i][i];}
  return z.map((v,i)=>v/d[i]);
 }
 function solve(raw){
  const model=normalize(raw),{nodes,members}=model,n=nodes.length,N=2*n;
  if(n<2||!members.length)throw Error('Add nodes, members, supports and nodal loads, then Solve.');
  const ix=new Map(nodes.map((v,i)=>[v.id,i])),F=nodes.flatMap(v=>[v.fx,v.fy]);
  const geom=members.map(m=>{
   const i=ix.get(m.a),j=ix.get(m.b),dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,L=Math.hypot(dx,dy);
   if(L<1e-8)throw Error('Coincident member ends.');
   const c=dx/L,s=dy/L,t=[-c,-s,c,s],dof=[2*i,2*i+1,2*j,2*j+1],k=m.E*m.A/L;
   return {L,t,dof,k};
  });
  const fixed=new Set();nodes.forEach((v,i)=>{if(v.support==='pin'||v.support==='rollerX')fixed.add(2*i);if(v.support==='pin'||v.support==='rollerY')fixed.add(2*i+1);});
  const free=Array.from({length:N},(_,i)=>i).filter(i=>!fixed.has(i)),cables=members.map((m,i)=>m.type==='cable'?i:-1).filter(i=>i>=0);
  const forceTol=1e-9*Math.max(1,...F.map(Math.abs));
  function candidate(active){
   const K=Array.from({length:N},()=>Array(N).fill(0));
   geom.forEach((g,i)=>{if(members[i].type==='cable'&&!active.has(i))return;for(let a=0;a<4;a++)for(let b=0;b<4;b++)K[g.dof[a]][g.dof[b]]+=g.k*g.t[a]*g.t[b];});
   const u=Array(N).fill(0),uf=linear(free.map(i=>free.map(j=>K[i][j])),free.map(i=>F[i]));free.forEach((d,i)=>u[d]=uf[i]);
   const trial=geom.map(g=>g.k*g.t.reduce((a,v,j)=>a+v*u[g.dof[j]],0));
   const valid=cables.every(i=>active.has(i)?trial[i]>=-forceTol:trial[i]<=forceTol);
   return {u,trial,active,valid};
  }
  let solved=null,active=new Set(cables),seen=new Set(),iterations=0;
  for(let step=0;step<80;step++){
   const key=cables.map(i=>+active.has(i)).join('');if(seen.has(key))break;seen.add(key);
   let c;try{c=candidate(active);iterations++;}catch(e){if(step===0)throw e;break;}
   if(c.valid){solved=c;break;}
   active=new Set(cables.filter(i=>c.trial[i]>forceTol||(active.has(i)&&c.trial[i]>=-forceTol)));
  }
  // A simultaneous release can make an intermediate tangent singular even when a different cable set works.
  // For small cable systems search all sets, accepting only equilibrium + unilateral compatibility.
  if(!solved&&cables.length<=10){for(let mask=(1<<cables.length)-1;mask>=0;mask--){
   const a=new Set(cables.filter((_,j)=>mask&(1<<j))),key=cables.map(i=>+a.has(i)).join('');if(seen.has(key))continue;
   try{const c=candidate(a);iterations++;if(c.valid){solved=c;break;}}catch(e){}
  }}
  if(!solved)throw Error('No converged stable tension-only solution. Slack wires may create a mechanism; check bracing/supports. No artificial cable compression or stabilizing stiffness was added.');
  const {u,trial}=solved;
  const forces=trial.map((v,i)=>members[i].type==='cable'?(solved.active.has(i)?Math.max(0,v):0):v),internal=Array(N).fill(0);
  geom.forEach((g,i)=>g.dof.forEach((d,j)=>internal[d]+=g.t[j]*forces[i]));const R=internal.map((v,i)=>v-F[i]);
  const residual=Math.max(0,...free.map(i=>Math.abs(R[i])));if(residual>1e-7*Math.max(1,...F.map(Math.abs)))throw Error('Cable equilibrium tolerance was not met. No results accepted.');
  const resultNodes=nodes.map((v,i)=>({...v,ux:u[2*i],uy:u[2*i+1],rx:fixed.has(2*i)?R[2*i]:0,ry:fixed.has(2*i+1)?R[2*i+1]:0}));
  const resultMembers=members.map((m,i)=>{const g=geom[i],extension=g.t.reduce((a,v,j)=>a+v*u[g.dof[j]],0),force=forces[i],stress=force/m.A,strain=stress/m.E;
   const cableState=m.type!=='cable'?null:force>forceTol?'taut':trial[i]<-forceTol?'slack':'zero-force boundary';
   const Pcr=m.type==='bar'&&m.Imin!==null?Math.PI**2*m.E*m.Imin/(m.Kfactor*g.L)**2:null;
   const utilization=Pcr!==null&&force<0?-force/Pcr:null,slenderness=Pcr!==null?m.Kfactor*g.L/Math.sqrt(m.Imin/m.A):null;
   return {...m,L:g.L,extension,elasticExtension:strain*g.L,strain,stress,force,cableState,Pcr,utilization,slenderness};});
  const equilibrium=resultNodes.reduce((e,v)=>({fx:e.fx+v.fx+v.rx,fy:e.fy+v.fy+v.ry,m:e.m+v.x*(v.fy+v.ry)-v.y*(v.fx+v.rx)}),{fx:0,fy:0,m:0});
  const maxDisplacement=Math.max(...resultNodes.map(v=>Math.hypot(v.ux,v.uy)));
  if([...u,...R,...resultMembers.flatMap(v=>[v.force,v.stress])].some(v=>!Number.isFinite(v)))throw Error('Non-finite result: check geometry and stiffness.');
  return {model,nodes:resultNodes,members:resultMembers,equilibrium,maxDisplacement,iterations,slackCables:resultMembers.filter(m=>m.cableState==='slack').length};
 }
 root.TrussEngine={normalize,solve};
})(typeof globalThis!=='undefined'?globalThis:this);
