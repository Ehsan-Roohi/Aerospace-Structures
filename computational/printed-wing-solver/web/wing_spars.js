/* Bonded thin-wall spar sections. mm, N, MPa, g/cm3.
 * Skin panels and spar web form a shear-flow network; caps are open panel branches.
 * Perfect ties transfer shear without adding fictitious material. Energy minimization
 * enforces nodal longitudinal equilibrium and torque, including closed-cell compatibility.
 * This is a thin-wall beam model, NOT 3-D joint, adhesive, runout or buckling analysis.
 * Network derivation: minimize 1/2 sum(q_e^2 l_e/(G_e t_e)), subject to
 * B q = -EA_i (z_i-zbar-c(x_i-xbar)) V/EI and a.q = T about the reference.
 * The torque row enforces closed-cell compatibility by complementary energy.
 * Zero cross-energy between unit V and T defines the shear centre. Panel area
 * is lumped to its end nodes for the shear-flow source; normal-stress section
 * integrals use the actual nonoverlapping cap/web polygons. Skin is sampled
 * to approximately 90 panels with extra cap-bond nodes. Curved caps use the
 * horizontal median-panel idealization in shear flow. Refinement is tested.
 * Theory context: MIT 16.20, Unit 15, Shearing and Torsion of Shell Beams:
 * https://ocw.mit.edu/courses/16-20-structural-mechanics-fall-2002/resources/unit15/
 */
const WingSpars=(()=>{
  'use strict';
  const MAT={name:'Printed PLA · teaching input',E:2000,nu:.35,rho:1.24,ft:15,fc:50,fs:10};
  const keys=['fraction','length','topWidth','topThickness','bottomWidth','bottomThickness','webThickness','material','widthMode'];
  const G=m=>m.E/(2*(1+m.nu));
  function specs(raw,L){
    if(raw==null)return [];
    if(!Array.isArray(raw)||raw.length>2)throw Error('Use zero, one or two bonded spars.');
    return raw.map((s,i)=>{
      if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!keys.includes(k)))throw Error(`Spar ${i+1}: unsupported field.`);
      const v={...s};
      for(const k of keys.filter(k=>k!=='material'&&k!=='widthMode'))if(!Number.isFinite(v[k])||v[k]<=0)throw Error(`Spar ${i+1}: ${k} must be finite and positive.`);
      if(v.widthMode!==undefined&&!['fixed','auto'].includes(v.widthMode))throw Error(`Spar ${i+1}: widthMode must be fixed or auto.`);
      if(v.fraction>=1||v.length>L||v.length<Math.min(20,L))throw Error('Spar station must be inside the chord; length must be 20 mm to the semi-span (or the full shorter span).');
      if(v.topThickness>v.topWidth/5||v.bottomThickness>v.bottomWidth/5)throw Error('Thin-wall spar caps require thickness ≤ width/5.');
      if(v.webThickness>=Math.min(v.topWidth,v.bottomWidth))throw Error('Spar web must be narrower than both caps.');
      const m=s.material;
      if(!m||Object.keys(m).some(k=>!Object.keys(MAT).includes(k)))throw Error('Supply spar material name, E, nu, rho, ft, fc and fs.');
      for(const k of ['E','rho','ft','fc','fs'])if(!Number.isFinite(m[k])||m[k]<=0)throw Error(`Spar material ${k} must be finite and positive.`);
      if(!Number.isFinite(m.nu)||m.nu<0||m.nu>=.5)throw Error('Spar material Poisson ratio must be 0 ≤ nu < 0.5.');
      if(typeof m.name!=='string'||!m.name.trim()||m.name.length>80)throw Error('Spar material name must contain 1–80 characters.');
      return Object.freeze({...v,material:Object.freeze({...m})});
    });
  }
  function widths(g,s,y){
    const chord=g.sectionChord??(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan),scale=Math.min(1,Math.max(0,chord/g.rootChord)),auto=s.widthMode==='auto';
    return {topWidth:auto?Math.max(5*s.topThickness,s.topWidth*scale):s.topWidth,bottomWidth:auto?Math.max(5*s.bottomThickness,s.bottomWidth*scale):s.bottomWidth,scale:auto?scale:1,mode:auto?'auto':'fixed',minimumTopWidth:5*s.topThickness,minimumBottomWidth:5*s.bottomThickness};
  }
  function parts(g,y,ordinates){
    const c=g.sectionChord??(g.rootChord+(g.tipChord-g.rootChord)*y/g.semiSpan),out=[];
    (g.spars||[]).forEach((s,index)=>{
      if(y>s.length+1e-8)return;
      const effective=widths(g,s,y),topWidth=effective.topWidth,bottomWidth=effective.bottomWidth;
      if(s.webThickness>=Math.min(topWidth,bottomWidth))throw Error(`Spar ${index+1}: tapered caps must remain wider than the web at y=${y.toFixed(1)} mm.`);
      const x=s.fraction*c,top=[],bottom=[];
      for(let j=0;j<=8;j++){
        const xt=x+topWidth*(j/8-.5),xb=x+bottomWidth*(j/8-.5);
        if(Math.min(xt,xb)<=g.cavityStart*c||Math.max(xt,xb)>=g.cavityEnd*c)throw Error(`Spar ${index+1} caps must fit wholly inside the cavity at y=${y.toFixed(1)} mm.`);
        const u=ordinates(g.naca,xt/c,c,g.te).upper-g.skin;
        const b=ordinates(g.naca,xb/c,c,g.te).lower+g.skin;
        const atTop=ordinates(g.naca,xt/c,c,g.te),atBottom=ordinates(g.naca,xb/c,c,g.te);
        if(u-s.topThickness<=atTop.lower+g.skin||b+s.bottomThickness>=atBottom.upper-g.skin)throw Error(`Spar ${index+1} cap thickness must fit between the inner skins at y=${y.toFixed(1)} mm.`);
        top.push([xt,u]);bottom.push([xb,b]);
      }
      const v=ordinates(g.naca,s.fraction,c,g.te),zt=v.upper-g.skin-s.topThickness/2,zb=v.lower+g.skin+s.bottomThickness/2;
      const h=zt-zb-(s.topThickness+s.bottomThickness)/2;
      if(h<=0||s.webThickness>h/5)throw Error(`Spar ${index+1}: positive web height and web thickness ≤ height/5 required at y=${y.toFixed(1)} mm.`);
      const at=(line,q)=>{let i=1;while(i<line.length-1&&line[i][0]<q)i++;const a=line[i-1],b=line[i];return a[1]+(b[1]-a[1])*(q-a[0])/(b[0]-a[0]);};
      const xl=x-s.webThickness/2,xr=x+s.webThickness/2,tu=q=>at(top,q)-s.topThickness,bl=q=>at(bottom,q)+s.bottomThickness;
      for(const q of [xl,xr,...top.map(p=>p[0]),...bottom.map(p=>p[0])].filter(q=>q>=xl&&q<=xr))if(tu(q)-bl(q)<5*s.webThickness)throw Error(`Spar ${index+1}: web thickness must be at most one fifth of the web height across its full width at y=${y.toFixed(1)} mm.`);
      const web=[[xl,bl(xl)],...bottom.filter(p=>p[0]>xl&&p[0]<xr).map(p=>[p[0],bl(p[0])]),[xr,bl(xr)],[xr,tu(xr)],...[...top].reverse().filter(p=>p[0]>xl&&p[0]<xr).map(p=>[p[0],tu(p[0])]),[xl,tu(xl)]];
      const polygons=[top.concat([...top].reverse().map(([a,b])=>[a,b-s.topThickness])),bottom.concat([...bottom].reverse().map(([a,b])=>[a,b+s.bottomThickness])),web];
      const outline=[...top,[top.at(-1)[0],tu(top.at(-1)[0])],...[...top].reverse().filter(p=>p[0]>xr&&p[0]<top.at(-1)[0]).map(p=>[p[0],tu(p[0])]),[xr,tu(xr)],[xr,bl(xr)],...bottom.filter(p=>p[0]>xr).map(p=>[p[0],bl(p[0])]),...bottom.slice().reverse(),[bottom[0][0],bl(bottom[0][0])],...bottom.filter(p=>p[0]>bottom[0][0]&&p[0]<xl).map(p=>[p[0],bl(p[0])]),[xl,bl(xl)],[xl,tu(xl)],...[...top].reverse().filter(p=>p[0]<xl).map(p=>[p[0],tu(p[0])])];
      out.push({index,s,widths:effective,x,zt,zb,h,top,bottom,polygons,outline});
    });
    for(let i=0;i<out.length;i++)for(let j=0;j<i;j++){
      const a=out[i],b=out[j],half=(Math.max(a.widths.topWidth,a.widths.bottomWidth)+Math.max(b.widths.topWidth,b.widths.bottomWidth))/2;
      if(Math.abs(a.x-b.x)<=half)throw Error('Bonded spar caps must not overlap each other.');
    }
    return out;
  }
  function polygon(p){
    const a=[0,0,0,0,0,0];
    p.forEach(([x,z],i)=>{const [u,v]=p[(i+1)%p.length],d=x*v-u*z;a[0]+=d/2;a[1]+=(z+v)*d/6;a[2]+=(x+u)*d/6;a[3]+=(z*z+z*v+v*v)*d/12;a[4]+=(x*x+x*u+u*u)*d/12;a[5]+=(2*x*z+x*v+u*z+2*u*v)*d/24;});
    return a[0]<0?a.map(v=>-v):a;
  }
  function linearSolve(A,b){
    const n=b.length,L=Array.from({length:n},()=>new Float64Array(n));
    for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let s=A[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];if(i===j){if(!(s>1e-18))throw Error('Disconnected or degenerate spar shear-flow network.');L[i][j]=Math.sqrt(s);}else L[i][j]=s/L[j][j];}
    const y=new Float64Array(n),x=new Float64Array(n);
    for(let i=0;i<n;i++){let s=b[i];for(let j=0;j<i;j++)s-=L[i][j]*y[j];y[i]=s/L[i][i];}
    for(let i=n-1;i>=0;i--){let s=y[i];for(let j=i+1;j<n;j++)s-=L[j][i]*x[j];x[i]=s/L[i][i];}return x;
  }
  function network(inner,outer,pla,ps,resolution=90){
    const nodes=[],edges=[],EA=[];
    const node=(p)=>{nodes.push(p);EA.push(0);return nodes.length-1;};
    const edge=(a,b,t,m,kind,index=-1,tie=false)=>{
      const p=nodes[a],q=nodes[b],l=Math.hypot(q[0]-p[0],q[1]-p[1]);if(l<1e-8)return;
      edges.push({a,b,t,m,l,kind,index,tie});if(!tie){EA[a]+=m.E*t*l/2;EA[b]+=m.E*t*l/2;}
    };
    // Keep roughly 90 skin edges; section resolution is independent of beam-element count.
    const stride=Math.max(1,Math.floor(inner.length/resolution)),ids=[];
    for(let i=0;i<inner.length;i+=stride)ids.push(i);
    ids.forEach(i=>node([(inner[i][0]+outer[i][0])/2,(inner[i][1]+outer[i][1])/2]));
    ids.forEach((i,k)=>{const j=ids[(k+1)%ids.length],poly=[];let v=i;while(v!==j){poly.push(outer[v]);v=(v+1)%inner.length;}poly.push(outer[j],inner[j]);v=(j-1+inner.length)%inner.length;while(v!==i){poly.push(inner[v]);v=(v-1+inner.length)%inner.length;}poly.push(inner[i]);const a=polygon(poly)[0],p=nodes[k],q=nodes[(k+1)%ids.length],l=Math.hypot(q[0]-p[0],q[1]-p[1]);edge(k,(k+1)%ids.length,a/l,pla,'skin');});
    ps.forEach(p=>{
      const m=p.s.material,ut=node([p.x,p.zt]),lt=node([p.x,p.zb]);
      const attach=(id,upper)=>{
        const x=nodes[id][0],ei=edges.findIndex(e=>e.kind==='skin'&&((nodes[e.a][1]+nodes[e.b][1])/2>(p.zt+p.zb)/2)===upper&&x>=Math.min(nodes[e.a][0],nodes[e.b][0])-1e-9&&x<=Math.max(nodes[e.a][0],nodes[e.b][0])+1e-9);
        if(ei<0)throw Error('Spar cap has no matching bonded skin panel.');
        const e=edges[ei],a=nodes[e.a],b=nodes[e.b],u=(x-a[0])/(b[0]-a[0]);let to;
        if(u<1e-8)to=e.a;else if(u>1-1e-8)to=e.b;else{
          to=node([x,a[1]+u*(b[1]-a[1])]);edges.splice(ei,1);EA[e.a]-=e.m.E*e.t*e.l/2;EA[e.b]-=e.m.E*e.t*e.l/2;
          edge(e.a,to,e.t,e.m,'skin');edge(to,e.b,e.t,e.m,'skin');
        }
        edge(id,to,1,m,'bond',p.index,true);
      };
      attach(ut,true);attach(lt,false);
      // Cap branches include independent upper/lower dimensions; the web excludes cap thickness.
      for(const [mid,width,t,kind] of [[ut,p.widths?.topWidth??p.s.topWidth,p.s.topThickness,'top cap'],[lt,p.widths?.bottomWidth??p.s.bottomWidth,p.s.bottomThickness,'bottom cap']])for(const sign of [-1,1]){
        const base=nodes[mid],a=node([base[0]+sign*width/4,base[1]]),b=node([base[0]+sign*width/2,base[1]]);edge(mid,a,t,m,kind,p.index);edge(a,b,t,m,kind,p.index);attach(a,mid===ut);attach(b,mid===ut);
      }
      const lo=node([p.x,p.zb+p.s.bottomThickness/2]),hi=node([p.x,p.zt-p.s.topThickness/2]);
      edge(lt,lo,1,m,'bond',p.index,true);edge(hi,ut,1,m,'bond',p.index,true);
      edge(lo,hi,p.s.webThickness,m,'web',p.index);
    });
    let sum=EA.reduce((a,b)=>a+b,0),xc=0,zc=0;
    EA.forEach((a,i)=>{xc+=a*nodes[i][0]/sum;zc+=a*nodes[i][1]/sum;});
    let Izz=0,Ixx=0,Ixz=0;EA.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;Izz+=a*z*z;Ixx+=a*x*x;Ixz+=a*x*z;});
    const coupling=Ixz/Ixx,EI=Izz-Ixz*coupling,N=nodes.length,K=Array.from({length:N},()=>new Float64Array(N));
    const maxC=Math.max(...edges.filter(e=>!e.tie).map(e=>G(e.m)*e.t/e.l));
    edges.forEach(e=>{
      e.c=e.tie?maxC*1e4:G(e.m)*e.t/e.l;
      const a=nodes[e.a],b=nodes[e.b];e.torque=(a[0]-xc)*(b[1]-a[1])-(a[1]-zc)*(b[0]-a[0]);
      e.row=[];if(e.a<N-1)e.row.push([e.a,1]);if(e.b<N-1)e.row.push([e.b,-1]);e.row.push([N-1,e.torque]);
      for(const [i,v]of e.row)for(const [j,w]of e.row)K[i][j]+=e.c*v*w;
    });
    const bV=new Float64Array(N),bT=new Float64Array(N);bT[N-1]=1;
    for(let i=0;i<N-1;i++)bV[i]=-EA[i]*((nodes[i][1]-zc)-coupling*(nodes[i][0]-xc))/EI;
    const flow=b=>{const u=linearSolve(K,b);return edges.map(e=>e.c*e.row.reduce((a,[i,v])=>a+v*u[i],0));};
    const qV=flow(bV),qT=flow(bT),dot=(a,b)=>edges.reduce((s,e,i)=>s+a[i]*b[i]/e.c,0);
    const fTT=dot(qT,qT),offset=-dot(qV,qT)/fTT,qVs=qV.map((v,i)=>v+offset*qT[i]);
    const resultants=q=>edges.reduce((s,e,i)=>{const a=nodes[e.a],b=nodes[e.b];s[0]+=q[i]*(b[0]-a[0]);s[1]+=q[i]*(b[1]-a[1]);s[2]+=q[i]*e.torque;return s;},[0,0,0]);
    const residual=(q,b)=>{const r=new Float64Array(N);edges.forEach((e,i)=>e.row.forEach(([j,v])=>r[j]+=q[i]*v));return Math.max(...r.map((v,i)=>Math.abs(v-b[i])));};
    const loadV=Float64Array.from(bV);loadV[N-1]=offset;
    return {nodes,edges,qV:qVs,qT,GJ:1/fTT,xsc:xc+offset,zsc:zc,referenceX:xc,unitV:resultants(qVs),unitT:resultants(qT),coupling,energyVT:dot(qVs,qT),residualV:residual(qVs,loadV),residualT:residual(qT,bT),method:'bonded thin-wall shear-flow network; cap-local Saint-Venant torsion neglected'};
  }
  function field(net,V,T){return net.edges.map((e,i)=>e.tie?0:Math.abs(-V*net.qV[i]+T*net.qT[i])/e.t);}
  /* General two-transverse-direction network on an affine normal-plane cut.
   * Original network() is deliberately unchanged. Call projectedNetwork(net,A)
   * with an existing skin/spar graph, or (inner,outer,pla,parts,A,resolution).
   * A maps original [x,z] to the new transverse coordinates [q2,q3]. Projected
   * material area is abs(det(A))*t*l; the thickness on the mapped edge is that
   * area divided by its new length. This is the projected beam-section model,
   * not an exact oblique cut through finite-thickness CAD or a shell FE model.
   * Torque convention: T=sum q*(x_a*dz-z_a*dx), about the reported centroid.
   * qV2 and qV3 are positive unit transverse resultants acting at the SC.
   */
  function projectedNetwork(first,second,pla,ps,affine,resolution=90){
    let raw,A;if(first&&Array.isArray(first.nodes)&&Array.isArray(first.edges)){raw=first;A=second;}else{raw=network(first,second,pla,ps,resolution);A=affine;}
    if(!Array.isArray(A)||A.length!==2||A.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>!Number.isFinite(v))))throw Error('The section projection must be a finite 2 by 2 matrix.');
    const determinant=A[0][0]*A[1][1]-A[0][1]*A[1][0],areaFactor=Math.abs(determinant);
    if(areaFactor<1e-8)throw Error('The projected section is singular or nearly parallel to the beam axis.');
    const nodes=raw.nodes.map(([x,z])=>[A[0][0]*x+A[0][1]*z,A[1][0]*x+A[1][1]*z]),N=nodes.length,EAi=new Float64Array(N);
    const edges=raw.edges.map(e=>{const a=nodes[e.a],b=nodes[e.b],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!(l>1e-12))throw Error('Projected section has a collapsed network edge.');const area=e.tie?0:areaFactor*e.t*e.l,t=e.tie?e.t:area/l;
      if(!e.tie){EAi[e.a]+=e.m.E*area/2;EAi[e.b]+=e.m.E*area/2;}return {...e,l,t,area};});
    const EA=EAi.reduce((a,b)=>a+b,0);if(!(EA>0))throw Error('Projected section has no axial stiffness.');
    let xc=0,zc=0;EAi.forEach((a,i)=>{xc+=a*nodes[i][0]/EA;zc+=a*nodes[i][1]/EA;});
    let Dxx=0,Dzz=0,Dxz=0;EAi.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;Dxx+=a*x*x;Dzz+=a*z*z;Dxz+=a*x*z;});
    const detD=Dxx*Dzz-Dxz*Dxz;if(!(detD>Number.EPSILON*Dxx*Dzz))throw Error('Projected section bending tensor is singular.');
    let exactXX=0,exactZZ=0,exactXZ=0;
    for(const e of edges)if(!e.tie){const a=nodes[e.a],b=nodes[e.b],x=a[0]-xc,u=b[0]-xc,z=a[1]-zc,v=b[1]-zc,w=e.m.E*e.area;
      exactXX+=w*(x*x+x*u+u*u)/3;exactZZ+=w*(z*z+z*v+v*v)/3;exactXZ+=w*(2*x*z+x*v+u*z+2*u*v)/6;}
    const K=Array.from({length:N},()=>new Float64Array(N)),maxC=Math.max(...edges.filter(e=>!e.tie).map(e=>G(e.m)*e.t/e.l));
    edges.forEach(e=>{e.c=e.tie?maxC*1e4:G(e.m)*e.t/e.l;const a=nodes[e.a],b=nodes[e.b];e.torque=(a[0]-xc)*(b[1]-a[1])-(a[1]-zc)*(b[0]-a[0]);e.row=[];if(e.a<N-1)e.row.push([e.a,1]);if(e.b<N-1)e.row.push([e.b,-1]);e.row.push([N-1,e.torque]);for(const [i,v]of e.row)for(const [j,w]of e.row)K[i][j]+=e.c*v*w;});
    // Diagonal equilibration changes neither constraints nor material energies;
    // it avoids mixing mm-scale torque rows with dimensionless incidence rows.
    const scale=K.map((r,i)=>{if(!(r[i]>0))throw Error('Disconnected projected section.');return 1/Math.sqrt(r[i]);});
    const scaledK=K.map((r,i)=>Float64Array.from(r,(v,j)=>v*scale[i]*scale[j]));
    const flow=b=>{const scaledB=Float64Array.from(b,(v,i)=>v*scale[i]),s=linearSolve(scaledK,scaledB),u=Float64Array.from(s,(v,i)=>v*scale[i]);return edges.map(e=>e.c*e.row.reduce((v,[j,w])=>v+w*u[j],0));};
    const bx=new Float64Array(N),bz=new Float64Array(N),bt=new Float64Array(N),sourceX=new Float64Array(N),sourceZ=new Float64Array(N);bt[N-1]=1;
    EAi.forEach((a,i)=>{const x=nodes[i][0]-xc,z=nodes[i][1]-zc;sourceX[i]=-a*(Dzz*x-Dxz*z)/detD;sourceZ[i]=-a*(Dxx*z-Dxz*x)/detD;if(i<N-1){bx[i]=sourceX[i];bz[i]=sourceZ[i];}});
    const qX0=flow(bx),qZ0=flow(bz),qT=flow(bt),dot=(a,b)=>edges.reduce((s,e,i)=>s+a[i]*b[i]/e.c,0),fTT=dot(qT,qT);
    if(!(fTT>0))throw Error('Projected section torsional compliance is not positive.');
    const torqueX=-dot(qX0,qT)/fTT,torqueZ=-dot(qZ0,qT)/fTT,qV2=qX0.map((v,i)=>v+torqueX*qT[i]),qV3=qZ0.map((v,i)=>v+torqueZ*qT[i]);
    const resultants=q=>edges.reduce((s,e,i)=>{const a=nodes[e.a],b=nodes[e.b];s[0]+=q[i]*(b[0]-a[0]);s[1]+=q[i]*(b[1]-a[1]);s[2]+=q[i]*e.torque;return s;},[0,0,0]);
    const residual=(q,source,T)=>{const r=new Float64Array(N);let torque=0;edges.forEach((e,i)=>{r[e.a]+=q[i];r[e.b]-=q[i];torque+=e.torque*q[i];});return Math.max(Math.abs(torque-T),...r.map((v,i)=>Math.abs(v-(source?source[i]:0))));};
    const shearCompliance=[[dot(qV2,qV2),dot(qV2,qV3)],[dot(qV2,qV3),dot(qV3,qV3)]];
    const unitV2=resultants(qV2),unitV3=resultants(qV3),unitT=resultants(qT),residualV2=residual(qV2,sourceX,torqueX),residualV3=residual(qV3,sourceZ,torqueZ),residualT=residual(qT,null,1);
    return {nodes,edges,EA,EAi,xc,zc,referenceX:xc,referenceZ:zc,xsc:xc+torqueZ,zsc:zc-torqueX,GJ:1/fTT,
      qV2,qV3,qVx:qV2,qVz:qV3,qV:qV3,qT,unitV2,unitV3,unitVx:unitV2,unitVz:unitV3,unitV:unitV3,unitT,
      residualV2,residualV3,residualV:residualV3,residualT,energyV2T:dot(qV2,qT),energyV3T:dot(qV3,qT),energyVT:dot(qV3,qT),shearCompliance,
      nodalD:[[Dxx,Dxz],[Dxz,Dzz]],Dnormal:[[exactXX,exactXZ],[exactXZ,exactZZ]],EIxx:exactZZ,EIzz:exactXX,EIxz:exactXZ,
      projection:A.map(r=>r.slice()),areaFactor,sourceX,sourceZ,
      method:'affine-projected bonded thin-wall network; two transverse shears; cap-local Saint-Venant torsion neglected'};
  }
  return {MAT,specs,widths,parts,polygon,network,projectedNetwork,field,G};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSpars;
