/* Optional refined section: homogeneous material-union Saint-Venant torsion.
 * Independent of engine assembly. No shear-centre replacement, no fitted GJ.
 * P1 conforming Neumann warping minimizes int|grad(w)+[-z,x]|² dA.
 * Supply deps={cdt2d,polygonClipping}; bundled browser dependencies avoid network requests.
 */
const WingFiniteSection=(()=>{
 'use strict';const cache=new Map();
 const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+(a[0]*b[1]-a[1]*b[0])/2;},0);
 const clean=p=>{const q=p.map(v=>v.slice());if(q.length>1&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<1e-12)q.pop();return q;};
 function inside(p,rings){let parity=false;for(const ring of rings){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}if(yes)parity=!parity;}return parity;}
 function mesh(spec,h,layers,deps){
  const union=deps.polygonClipping.union([spec.outer,spec.inner].filter(p=>p?.length),...(spec.spars||[]).map(p=>[p]));
  if(union.length!==1)throw Error('Finite-section union must be one connected homogeneous material region.');
  const rings=union[0].map(clean),points=[],edges=[],seen=new Map(),key=p=>p.map(v=>v.toPrecision(14)).join(',');
  const node=p=>{const k=key(p);if(seen.has(k))return seen.get(k);const i=points.length;seen.set(k,i);points.push(p);return i;};
  let exactArea=0;for(let k=0;k<rings.length;k++){const ring=rings[k];exactArea+=(k===0?1:-1)*Math.abs(area(ring));const ids=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(spec.inner?.length?Math.max(Math.abs(b[0]-a[0])/(3*h),Math.abs(b[1]-a[1])/h):Math.hypot(b[0]-a[0],b[1]-a[1])/h));for(let j=0;j<n;j++)ids.push(node([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]));}for(let i=0;i<ids.length;i++)edges.push([ids[i],ids[(i+1)%ids.length]]);}
  // Boundary constraints are at most h long. A local bucket avoids an
  // O(all boundary edges) distance scan for every proposed interior seed.
  const buckets=new Map();for(const e of edges){const a=points[e[0]],b=points[e[1]];for(let ix=Math.floor((Math.min(a[0],b[0])-1e-8)/h);ix<=Math.floor((Math.max(a[0],b[0])+1e-8)/h);ix++)for(let iz=Math.floor((Math.min(a[1],b[1])-1e-8)/h);iz<=Math.floor((Math.max(a[1],b[1])+1e-8)/h);iz++){const k=ix+','+iz;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(e);}}
  const nearBoundary=p=>(buckets.get(Math.floor(p[0]/h)+','+Math.floor(p[1]/h))||[]).some(([i,j])=>{const a=points[i],b=points[j],dx=b[0]-a[0],dz=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz);return t>=0&&t<=1&&(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dz)**2<1e-16;});
  const seed=p=>{if(inside(p,rings)&&!seen.has(key(p))&&!nearBoundary(p))node(p);};
  // Existing paired ring samples seed thin walls through their thickness.
  if(spec.inner?.length===spec.outer.length)for(let j=1;j<layers;j++)for(let i=0;i<spec.inner.length;i++){const a=spec.inner[i],b=spec.outer[i],t=j/layers;seed([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  const xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);
  if(spec.inner?.length){
   // Paired wall seeds already resolve the skin through its thickness. Avoid
   // an isotropic grid over the entire airfoil bounding box and its cavity.
   // Add local seeds only in each finite spar polygon's bounding rectangle.
   for(let x=xmin+.413*h;x<xmax;x+=3*h)for(let z=zmin+.271*h;z<zmax;z+=h)seed([x,z]);
   for(const poly of spec.spars||[]){const px=poly.map(p=>p[0]),pz=poly.map(p=>p[1]),lo=Math.min(...px),hi=Math.max(...px),bot=Math.min(...pz),top=Math.max(...pz);for(let x=lo+.413*h;x<hi;x+=h)for(let z=bot+.271*h;z<top;z+=h)seed([x,z]);}
  }else for(let x=xmin+.413*h;x<xmax;x+=h)for(let z=zmin+.271*h;z<zmax;z+=h)seed([x,z]);
  const tris=deps.cdt2d(points,edges,{exterior:false});if(!tris.length)throw Error('Empty material-union mesh.');
  return {points,tris,exactArea};
 }
 function cg(rows,f,tol=1e-9){
  const n=f.length,off=new Int32Array(n+1),col=[],val=[],diag=new Float64Array(n);let norm=0;
  for(let i=0;i<n;i++){if(i)for(const[j,v]of rows[i])if(j){col.push(j);val.push(v);if(i===j)diag[i]=v;}off[i+1]=col.length;norm+=i?f[i]*f[i]:0;}norm=Math.sqrt(norm);if(norm===0)return {u:new Float64Array(n),iterations:0,residual:0};
  const columns=Int32Array.from(col),values=Float64Array.from(val);
  const multiply=(a,o)=>{o.fill(0);for(let i=1;i<n;i++){let sum=0;for(let k=off[i];k<off[i+1];k++)sum+=values[k]*a[columns[k]];o[i]=sum;}};
  const u=new Float64Array(n),r=Float64Array.from(f),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);r[0]=0;let rz=0;for(let i=1;i<n;i++){if(!(diag[i]>0))throw Error('Disconnected or invalid section stiffness.');z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];}
  let iteration=0;
  for(;iteration<10000;iteration++){multiply(p,ap);let den=0;for(let i=1;i<n;i++)den+=p[i]*ap[i];if(!(den>0))throw Error('Section PCG lost positive definiteness.');const alpha=rz/den;let rr=0;for(let i=1;i<n;i++){u[i]+=alpha*p[i];r[i]-=alpha*ap[i];rr+=r[i]*r[i];}if(Math.sqrt(rr)<=tol*norm){let pinned=-f[0];for(const[j,v]of rows[0])pinned+=v*u[j];if(Math.hypot(Math.sqrt(rr),pinned)<=tol*norm)break;}let next=0;for(let i=1;i<n;i++){z[i]=r[i]/diag[i];next+=r[i]*z[i];}const beta=next/rz;for(let i=1;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;}
  multiply(u,ap);let err=0;for(let i=1;i<n;i++)err+=(ap[i]-f[i])**2;let pinned=-f[0];for(const[j,v]of rows[0])pinned+=v*u[j];err+=pinned*pinned;const residual=Math.sqrt(err)/norm;if(residual>tol*2||iteration===10000)throw Error(`Finite-section PCG did not converge: true residual ${residual}.`);
  return {u,iterations:iteration+1,residual};
 }
 function refine(m){const points=m.points.map(p=>p.slice()),mid=new Map(),at=(i,j)=>{const k=Math.min(i,j)+','+Math.max(i,j);if(mid.has(k))return mid.get(k);const q=points.length;points.push([(points[i][0]+points[j][0])/2,(points[i][1]+points[j][1])/2]);mid.set(k,q);return q;},tris=[];for(const[a,b,c]of m.tris){const ab=at(a,b),bc=at(b,c),ca=at(c,a);tris.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}return {points,tris,exactArea:m.exactArea};}
 function level(spec,h,layers,deps,prior=null){const t=performance.now(),m=prior?refine(prior):mesh(spec,h,layers,deps),meshDone=performance.now(),{points,tris}=m,n=points.length,rows=Array.from({length:n},()=>new Map()),f=new Float64Array(n);let A=0,sx=0,sz=0;
  const elements=tris.map(ids=>{const p=ids.map(i=>points[i]),det=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]),a=Math.abs(det)/2;if(!(a>1e-18))throw Error('Degenerate union triangle.');const gx=[p[1][1]-p[2][1],p[2][1]-p[0][1],p[0][1]-p[1][1]].map(v=>v/det),gz=[p[2][0]-p[1][0],p[0][0]-p[2][0],p[1][0]-p[0][0]].map(v=>v/det),x=p.reduce((s,v)=>s+v[0],0)/3,z=p.reduce((s,v)=>s+v[1],0)/3;A+=a;sx+=a*x;sz+=a*z;return {ids,p,a,gx,gz,x,z};});
  if(Math.abs(A-m.exactArea)>1e-8*Math.max(1,A))throw Error('Constrained mesh does not preserve polygon-union area.');const xc=sx/A,zc=sz/A;let polar=0;
  for(const e of elements){const{ids,p,a,gx,gz}=e,x=e.x-xc,z=e.z-zc;for(let i=0;i<3;i++){f[ids[i]]+=a*(z*gx[i]-x*gz[i]);for(let j=0;j<3;j++){const k=a*(gx[i]*gx[j]+gz[i]*gz[j]);rows[ids[i]].set(ids[j],(rows[ids[i]].get(ids[j])||0)+k);}}for(const axis of [0,1]){const q=p.map(v=>v[axis]-(axis?zc:xc));polar+=a/6*(q[0]**2+q[1]**2+q[2]**2+q[0]*q[1]+q[0]*q[2]+q[1]*q[2]);}}
  const assembled=performance.now(),solved=cg(rows,f),solvedAt=performance.now(),u=solved.u;let J=0,work=0,mean=0;for(let i=0;i<n;i++)work+=f[i]*u[i];
  for(const e of elements){let dx=0,dz=0;for(let i=0;i<3;i++){dx+=e.gx[i]*u[e.ids[i]];dz+=e.gz[i]*u[e.ids[i]];mean+=e.a*u[e.ids[i]]/3;}const x=e.x-xc,z=e.z-zc;J+=e.a*(dx*dx+dz*dz-2*z*dx+2*x*dz);}
  J+=polar;const identity=Math.abs(J-(polar-work))/J;if(!(J>0)||identity>1e-7)throw Error('Finite-section energy identity failed.');
  const result={J,GJ:spec.G*J,area:A,centroid:[xc,zc],nodes:n,triangles:tris.length,iterations:solved.iterations,trueRelativeResidual:solved.residual,energyIdentityRelative:identity,elapsedMs:performance.now()-t,meshMs:meshDone-t,assemblyMs:assembled-meshDone,solveMs:solvedAt-assembled,h,layers,variationalScope:'Conforming P1 free-warping energy upper bound for this polygon union; not restrained-warping stress or an exact curved CAD section.'};Object.defineProperty(result,'_mesh',{value:m,configurable:true});return result;
 }
 function solve(spec,options={}){
  if(!(spec.G>0)||!Number.isFinite(spec.G))throw Error('A finite positive homogeneous shear modulus is required.');if(spec.partShearModuli?.some(g=>Math.abs(g-spec.G)>1e-12*spec.G))throw Error('Finite-section supports homogeneous shear modulus only; retain the explicit existing multi-material model.');
  const deps=options.deps||globalThis.WingFiniteSectionDeps;if(!deps?.cdt2d||!deps?.polygonClipping)throw Error('Finite-section dependencies are unavailable.');
  const key=JSON.stringify([spec,options.levels||(spec.inner?.length?[[.6,1],[.3,2],[.15,4]]:[[.6,1],[.3,2],[.15,4]])]);if(cache.has(key))return {...cache.get(key),cached:true};
  const history=[];let previousMesh=null;for(const[h,layers]of options.levels||(spec.inner?.length?[[.6,1],[.3,2],[.15,4]]:[[.6,1],[.3,2],[.15,4]])){const r=level(spec,previousMesh?history.at(-1).h/2:h,previousMesh?history.at(-1).layers*2:layers,deps,previousMesh);previousMesh=r._mesh;delete r._mesh;history.push(r);if(history.length>1){if(r.J>history.at(-2).J*(1+1e-7))throw Error('Nested P1 refinement increased the variational energy beyond algebra tolerance.');r.refinementRelative=Math.abs(r.J-history.at(-2).J)/r.J;if(r.refinementRelative<=(spec.inner?.length?.01:.003)){const out={...r,history,cached:false,refinementAdmitted:true,shearCentreReplaced:false};if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,out);return out;}}}
  throw Error(`Finite-section did not meet1%refinement: ${JSON.stringify(history.map(r=>({J:r.J,nodes:r.nodes,ms:r.elapsedMs})))}`);
 }
 return {solve,level,clearCache:()=>cache.clear()};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingFiniteSection;
