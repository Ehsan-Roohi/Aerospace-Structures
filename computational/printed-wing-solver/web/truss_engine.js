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
   if(!['free','pin','rollerY','rollerX','roller'].includes(n.support))throw Error('Unknown support.');
   if(n.supportSide!==undefined&&!['below','above','right','left'].includes(n.supportSide))throw Error('Support symbol side must be above, below, right or left.');
   const name=String(n.name??'').trim();if(name.length>40)throw Error('Node name must be at most 40 characters.');
   return {id:n.id,...(name?{name}:{}),x:finite(n.x,'x'),y:finite(n.y,'y'),fx:finite(n.fx,'Fx'),fy:finite(n.fy,'Fy'),support:n.support,supportSide:n.supportSide??'below',supportAngle:finite(n.supportAngle??(n.support==='rollerX'?90:0),'Support surface angle')};
  });
  const pairs=new Set();
  const members=raw.members.map(m=>{
   if(!ids.has(m.a)||!ids.has(m.b)||m.a===m.b)throw Error('Every member needs two different existing nodes.');
   const pair=[m.a,m.b].sort((a,b)=>a-b).join(':');if(pairs.has(pair))throw Error('Duplicate member.');pairs.add(pair);
   const E=finite(m.E,'E'),A=finite(m.A,'A');if(E<=0||A<=0)throw Error('E and A must be positive.');
   const type=m.type??'bar';if(!['bar','cable'].includes(type))throw Error('Member type must be bar or cable.');
   const Imin=m.Imin==null?null:finite(m.Imin,'Imin'),Kfactor=m.Kfactor??1;
   finite(Kfactor,'Effective length factor');if(Kfactor<=0||(Imin!==null&&Imin<=0))throw Error('Imin and effective length factor must be positive.');
   const material=m.material??'custom';if(!['custom','aluminium','steel'].includes(material))throw Error('Unknown member material preset.');
   return {a:m.a,b:m.b,E,A,type,Imin,Kfactor,material};
  });
  const lineLoads=raw.lineLoads??[];if(!Array.isArray(lineLoads)||lineLoads.length>30)throw Error('At most 30 nodal-transfer line loads.');
  const loads=lineLoads.map(v=>{if(!Array.isArray(v.nodes)||v.nodes.length<2||v.nodes.length>60||new Set(v.nodes).size!==v.nodes.length||v.nodes.some(id=>!ids.has(id)))throw Error('A line load needs an ordered path of at least two distinct existing nodes.');return {nodes:[...v.nodes],qStart:finite(v.qStart,'Start intensity'),qEnd:finite(v.qEnd,'End intensity'),angle:finite(v.angle,'Load angle')};});
  return {nodes,members,lineLoads:loads};
 }
 function equivalentLoads(raw){const model=normalize(raw),map=new Map(model.nodes.map(n=>[n.id,n])),forces=new Map(model.nodes.map(n=>[n.id,{fx:0,fy:0}])),transfers=[];
  for(const [index,v]of model.lineLoads.entries()){const path=v.nodes.map(id=>map.get(id)),lengths=path.slice(1).map((n,i)=>Math.hypot(n.x-path[i].x,n.y-path[i].y)),length=lengths.reduce((a,b)=>a+b,0);if(lengths.some(l=>l<1e-8))throw Error('Line-load path has coincident nodes.');const a=v.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let station=0;const rows=[];
   for(let i=0;i<lengths.length;i++){const L=lengths[i],qa=v.qStart+(v.qEnd-v.qStart)*station/length,qb=v.qStart+(v.qEnd-v.qStart)*(station+L)/length,fa=L*(2*qa+qb)/6,fb=L*(qa+2*qb)/6;for(const [node,F]of [[path[i],fa],[path[i+1],fb]]){const f=forces.get(node.id);f.fx+=F*c;f.fy+=F*s;rows.push({id:node.id,fx:F*c,fy:F*s});}station+=L;}transfers.push({index,length,total:(v.qStart+v.qEnd)*length/2,rows});
  }return {nodes:model.nodes.map(n=>({id:n.id,...forces.get(n.id)})),transfers};
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
 // Geometry-only rank checks: these do not depend on loads or pretend that slack cables brace a bay.
 function stability(raw){
  const {nodes,members}=normalize(raw),N=2*nodes.length,ix=new Map(nodes.map((n,i)=>[n.id,i]));
  function rank(rows,width){const a=rows.map(r=>r.slice());let k=0;for(let j=0;j<width&&k<a.length;j++){let p=k;for(let i=k+1;i<a.length;i++)if(Math.abs(a[i][j])>Math.abs(a[p][j]))p=i;if(Math.abs(a[p][j])<1e-9)continue;[a[k],a[p]]=[a[p],a[k]];const d=a[k][j];for(let q=j;q<width;q++)a[k][q]/=d;for(let i=k+1;i<a.length;i++){const f=a[i][j];for(let q=j;q<width;q++)a[i][q]-=f*a[k][q];}k++;}return k;}
  const restraints=[];for(const n of nodes){const i=ix.get(n.id),add=(x,y)=>{const r=Array(N).fill(0);r[2*i]=x;r[2*i+1]=y;restraints.push(r);};if(n.support==='pin'){add(1,0);add(0,1);}else if(n.support==='rollerX')add(1,0);else if(n.support==='rollerY')add(0,1);else if(n.support==='roller'){const a=n.supportAngle*Math.PI/180;add(-Math.sin(a),Math.cos(a));}}
  const rows=members.map(m=>{const i=ix.get(m.a),j=ix.get(m.b),dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,L=Math.hypot(dx,dy),r=Array(N).fill(0);if(L>1e-8){r[2*i]=-dx/L;r[2*i+1]=-dy/L;r[2*j]=dx/L;r[2*j+1]=dy/L;}return r;});
  const adj=new Map(nodes.map(n=>[n.id,[]]));members.forEach(m=>{adj.get(m.a).push(m.b);adj.get(m.b).push(m.a);});const seen=new Set(),components=[];
  for(const start of nodes){if(seen.has(start.id))continue;const ids=[],todo=[start.id];while(todo.length){const id=todo.pop();if(seen.has(id))continue;seen.add(id);ids.push(id);todo.push(...adj.get(id));}components.push(ids.sort((a,b)=>a-b));}
  const issues=[];if(components.length>1)issues.push(`${components.length} disconnected components: ${components.map(ids=>ids.map(id=>'N'+id).join(', ')).join(' / ')}. Each separate component needs its own physical restraints and bracing, or an intended connecting member.`);
  for(const ids of components){const ns=ids.map(id=>nodes[ix.get(id)]),cx=ns.reduce((s,n)=>s+n.x,0)/ns.length,cy=ns.reduce((s,n)=>s+n.y,0)/ns.length,scale=Math.max(1,...ns.map(n=>Math.hypot(n.x-cx,n.y-cy))),rigid=restraints.map(r=>ns.reduce((v,n)=>{const i=ix.get(n.id),x=r[2*i],y=r[2*i+1];return [v[0]+x,v[1]+y,v[2]+(-x*(n.y-cy)+y*(n.x-cx))/scale];},[0,0,0])).filter(r=>r.some(v=>v!==0)),required=ns.length===1?2:3,rr=rank(rigid,required);
   if(!adj.get(ids[0]).length&&ids.length===1)issues.push(`Isolated node N${ids[0]}: connect it to the intended structure or remove it if unintended.`);
   if(rr<required)issues.push(`${ids.map(id=>'N'+id).join(', ')}: external restraint rank ${rr}/${required}; ${required-rr} rigid-body motion(s) remain. ${rigid.length===0?'No supports are assigned. Choose Pin and click an appropriate boundary node, then place a separate roller with a physically appropriate tangent angle.':'Check support locations and roller tangent angles: insufficient, parallel, or concurrent restraint directions can leave translation or rotation free.'}`);
  }
  const nullity=N-rank([...rows,...restraints],N),external=components.reduce((sum,ids)=>{const ns=ids.map(id=>nodes[ix.get(id)]),cx=ns.reduce((s,n)=>s+n.x,0)/ns.length,cy=ns.reduce((s,n)=>s+n.y,0)/ns.length,scale=Math.max(1,...ns.map(n=>Math.hypot(n.x-cx,n.y-cy)));const r=restraints.map(row=>ns.reduce((v,n)=>{const i=ix.get(n.id),x=row[2*i],y=row[2*i+1];return [v[0]+x,v[1]+y,v[2]+(-x*(n.y-cy)+y*(n.x-cx))/scale];},[0,0,0]));return sum+(ns.length===1?2:3)-rank(r,ns.length===1?2:3);},0);
  if(nullity>external)issues.push(`${nullity-external} internal infinitesimal mechanism(s) remain even with every cable assumed engaged. Check unbraced bays, collinear joints and member connections; add physically intended triangulation. Relevant nodes: ${nodes.map(n=>'N'+n.id).join(', ')}.`);
  return {nullity,externalMotions:external,components,issues,cables:members.filter(m=>m.type==='cable').length,restraints:restraints.length};
 }
 function solve(raw){
  const model=normalize(raw),{nodes,members}=model,n=nodes.length,N=2*n;
  if(n<2||!members.length)throw Error('Add nodes, members, supports and nodal loads, then Solve.');
  const ix=new Map(nodes.map((v,i)=>[v.id,i])),distributed=equivalentLoads(model),F=nodes.flatMap((v,i)=>[v.fx+distributed.nodes[i].fx,v.fy+distributed.nodes[i].fy]);
  const geom=members.map(m=>{
   const i=ix.get(m.a),j=ix.get(m.b),dx=nodes[j].x-nodes[i].x,dy=nodes[j].y-nodes[i].y,L=Math.hypot(dx,dy);
   if(L<1e-8)throw Error('Coincident member ends.');
   const c=dx/L,s=dy/L,t=[-c,-s,c,s],dof=[2*i,2*i+1,2*j,2*j+1],k=m.E*m.A/L;
   return {L,t,dof,k};
  });
  const basis=[];nodes.forEach((v,i)=>{const axis=(x,y)=>{const b=Array(N).fill(0);b[2*i]=x;b[2*i+1]=y;basis.push(b);};if(v.support==='free'){axis(1,0);axis(0,1);}else if(v.support==='rollerX')axis(0,1);else if(v.support==='rollerY')axis(1,0);else if(v.support==='roller'){const a=v.supportAngle*Math.PI/180;axis(Math.cos(a),Math.sin(a));}});
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cables=members.map((m,i)=>m.type==='cable'?i:-1).filter(i=>i>=0);
  const forceTol=1e-9*Math.max(1,...F.map(Math.abs));
  function candidate(active){
   const K=Array.from({length:N},()=>Array(N).fill(0));
   geom.forEach((g,i)=>{if(members[i].type==='cable'&&!active.has(i))return;for(let a=0;a<4;a++)for(let b=0;b<4;b++)K[g.dof[a]][g.dof[b]]+=g.k*g.t[a]*g.t[b];});
   const kb=basis.map(v=>K.map(row=>dot(row,v))),u=Array(N).fill(0),uf=linear(basis.map(v=>kb.map(w=>dot(v,w))),basis.map(v=>dot(v,F)));basis.forEach((v,i)=>v.forEach((a,d)=>u[d]+=a*uf[i]));
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
  const residual=Math.max(0,...basis.map(v=>Math.abs(dot(v,R))));if(residual>1e-7*Math.max(1,...F.map(Math.abs)))throw Error('Cable equilibrium tolerance was not met. No results accepted.');
  const resultNodes=nodes.map((v,i)=>{let rx=0,ry=0;if(v.support==='pin'){rx=R[2*i];ry=R[2*i+1];}else if(v.support==='rollerX')rx=R[2*i];else if(v.support==='rollerY')ry=R[2*i+1];else if(v.support==='roller'){const a=v.supportAngle*Math.PI/180,nx=-Math.sin(a),ny=Math.cos(a),r=nx*R[2*i]+ny*R[2*i+1];rx=nx*r;ry=ny*r;}return {...v,fx:F[2*i],fy:F[2*i+1],ux:u[2*i],uy:u[2*i+1],rx,ry};});
  const resultMembers=members.map((m,i)=>{const g=geom[i],extension=g.t.reduce((a,v,j)=>a+v*u[g.dof[j]],0),force=forces[i],stress=force/m.A,strain=stress/m.E;
   const cableState=m.type!=='cable'?null:force>forceTol?'taut':trial[i]<-forceTol?'slack':'zero-force boundary';
   const Pcr=m.type==='bar'&&m.Imin!==null?Math.PI**2*m.E*m.Imin/(m.Kfactor*g.L)**2:null;
   const utilization=Pcr!==null&&force<0?-force/Pcr:null,slenderness=Pcr!==null?m.Kfactor*g.L/Math.sqrt(m.Imin/m.A):null;
   return {...m,L:g.L,extension,elasticExtension:strain*g.L,strain,stress,force,cableState,Pcr,utilization,slenderness};});
  const equilibrium=resultNodes.reduce((e,v)=>({fx:e.fx+v.fx+v.rx,fy:e.fy+v.fy+v.ry,m:e.m+v.x*(v.fy+v.ry)-v.y*(v.fx+v.rx)}),{fx:0,fy:0,m:0});
  const maxDisplacement=Math.max(...resultNodes.map(v=>Math.hypot(v.ux,v.uy)));
  if([...u,...R,...resultMembers.flatMap(v=>[v.force,v.stress])].some(v=>!Number.isFinite(v)))throw Error('Non-finite result: check geometry and stiffness.');
  return {model,nodes:resultNodes,members:resultMembers,distributed,equilibrium,maxDisplacement,iterations,slackCables:resultMembers.filter(m=>m.cableState==='slack').length};
 }
 root.TrussEngine={normalize,solve,equivalentLoads,stability};
})(typeof globalThis!=='undefined'?globalThis:this);
