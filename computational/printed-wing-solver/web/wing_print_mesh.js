/* Physical, undeformed printable solids; independent of THREE/display/result meshes.
 * Boolean kernel: Manifold 3.5.4 (Apache-2.0). Coordinates and STL units: mm.
 */
const WingPrintMesh=(()=>{
 'use strict';
 const E=typeof WingEngine!=='undefined'?WingEngine:require('./engine.js');
 const G=typeof WingGeometry!=='undefined'?WingGeometry:require('./wing_geometry.js');
 const VERSION='1.3.1',ENVELOPE=[300,300,300],MAX_MASS=300;
 const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>scale(a,1/Math.hypot(...a));
 const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
 const linspace=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*i/(n-1));
 function spanStations(g,a,b){
  const expanded=g.planform&&g.planform!=='linear'||g.airfoil||g.stations||g.sweepDeg||g.dihedralDeg||g.sweepReferenceFraction;
  const points=g.planform==='elliptic'&&G.closedTip(g)?linspace(Math.asin(a/g.semiSpan),Math.asin(b/g.semiSpan),97).map(t=>g.semiSpan*Math.sin(t)):linspace(a,b,g.planform==='elliptic'?49:expanded?17:5);
  for(const s of g.stations||[])if(s.eta*g.semiSpan>a&&s.eta*g.semiSpan<b)points.push(s.eta*g.semiSpan);
  if(g.twistEnabled)for(let i=1;i<(g.stations||[]).length;i++){const s=g.stations[i-1],t=g.stations[i];for(const y of linspace(s.eta*g.semiSpan,t.eta*g.semiSpan,Math.max(2,Math.ceil(Math.abs(t.incidenceDeg-s.incidenceDeg))+1)))if(y>a&&y<b)points.push(y);}
  return [...new Set(points)].sort((x,y)=>x-y);
 }
 function toBinarySTL(mesh){
  // A double-precision Boolean intersection can collapse to identical float32
  // STL vertices. Drop only exactly zero-area serialized triangles, then
  // independently recheck every oriented edge and the enclosed volume.
  const triangles=[];
  for(let t=0;t<mesh.numTri;t++){
   const p=[0,1,2].map(k=>{const i=mesh.triVerts[3*t+k]*mesh.numProp;return Array.from(mesh.vertProperties.slice(i,i+3),Math.fround);});
   if(!p.flat().every(Number.isFinite))throw Error('STL contains a non-finite coordinate; no file exported.');
   const normal=cross(sub(p[1],p[0]),sub(p[2],p[0]));if(Math.hypot(...normal)===0)continue;triangles.push([...unit(normal),...p.flat()]);
  }
  const bytes=new ArrayBuffer(84+50*triangles.length),v=new DataView(bytes),label=new TextEncoder().encode('MIE446 printable wing; undeformed; mm; mesh Boolean CAD');new Uint8Array(bytes).set(label);v.setUint32(80,triangles.length,true);
  triangles.forEach((triangle,t)=>{let o=84+50*t;for(const x of triangle){v.setFloat32(o,x,true);o+=4;}v.setUint16(o,0,true);});
  return bytes;
 }

 function inspectSTL(bytes){
  const v=new DataView(bytes);if(v.byteLength<84||v.byteLength!==84+50*v.getUint32(80,true))throw Error('STL byte count is invalid.');
  const ids=new Map(),vertices=[],tris=[],edges=new Map();let volume=0;
  for(let t=0;t<v.getUint32(80,true);t++){
   const p=[],tri=[];for(let k=0;k<3;k++){const o=84+50*t+12+12*k,a=[v.getFloat32(o,true),v.getFloat32(o+4,true),v.getFloat32(o+8,true)];if(!a.every(Number.isFinite))throw Error('Non-finite STL coordinate.');const key=a.join(',');if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(a);}tri.push(ids.get(key));p.push(a);}if(new Set(tri).size!==3)throw Error('STL has a collapsed triangle.');tris.push(tri);volume+=dot(p[0],cross(p[1],p[2]))/6;
   for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}
  }
  if([...edges.values()].some(e=>e.count!==2||e.balance!==0))throw Error('The serialized STL is not watertight with consistently oriented faces; no file exported.');
  if(!(volume>0))throw Error('STL does not enclose positive volume.');return {vertices:vertices.length,triangles:tris.length,volumeMm3:volume};
 }
 async function build(input,wasm,onProgress=()=>{}){
  const start=Date.now(),g=E.makeGeometry(input.geometry),{Manifold,Mesh,triangulate}=wasm,owned=new Set(),own=o=>{owned.add(o);return o;};
  const density=input.density??1.24;if(!Number.isFinite(density)||density<=0)throw Error('Set a positive shell material density before exporting.');
  if(g.semiSpan<=2*g.cap)throw Error('Span is too small for the root and tip caps.');
  for(const [value,label]of [[g.skin,'Skin'],[g.ribThickness,'Rib'],[g.te,'Trailing edge']])if(value<.8)throw Error(label+' thickness must be at least 0.8 mm for the course 0.4 mm nozzle.');
  if(g.rodFractions.length>8)throw Error('Use at most eight rod paths.');
  if(g.rodFractions.length){const fit=input.fitRecord;if(!fit||fit.tested!==true||typeof fit.reference!=='string'||!fit.reference.trim()||fit.rodDiameter!==g.rodDiameter||fit.clearance!==g.clearance||fit.sleeveWall!==g.sleeveWall)throw Error('Confirm the physical rod-fit coupon record for these rod diameter, clearance and sleeve-wall settings before STL export.');}

  const sampling=[...new Set([...spanStations(g,0,g.semiSpan),...E.ribStations(g),...E.seams(g),...g.spars.map(s=>s.length)])],radius=E.sleeveRadius(g);
  for(const y of sampling){
   E.ringLoops(g,y,81,2,2);const chord=E.chordAt(g,y),centres=E.rodCentres(g,y),profile=E.airfoilAt(g,y);
   centres.forEach(([x,z],i)=>{
    const room=E.verticalOrdinates(profile,g.rodFractions[i],chord,g.te);
    if(Math.min(room.upper-z,z-room.lower)-radius<.6-1e-6)throw Error(`Rod ${i+1} sleeve needs at least 0.6 mm outer-surface clearance at y=${y.toFixed(1)} mm.`);
    if(x-radius<g.cavityStart*chord-.1||x+radius>g.cavityEnd*chord+.1)throw Error(`Rod ${i+1} sleeve reaches outside the cavity limits. Move the rod or reduce its diameter.`);
    for(let j=-24;j<=24;j++){const dx=radius*j/24,dz=Math.sqrt(Math.max(0,radius*radius-dx*dx)),v=E.verticalOrdinates(profile,(x+dx)/chord,chord,g.te);if(v.upper-g.skin-z-dz<-.1||z-dz-v.lower-g.skin<-.1)throw Error(`Rod ${i+1} sleeve does not fit between the inner skins at y=${y.toFixed(1)} mm.`);}
    for(let j=0;j<i;j++)if(Math.hypot(x-centres[j][0],z-centres[j][1])<2*radius-.1)throw Error('Rod sleeves overlap. Move or remove a rod.');
   });
  }

  const shellMaterial=input.shellMaterial||(G.closedTip(g)?E.MATERIALS.pla_upright:null);
  for(const s of g.spars)for(const key of ['E','nu','rho','ft','fc','fs'])if(shellMaterial&&Math.abs(s.material[key]-shellMaterial[key])>1e-7*Math.max(1,Math.abs(shellMaterial[key])))throw Error('Integral printed spars must use the same material as the shell. Set Materials → Spars to the shell material.');
  const check=(m,label)=>{const status=m.status();if(status!=='NoError'||m.isEmpty())throw Error(label+': invalid CAD solid ('+status+').');return m;};
  function loft(ys,polygonAt,transform=(y,p)=>G.transformPoint(g,y,p)){
   const loops=ys.map(y=>polygonAt(y).map(p=>Array.from(p)));if(loops.length<2||loops.some(p=>p.length!==loops[0].length))throw Error('Inconsistent section contours.');
   if(signedArea(loops[0])<0)loops.forEach(p=>p.reverse());const n=loops[0].length,pointEnd=loops.at(-1).every(p=>Math.hypot(p[0]-loops.at(-1)[0][0],p[1]-loops.at(-1)[0][1])<1e-10),rings=pointEnd?loops.slice(0,-1):loops,vertices=rings.flatMap((loop,j)=>loop.flatMap(p=>transform(ys[j],p))),tri=[];
   for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=(j+1)*n+i,c=(j+1)*n+(i+1)%n,d=j*n+(i+1)%n;tri.push(a,b,c,a,c,d);}
   for(const t of triangulate([loops[0]],1e-8,false))tri.push(...t);
   const end=(rings.length-1)*n;if(pointEnd){const apex=vertices.length/3;vertices.push(...transform(ys.at(-1),loops.at(-1)[0]));for(let i=0;i<n;i++)tri.push(end+i,apex,end+(i+1)%n);}else for(const t of triangulate([loops.at(-1)],1e-8,false))tri.push(end+t[2],end+t[1],end+t[0]);
   let volume=0;for(let i=0;i<tri.length;i+=3){const a=vertices.slice(3*tri[i],3*tri[i]+3),b=vertices.slice(3*tri[i+1],3*tri[i+1]+3),c=vertices.slice(3*tri[i+2],3*tri[i+2]+3);volume+=dot(a,cross(b,c))/6;}if(volume<0)for(let i=0;i<tri.length;i+=3)[tri[i+1],tri[i+2]]=[tri[i+2],tri[i+1]];
   return check(own(new Manifold(new Mesh({numProp:3,vertProperties:new Float32Array(vertices),triVerts:new Uint32Array(tri)}))),'Loft');
  }
  function cylinder(a,b,r,extension=0){const d=unit(sub(b,a)),u=unit(cross(d,Math.abs(d[2])<.9?[0,0,1]:[1,0,0])),w=cross(d,u),length=Math.hypot(...sub(b,a)),origin=sub(a,scale(d,extension)),circle=linspace(0,2*Math.PI,97).slice(0,-1).map(t=>[r*Math.cos(t),r*Math.sin(t)]);return loft([0,length+2*extension],()=>circle,(y,p)=>add(add(origin,scale(d,y)),add(scale(u,p[0]),scale(w,p[1]))));}
  function slab(s,a,b){const first=own(s.trimByPlane([0,1,0],a));return own(first.trimByPlane([0,-1,0],-b));}
  try{
   onProgress('Building exterior and cavity…');const outer=loft(spanStations(g,0,g.semiSpan),y=>E.outerContour(g,y,161));
   const cavityEnd=G.closedTip(g)?E.cavityTipLimit(g)-g.cap:g.semiSpan-g.cap;if(cavityEnd<=g.cap)throw Error('The hollow root region is too short. Use a thicker root airfoil or larger root chord.');
   const cavity=loft(spanStations(g,g.cap,cavityEnd),y=>E.ringLoops(g,y,81,2,2).inner);
   let body=check(own(outer.subtract(cavity)),'Skin');
   onProgress('Adding ribs…');for(const y of E.ribStations(g)){const rib=slab(outer,y-g.ribThickness/2,y+g.ribThickness/2);body=check(own(body.add(rib)),'Rib union');}
   const sparManufacturing=[];
   onProgress('Adding integral spars…');for(let index=0;index<g.spars.length;index++){
    const s=g.spars[index],auto=s.widthMode==='auto',materialEnd=auto?Math.min(s.length,cavityEnd):s.length;
    // Outboard of cavityEnd the same plastic already fills the whole section.
    // An admitted embedded continuation adds no separate solid or volume.
    const breaks=typeof E.sparWidthBreaks==='function'?E.sparWidthBreaks(g,s):[];
    const ys=[...new Set([...spanStations(g,0,materialEnd),...breaks.filter(y=>y>0&&y<materialEnd)])].sort((a,b)=>a-b);
    const end=E.sparParts(g,s.length).find(p=>p.index===index);
    sparManufacturing.push({index,widthMode:auto?'auto':'fixed',declaredLengthMm:s.length,addedMaterialLoftEndMm:materialEnd,embeddedSolidTipStartMm:auto&&s.length>cavityEnd?cavityEnd:null,rootCapWidthsMm:[s.topWidth,s.bottomWidth],endCapWidthsMm:end?.widths?[end.widths.topWidth,end.widths.bottomWidth]:[s.topWidth,s.bottomWidth],widthFloorStationsMm:breaks,embeddedMeaning:auto&&s.length>cavityEnd?'Continuation is embedded in existing same-material solid tip; no extra I-section volume or stiffness is added there.':null});
    // Overlap only within existing plastic: cap/skin 0.05 mm and web/cap
    // 0.03 mm. This avoids coincident-face slivers without thickening the wing.
    for(let part=0;part<3;part++){
     const solid=loft(ys,y=>{const p=E.sparParts(g,y).find(p=>p.index===index);if(!p)throw Error('Spar section is missing.');return p.polygons[part].map(([x,z],j)=>[x,z+(part<2&&j<9?(part===0?.05:-.05):part===2?(z>(p.zt+p.zb)/2?.03:-.03):0)]);});
     body=check(own(body.add(own(solid.intersect(outer)))),'Spar union');
    }
   }
   const rodPaths=[];
   for(let i=0;i<g.rodFractions.length;i++){
    const point=y=>G.transformPoint(g,y,E.rodCentres(g,y)[i]),a=point(0),b=point(g.semiSpan);
    for(const y of spanStations(g,0,g.semiSpan))if(Math.hypot(...sub(point(y),add(a,scale(sub(b,a),y/g.semiSpan))))>.01)throw Error('A straight carbon rod cannot follow this curved path. Remove rods or use a straight path; no bent rod will be exported.');
    rodPaths.push([a,b]);body=check(own(body.add(cylinder(a,b,E.sleeveRadius(g)))),'Sleeve union');
   }
   for(const [a,b]of rodPaths)body=check(own(body.subtract(cylinder(a,b,E.holeRadius(g),2))),'Rod holes');
   onProgress('Checking connected solids and printer fit…');const semiWingVolume=body.volume();
   if(input.fullWing===true){onProgress('Mirroring across the root plane and joining the full wing…');const mirrored=own(body.mirror([0,1,0]));body=check(own(body.add(mirrored)),'Symmetric full wing');if(Math.abs(body.volume()-2*semiWingVolume)>Math.max(.01,5e-5*semiWingVolume))throw Error('Full-wing symmetry failed volume conservation.');}
   const maxMass=MAX_MASS*(input.fullWing===true?2:1),volume=body.volume(),mass=volume*density/1000;if(mass>maxMass)throw Error(`Printed plastic mass ${mass.toFixed(1)} g exceeds ${maxMass} g (${MAX_MASS} g per semi-wing). Revise the design; it has not been scaled.`);
   const wholeParts=body.decompose();wholeParts.forEach(own);if(wholeParts.filter(p=>p.volume()>1e-6).length!==1)throw Error('The complete wing must have one connected material region. Check rib/spar/skin connections.');
   const files=[],modules=[],halfBounds=E.moduleBounds(g),bounds=input.fullWing===true&&g.modules>1?[...halfBounds.slice(1).reverse().map(y=>-y),...halfBounds]:input.fullWing===true?[-g.semiSpan,g.semiSpan]:halfBounds;let sum=0,serializedSum=0;
   for(let i=0;i<bounds.length-1;i++){
    const module=bounds.length===2?body:check(slab(body,bounds[i],bounds[i+1]),'Module '+(i+1)),pieces=module.decompose();pieces.forEach(own);if(pieces.filter(p=>p.volume()>1e-6).length!==1)throw Error(`Module ${i+1} contains disconnected material regions.`);
    const box=module.boundingBox(),size=box.max.map((x,k)=>x-box.min[k]);if(size.some((x,k)=>x>ENVELOPE[k]+1e-3))throw Error(`Module ${i+1} is ${size.map(x=>x.toFixed(1)).join(' × ')} mm; it does not fit the 300 × 300 × 300 mm printer. Increase Printed modules or revise dimensions. No automatic scaling.`);
    // STL has one material and no Boolean face provenance. Keeping every old
    // coplanar Boolean face boundary prevents the kernel from collapsing tiny
    // seam slivers; float32 STL coordinates can then pinch a four-face edge or
    // collapse a triangle. Canonicalize those coplanar relations in the kernel
    // before simplifying at the existing 0.0002 mm surface error bound.
    const tolerance=.0002,translated=own(module.translate(scale(box.min,-1))),canonical=own(translated.asOriginal()),toleranced=own(canonical.setTolerance(tolerance)),shifted=own(toleranced.simplify(tolerance)),bytes=toBinarySTL(shifted.getMesh()),verified=inspectSTL(bytes),v=module.volume(),meshVolume=shifted.volume();
    if(Math.abs(meshVolume-v)>Math.max(.01,tolerance*module.surfaceArea()))throw Error('STL surface simplification exceeded its volume-change bound: '+v+' -> '+meshVolume+'; area '+module.surfaceArea()+'; actual tolerance '+module.tolerance());
    if(Math.abs(verified.volumeMm3-meshVolume)>Math.max(.01,1e-5*meshVolume))throw Error('STL serialization changed the simplified solid volume.');sum+=v;serializedSum+=verified.volumeMm3;
    files.push({name:`wing_module_${i+1}.stl`,bytes});modules.push({module:i+1,spanBoundsMm:[bounds[i],bounds[i+1]],sizeMm:size,translationMm:scale(box.min,-1),referenceVolumeMm3:v,meshToleranceMm:tolerance,coplanarBooleanFacesCanonicalized:true,serializationKernelToleranceMm:shifted.tolerance(),...verified});

   }
   if(Math.abs(sum-volume)>Math.max(.01,5e-4*volume))throw Error('Module cutting failed volume conservation.');
   if(serializedSum*density/1000>maxMass)throw Error('Serialized STL exceeds the printed-mass limit.');
   return {files,report:{format:'mie446-browser-print',version:VERSION,fullWing:input.fullWing===true,mirrorPlane:'y = 0 (root)',semiWingVolumeMm3:semiWingVolume,maximumPrintedMassG:maxMass,kernel:'Manifold 3.5.4',units:'mm',geometry:g,sparManufacturing,fitRecord:input.fitRecord||null,printedMassG:serializedSum*density/1000,closedTip:G.closedTip(g),cavityEndMm:cavityEnd,referenceSolidVolumeMm3:volume,plasticVolumeMm3:serializedSum,densityGcm3:density,printerEnvelopeMm:ENVELOPE,modules,elapsedMs:Date.now()-start,limitations:[...(G.closedTip(g)?['Exact zero-chord tip with solid outboard region.','Nominal section stress is a separate approximation; no exact-apex stress, deformation or 3-D solid-FE validation is implied.','The pointed terminal region tapers below the nominal wall thickness; inspect its actual slicer layers.']:[]),...(sparManufacturing.some(s=>s.embeddedSolidTipStartMm!==null)?['Automatic cap taper preserves fixed cap/web thicknesses. Any continuation inside the filled same-material tip is embedded in that existing plastic, with no extra member volume.']:[]),'Undeformed mesh CAD, independent of result/display mesh.','Mesh loft and Boolean approximation; not the exact CadQuery B-rep.','STL contains no units; import in millimetres.','Printer fit excludes supports, brim and arbitrary-angle packing. Inspect every slicer layer.','No strength, buckling, bond or flight certification.','Symmetry copies geometry only; source structural results describe the original root-clamped semi-wing. A full-aircraft support/load model is not solved.','For full-wing output, one module joins both halves; multiple modules are counted per semi-wing and require assembly, including the root joint.']}};
  }finally{for(const o of [...owned].reverse())try{o.delete();}catch{}}
 }
 return{VERSION,build,inspectSTL,toBinarySTL};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingPrintMesh;
