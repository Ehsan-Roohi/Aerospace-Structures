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
   return {a:m.a,b:m.b,E,A};
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
  const ix=new Map(nodes.map((v,i)=>[v.id,i])),K=Array.from({length:N},()=>Array(N).fill(0)),F=nodes.flatMap(v=>[v.fx,v.fy]);
  const geom=members.map(m=>{
   const i=ix.get(m.a),j=ix.get(m.b),dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,L=Math.hypot(dx,dy);
   if(L<1e-8)throw Error('Coincident member ends.');
   const c=dx/L,s=dy/L,t=[-c,-s,c,s],dof=[2*i,2*i+1,2*j,2*j+1],k=m.E*m.A/L;
   for(let a=0;a<4;a++)for(let b=0;b<4;b++)K[dof[a]][dof[b]]+=k*t[a]*t[b];
   return {L,t,dof};
  });
  const fixed=new Set();nodes.forEach((v,i)=>{if(v.support==='pin'||v.support==='rollerX')fixed.add(2*i);if(v.support==='pin'||v.support==='rollerY')fixed.add(2*i+1);});
  const free=Array.from({length:N},(_,i)=>i).filter(i=>!fixed.has(i)),u=Array(N).fill(0),uf=linear(free.map(i=>free.map(j=>K[i][j])),free.map(i=>F[i]));
  free.forEach((d,i)=>u[d]=uf[i]);const R=K.map((r,i)=>r.reduce((a,v,j)=>a+v*u[j],0)-F[i]);
  const resultNodes=nodes.map((v,i)=>({...v,ux:u[2*i],uy:u[2*i+1],rx:fixed.has(2*i)?R[2*i]:0,ry:fixed.has(2*i+1)?R[2*i+1]:0}));
  const resultMembers=members.map((m,i)=>{const g=geom[i],extension=g.t.reduce((a,v,j)=>a+v*u[g.dof[j]],0),strain=extension/g.L,stress=m.E*strain;return {...m,L:g.L,extension,strain,stress,force:stress*m.A};});
  const equilibrium=resultNodes.reduce((e,v)=>({fx:e.fx+v.fx+v.rx,fy:e.fy+v.fy+v.ry,m:e.m+v.x*(v.fy+v.ry)-v.y*(v.fx+v.rx)}),{fx:0,fy:0,m:0});
  const maxDisplacement=Math.max(...resultNodes.map(v=>Math.hypot(v.ux,v.uy)));
  if([...u,...R,...resultMembers.flatMap(v=>[v.force,v.stress])].some(v=>!Number.isFinite(v)))throw Error('Non-finite result: check geometry and stiffness.');
  return {model,nodes:resultNodes,members:resultMembers,equilibrium,maxDisplacement};
 }
 root.TrussEngine={normalize,solve};
})(typeof globalThis!=='undefined'?globalThis:this);
