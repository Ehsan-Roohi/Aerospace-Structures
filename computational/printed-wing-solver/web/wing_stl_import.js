/* Local STL inspection and restricted, explicit-axis external-wing recovery.
 * STL carries triangles only: no units, material, section construction, clamp
 * or load. Neither parser nor recovery claims a finite-element stress solve.
 */
const WingSTLImport=(()=>{
 'use strict';
 const AXIS={x:0,y:1,z:2},MAX_BYTES=64*1024*1024,MAX_TRIANGLES=500000;
 const fail=s=>{throw Error(s);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),extent=(points,k)=>points.reduce((b,p)=>[Math.min(b[0],p[k]),Math.max(b[1],p[k])],[Infinity,-Infinity]);
 function inputBytes(input){if(typeof input==='string')return new TextEncoder().encode(input);if(input instanceof ArrayBuffer)return new Uint8Array(input);if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);fail('Supply STL text or an ArrayBuffer/typed byte array.');}
 function parse(input,options={}){
  if(options.units!=='mm')fail('STL has no units. Explicitly confirm millimetres (units: mm) before import; no scale is guessed.');
  const bytes=inputBytes(input),maxBytes=options.maxBytes??MAX_BYTES,maxTriangles=options.maxTriangles??MAX_TRIANGLES,maxCoordinate=options.maxCoordinateAbs??1e6;
  if(!Number.isInteger(maxBytes)||maxBytes<84||maxBytes>256*1024*1024||!Number.isInteger(maxTriangles)||maxTriangles<1||maxTriangles>1000000||!Number.isFinite(maxCoordinate)||maxCoordinate<=0||maxCoordinate>1e9)fail('Invalid STL admission limits.');
  if(bytes.byteLength>maxBytes)fail('STL exceeds the admitted byte limit.');if(bytes.byteLength<15)fail('STL is empty or truncated.');
  const points=[],triangles=[],ids=new Map(),faceKeys=new Set();let format,normalCount=0;
  function finite(x){if(!Number.isFinite(x)||Math.abs(x)>maxCoordinate)fail('STL coordinate/normal is non-finite or outside the admitted coordinate range.');return Object.is(x,-0)?0:x;}
  function triangle(raw){
   if(triangles.length/3>=maxTriangles)fail('STL exceeds the admitted triangle count.');
   const p=raw.map(v=>v.map(finite)),a=sub(p[1],p[0]),b=sub(p[2],p[0]),area2=Math.hypot(...cross(a,b)),edge=Math.max(Math.hypot(...a),Math.hypot(...b),Math.hypot(...sub(p[2],p[1])));
   if(!(edge>0)||!(area2>Math.max(1e-24,edge*edge*1e-14)))fail('STL contains a degenerate or numerically collapsed triangle.');
   const t=p.map(q=>{const key=q.join(',');if(!ids.has(key)){ids.set(key,points.length);points.push(q);}return ids.get(key);}),key=[...t].sort((x,y)=>x-y).join(',');
   if(faceKeys.has(key))fail('STL contains duplicate triangles.');faceKeys.add(key);triangles.push(...t);
  }
  let binaryCount=-1;if(bytes.byteLength>=84){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);binaryCount=v.getUint32(80,true);if(84+50*binaryCount===bytes.byteLength){format='binary';if(binaryCount<1||binaryCount>maxTriangles)fail('Invalid or excessive binary STL triangle count.');for(let i=0;i<binaryCount;i++){const off=84+50*i;for(let k=0;k<3;k++)finite(v.getFloat32(off+4*k,true));normalCount++;triangle([0,1,2].map(k=>[0,1,2].map(j=>v.getFloat32(off+12+12*k+4*j,true))));}}}
  if(!format){
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('Binary STL byte count is invalid or text is not valid ASCII.');}
   if(/[^\x09\x0a\x0d\x20-\x7e]/.test(text))fail('STL text must be ASCII; malformed binary data is not repaired.');
   const header=text.match(/^\s*solid[^\r\n]*(?:\r?\n)/i),footer=text.match(/\bendsolid[^\r\n]*\s*$/i);if(!header||!footer||footer.index<header[0].length)fail('STL is neither a complete binary STL nor an ASCII solid.');
   const tokens=text.slice(header[0].length,footer.index).trim().split(/\s+/);let k=0;const token=s=>{if(tokens[k++]?.toLowerCase()!==s)fail('Malformed ASCII STL facet grammar.');},number=()=>{const value=tokens[k++];if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value||''))fail('Malformed ASCII STL numeric coordinate.');return finite(Number(value));};
   while(k<tokens.length){token('facet');token('normal');for(let j=0;j<3;j++)number();normalCount++;token('outer');token('loop');const raw=[];for(let j=0;j<3;j++){token('vertex');raw.push([number(),number(),number()]);}token('endloop');token('endfacet');triangle(raw);}
   format='ascii';
  }
  if(!triangles.length)fail('STL contains no triangles.');
  const edges=new Map(),parent=Array.from({length:triangles.length/3},(_,i)=>i),rank=new Uint8Array(triangles.length/3),vertexFaces=Array.from({length:points.length},()=>[]),find=i=>{let root=i;while(parent[root]!==root)root=parent[root];while(parent[i]!==i){const next=parent[i];parent[i]=root;i=next;}return root;},join=(a,b)=>{a=find(a);b=find(b);if(a===b)return;if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;};
  for(let i=0;i<triangles.length;i+=3){const f=i/3,t=triangles.slice(i,i+3);t.forEach(v=>vertexFaces[v].push(f));for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push({a,b,f});}}
  let boundaryEdges=0,nonManifoldEdges=0,inconsistentEdges=0;
  for(const e of edges.values()){if(e.length===1)boundaryEdges++;if(e.length>2)nonManifoldEdges++;if(e.length===2&&e[0].a===e[1].a)inconsistentEdges++;for(let i=1;i<e.length;i++)join(e[0].f,e[i].f);}
  let nonManifoldVertices=0;
  for(let v=0;v<points.length;v++){
   const link=new Map();for(const f of vertexFaces[v]){const other=triangles.slice(f*3,f*3+3).filter(i=>i!==v);for(let k=0;k<2;k++){if(!link.has(other[k]))link.set(other[k],[]);link.get(other[k]).push(other[1-k]);}}
   if([...link.values()].some(a=>a.length!==2)){nonManifoldVertices++;continue;}const visited=new Set(),stack=[link.keys().next().value];while(stack.length){const n=stack.pop();if(visited.has(n))continue;visited.add(n);stack.push(...link.get(n));}if(visited.size!==link.size)nonManifoldVertices++;
  }
  const components=new Map();for(let i=0;i<triangles.length/3;i++){const p=find(i);if(!components.has(p))components.set(p,[]);components.get(p).push(i);}
  const shells=[...components.values()].map(faces=>{const origin=points[triangles[faces[0]*3]];let volume=0;for(const f of faces){const p=triangles.slice(f*3,f*3+3).map(i=>sub(points[i],origin));volume+=dot(p[0],cross(p[1],p[2]))/6;}return {triangles:faces.length,signedVolumeMm3:volume};});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  const watertight=boundaryEdges===0&&nonManifoldEdges===0&&inconsistentEdges===0&&nonManifoldVertices===0,topology={watertight,oriented:inconsistentEdges===0,boundaryEdges,nonManifoldEdges,inconsistentEdges,nonManifoldVertices,shellCount:shells.length,shells,selfIntersectionsChecked:false,nestedShellContainmentChecked:false};
  if(options.requireWatertight&&!watertight)fail(`STL is not a closed oriented 2-manifold: ${boundaryEdges} boundary, ${nonManifoldEdges} non-manifold and ${inconsistentEdges} inconsistent edges; ${nonManifoldVertices} non-manifold vertices.`);
  return {mesh:{vertices:Float64Array.from(points.flat()),triangles:Uint32Array.from(triangles)},report:{format,units:'mm',unitsConfirmed:true,bytes:bytes.byteLength,vertices:points.length,triangles:triangles.length/3,bounds:{min,max,size:max.map((x,k)=>x-min[k])},topology,normalCount,geometryRepaired:false,coordinateWelding:'Only numerically identical input vertices are shared; source coordinates are not moved.',analysisAvailable:false,limitations:['STL has no material, supports, loads, units metadata or parametric internal construction.','Closed edge topology does not certify absence of self-intersections or correct nesting of cavity shells.','Imported triangles are reference geometry; no mesh-based stress solution is performed.']},analysisAvailable:false};
 }
 function axes(options){const si=AXIS[options.spanAxis],ci=AXIS[options.chordAxis],ti=AXIS[options.thicknessAxis];if(![si,ci,ti].every(Number.isInteger)||new Set([si,ci,ti]).size!==3)fail('Explicitly declare three distinct spanAxis, chordAxis and thicknessAxis values (x, y or z).');return {si,ci,ti};}
 function slice(parsed,options={}){
  const {si,ci,ti}=axes(options),plane=options.positionMm,tol=options.toleranceMm??1e-6;if(!Number.isFinite(plane)||!Number.isFinite(tol)||tol<=0||tol>1)fail('A finite slice position and positive tolerance up to 1 mm are required.');
  const {vertices,triangles}=parsed.mesh,points=[],cells=new Map(),segments=new Map();let coplanarTriangles=0,maxEndpointMergeMm=0;
  function point(p){const a=Math.floor(p[0]/tol),b=Math.floor(p[1]/tol);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){for(const id of cells.get((a+i)+','+(b+j))||[]){const d=Math.hypot(p[0]-points[id][0],p[1]-points[id][1]);if(d<=tol){maxEndpointMergeMm=Math.max(maxEndpointMergeMm,d);return id;}}}const id=points.length;points.push(p);const key=a+','+b;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);return id;}
  for(let f=0;f<triangles.length;f+=3){const p=[0,1,2].map(k=>Array.from(vertices.slice(3*triangles[f+k],3*triangles[f+k]+3))),d=p.map(q=>q[si]-plane);if(d.every(x=>Math.abs(x)<=1e-12)){coplanarTriangles++;continue;}const hits=[];
   for(let k=0;k<3;k++){const q=p[k],r=p[(k+1)%3],a=d[k],b=d[(k+1)%3];if(Math.abs(a)<=1e-12)hits.push([q[ci],q[ti]]);if(a*b<0){const t=a/(a-b);hits.push([q[ci]+t*(r[ci]-q[ci]),q[ti]+t*(r[ti]-q[ti])]);}}
   const hitIDs=[...new Set(hits.map(point))];if(hitIDs.length===2&&hitIDs[0]!==hitIDs[1])segments.set([...hitIDs].sort((a,b)=>a-b).join(','),hitIDs);else if(hitIDs.length>2)fail('Ambiguous triangle-plane intersection; reduce the declared slice tolerance.');
  }
  const neighbors=new Map();for(const [a,b]of segments.values()){if(!neighbors.has(a))neighbors.set(a,[]);if(!neighbors.has(b))neighbors.set(b,[]);neighbors.get(a).push(b);neighbors.get(b).push(a);}
  const invalid=[...neighbors.values()].filter(a=>a.length!==2).length;if(invalid)return {positionMm:plane,closed:false,loops:[],openOrBranchVertices:invalid,coplanarTriangles,toleranceMm:tol,maxEndpointMergeMm};
  const visited=new Set(),loops=[];for(const start of neighbors.keys()){if(visited.has(start))continue;let previous=-1,current=start;const loop=[];do{if(visited.has(current))fail('Section loop intersects itself topologically.');visited.add(current);loop.push(points[current]);const n=neighbors.get(current),next=n[0]===previous?n[1]:n[0];previous=current;current=next;}while(current!==start);if(loop.length>=3){const area=loop.reduce((s,p,i)=>s+p[0]*loop[(i+1)%loop.length][1]-p[1]*loop[(i+1)%loop.length][0],0)/2;loops.push({points:loop,signedAreaMm2:area,areaMm2:Math.abs(area)});}}
  loops.sort((a,b)=>b.areaMm2-a.areaMm2);return {positionMm:plane,closed:loops.length>0,loops,openOrBranchVertices:0,coplanarTriangles,toleranceMm:tol,maxEndpointMergeMm};
 }
 function recoverPlanform(parsed,options={}){
  const {si,ci,ti}=axes(options),root=options.rootPlaneMm,side=options.side,tol=options.geometryToleranceMm??.1,profileTol=options.profileToleranceMm??tol;
  if(!Number.isFinite(root)||!['positive','negative'].includes(side))fail('Declare rootPlaneMm and side (positive or negative); no span direction or root is guessed.');
  if(!Number.isFinite(tol)||tol<=0||tol>5||!Number.isFinite(profileTol)||profileTol<=0||profileTol>5)fail('Recovery tolerances must be positive and at most 5 mm.');
  const result={status:'reference-only',geometryRepresentable:false,analysisAvailable:false,internalConstructionRecovered:false,sections:[],geometryDraft:null,missingAnalysisInputs:['skin/cavity construction','rib/cap layout','spar/rod layout and attachment','material properties','support/clamp definition','loads and load positions'],reasons:[],tolerances:{geometryMm:tol,profileMm:profileTol},limitations:['External-section extraction is a prospective parameter reconstruction, not stress analysis of the imported triangles.','Interior loops are reported as observed surfaces; skin/ribs/spars are not invented from them.','Agreement at sampled sections does not prove full-surface identity; compare the prospective geometry against the reference mesh before configuring a separate analysis.']};
  if(!parsed.report.topology.watertight){result.reasons.push('Restricted geometry recovery requires closed, consistently oriented manifold topology.');return result;}
  const sign=side==='positive'?1:-1,v=parsed.mesh.vertices;let span=0;for(let i=si;i<v.length;i+=3)span=Math.max(span,sign*(v[i]-root));if(!(span>tol)){result.reasons.push('Declared root and side contain no positive semi-span.');return result;}
  const etas=[0,.125,.25,.375,.5,.625,.75,.875,.97],slices=etas.map(eta=>slice(parsed,{...options,positionMm:root+sign*span*eta,toleranceMm:Math.min(1e-5,tol/100)}));
  if(slices.some(s=>!s.closed)){result.reasons.push('At least one declared span section does not form closed loops.');return result;}
  function profile(s,eta){const p=s.loops[0].points,[minX,maxX]=extent(p,0),c=maxX-minX;if(!(c>tol))fail('A sampled section has no resolvable chord.');const sample=[];
   for(let i=0;i<=80;i++){const u=(1-Math.cos(Math.PI*i/80))/2,x=minX+u*c,z=[];for(let k=0;k<p.length;k++){const a=p[k],b=p[(k+1)%p.length];if(Math.abs(a[0]-x)<1e-9)z.push(a[1]);if((a[0]<x&&b[0]>x)||(b[0]<x&&a[0]>x)){const t=(x-a[0])/(b[0]-a[0]);z.push(a[1]+t*(b[1]-a[1]));}}const unique=[...z].sort((a,b)=>a-b).filter((x,k,a)=>k===0||Math.abs(x-a[k-1])>Math.max(1e-7,Math.min(.001,tol/100)));if(!unique.length||(i>0&&i<80&&unique.length>2))fail('The outer section is folded or not a single-valued upper/lower airfoil.');sample.push({u,lower:Math.min(...z),upper:Math.max(...z)});}
   if(sample[0].upper-sample[0].lower>tol)fail('Blunt leading-edge section cannot be represented as a closed-leading-edge Wing Lab airfoil.');const zLE=(sample[0].upper+sample[0].lower)/2,upper=sample.map(q=>[q.u,(q.upper-zLE)/c]),lower=sample.map(q=>[q.u,(q.lower-zLE)/c]);return {eta,positionMm:s.positionMm,chordMm:c,xLE:minX,zLE,observedLoops:s.loops.length,upper,lower};
  }
  let sections;try{sections=slices.map((s,i)=>profile(s,etas[i]));}catch(error){result.reasons.push(error.message);result.sections=slices;return result;}result.sections=sections;
  const c0=sections[0].chordMm,tipPoints=[];for(let i=0;i<v.length;i+=3)if(Math.abs(sign*(v[i+si]-root)-span)<=Math.max(1e-7,tol/1000))tipPoints.push([v[i+ci],v[i+ti]]);
  const tipX=extent(tipPoints,0),tipZ=extent(tipPoints,1),tipChord=tipX[1]-tipX[0],tipThickness=tipZ[1]-tipZ[0],pointTip=tipChord<=tol&&tipThickness<=tol,ct=pointTip?0:tipChord;
  const error=f=>Math.max(...sections.map(s=>Math.abs(s.chordMm-f(s.eta)))),linearError=error(e=>c0+(ct-c0)*e),ellipseError=error(e=>Math.sqrt(c0*c0*(1-e*e)+ct*ct*e*e));
  const planform=linearError<=tol?(pointTip?'delta':'linear'):ellipseError<=tol?'elliptic':null;result.planformFit={linearResidualMm:linearError,ellipticResidualMm:ellipseError,tipChordObservedMm:tipChord,pointTipObserved:pointTip};
  if(!planform){result.reasons.push('Observed chord schedule does not fit a supported linear/delta/elliptic planform within the declared tolerance.');return result;}
  const fraction=planform==='delta'?1:planform==='elliptic'?.5:0,rootX=sections[0].xLE,rootZ=sections[0].zLE,den=sections.reduce((a,s)=>a+(s.eta*span)**2,0),sweepSlope=sections.reduce((a,s)=>a+s.eta*span*(s.xLE-rootX-fraction*(c0-s.chordMm)),0)/den,dihedralSlope=sections.reduce((a,s)=>a+s.eta*span*(s.zLE-rootZ),0)/den;
  const transformError=Math.max(...sections.map(s=>Math.max(Math.abs(s.xLE-rootX-fraction*(c0-s.chordMm)-sweepSlope*s.eta*span),Math.abs(s.zLE-rootZ-dihedralSlope*s.eta*span)))),base=sections[0],homotheticError=Math.max(...sections.flatMap(s=>s.upper.flatMap((p,i)=>[Math.abs(p[1]-base.upper[i][1])*s.chordMm,Math.abs(s.lower[i][1]-base.lower[i][1])*s.chordMm]))),rootTE=(base.upper.at(-1)[1]-base.lower.at(-1)[1])*c0,teValues=sections.map(s=>(s.upper.at(-1)[1]-s.lower.at(-1)[1])*s.chordMm),fixedTEError=Math.max(...sections.flatMap(s=>s.upper.flatMap((p,i)=>{const correction=(rootTE/s.chordMm-rootTE/c0)*p[0]**4/2;return [Math.abs(p[1]-base.upper[i][1]-correction)*s.chordMm,Math.abs(s.lower[i][1]-base.lower[i][1]+correction)*s.chordMm];}))),fixedTE=Math.max(...teValues.map(t=>Math.abs(t-rootTE)))<=tol&&fixedTEError<=profileTol,profileError=fixedTE?fixedTEError:homotheticError;
  result.recoveryResiduals={transformMm:transformError,homotheticProfileMm:homotheticError,fixedTrailingEdgeProfileMm:fixedTEError};result.externalMeasurements={rootTrailingEdgeThicknessMm:rootTE,sectionTrailingEdgeThicknessMm:teValues,profileFamily:fixedTE?'common profile with constant physical trailing-edge thickness':'common homothetic profile',sampledSpanFractions:etas};
  if(transformError>tol||profileError>profileTol){result.reasons.push(transformError>tol?'The section reference transformation is outside the supported sweep/dihedral representation.':'The observed airfoil sections are not a verified common normalized profile; retain section loops as reference rather than silently inventing a profile family.');return result;}
  const sweepDeg=Math.atan(sweepSlope)*180/Math.PI,dihedralDeg=Math.atan(dihedralSlope)*180/Math.PI;if(Math.abs(sweepDeg)>60||Math.abs(dihedralDeg)>45){result.reasons.push('Recovered sweep/dihedral exceeds Wing Lab geometry limits.');return result;}
  const airfoil={kind:'coordinates',version:1,name:'External profile recovered from confirmed-mm STL',upper:base.upper,lower:base.lower,source:{format:'STL-section',filename:String(options.filename||'').slice(0,180),normalization:'unit-chord'}};
  result.geometryRepresentable=true;result.status='prospective-parameter-geometry';result.geometryDraft={planform,semiSpan:span,rootChord:c0,tipChord:ct,sweepDeg,dihedralDeg,sweepReferenceFraction:fraction,airfoil,...(fixedTE&&rootTE>0?{te:rootTE}:{})};result.sourceToWingLab={sourceAxes:{span:options.spanAxis,chord:options.chordAxis,thickness:options.thicknessAxis},sourceRootPlaneMm:root,sourceRootLeadingEdge:[rootX,rootZ],spanSign:sign};
  result.reasons.push('A sampled external geometry draft is available. Confirm the reconstruction, then explicitly supply internal construction, materials, supports and loads for a separate supported Wing Lab analysis.');return result;
 }
 return {parse,slice,recoverPlanform};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingSTLImport;

