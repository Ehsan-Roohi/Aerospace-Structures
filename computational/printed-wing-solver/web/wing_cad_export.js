/* Browser-only millimetre CAD exchange. STEP is a faceted solid B-rep built
 * from validated physical print triangles; it does not reconstruct features.
 * Entity mapping follows STEP AP203 FACETED_BREP / POLY_LOOP / CLOSED_SHELL.
 */
const WingCADExport=(()=>{
  'use strict';
  const E=typeof WingEngine!=='undefined'?WingEngine:typeof require==='function'?require('./engine.js'):null;
  const G=typeof WingGeometry!=='undefined'?WingGeometry:typeof require==='function'?require('./wing_geometry.js'):null;
  const P=typeof WingPrintMesh!=='undefined'?WingPrintMesh:typeof require==='function'?require('./wing_print_mesh.js'):null;
  const enc=s=>new TextEncoder().encode(s),num=v=>{if(!Number.isFinite(v))throw Error('CAD coordinates must be finite.');const s=Number(v.toPrecision(15)).toString().replace('e','E');return /[.E]/.test(s)?s:s+'.';},safe=s=>String(s).replace(/[^A-Za-z0-9 _.-]/g,'_');
  const limitations=['Faceted CAD exchange preserves the physical print mesh; surfaces are planar triangles, not smooth or parametric features.','No automatic SolidWorks feature reconstruction, manufacturing allowance, kerf compensation or structural certification.'];
  function buildSTEP(input){
    if(!P||!input||!Array.isArray(input.files)||!input.files.length||!input.report||input.report.units!=='mm'||input.report.modules?.length!==input.files.length)throw Error('STEP export requires the complete validated millimetre physical print build, including its module report.');
    const reports=[],files=input.files.map((file,k)=>{
      const source=ArrayBuffer.isView(file.bytes)?file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength):file.bytes,checked=P.inspectSTL(source),module=input.report.modules[k],translation=module.translationMm;
      if(!Array.isArray(translation)||translation.length!==3||!translation.every(Number.isFinite))throw Error('Physical module placement is missing.');
      if(module.volumeMm3&&Math.abs(checked.volumeMm3-module.volumeMm3)>Math.max(.01,1e-5*checked.volumeMm3))throw Error('STL differs from its validated module report.');
      const v=new DataView(source),count=v.getUint32(80,true),points=[],triangles=[],ids=new Map();
      for(let i=0;i<count;i++){const face=[];for(let j=0;j<3;j++){const p=[0,1,2].map(d=>v.getFloat32(84+50*i+12+12*j+4*d,true)),key=p.join(',');if(!ids.has(key)){ids.set(key,points.length);points.push(p.map((x,d)=>x-translation[d]));}face.push(ids.get(key));}triangles.push(face);}
      const lines=[];let next=1;const add=s=>{const id=next++;lines.push(`#${id}=${s};`);return id;},ref=i=>'#'+i;
      const app=add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')");
      add(`APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,#${app})`);
      const pc=add(`PRODUCT_CONTEXT('',#${app},'mechanical')`),product=add(`PRODUCT('wing_module_${k+1}','Wing module ${k+1}','Faceted physical CAD in millimetres',(#${pc}))`),formation=add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#${product},.NOT_KNOWN.)`),dc=add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`),definition=add(`PRODUCT_DEFINITION('design','',#${formation},#${dc})`),shape=add(`PRODUCT_DEFINITION_SHAPE('','',#${definition})`);
      const mm=add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'),rad=add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'),sterad=add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())'),unc=add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#${mm},'distance_accuracy_value','')`),context=add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sterad})) REPRESENTATION_CONTEXT('',''))`);
      const pointIDs=points.map(p=>add(`CARTESIAN_POINT('',(${p.map(num).join(',')}))`)),faces=triangles.map(t=>{
        const a=points[t[0]],b=points[t[1]],c=points[t[2]],u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross),edgeLength=Math.hypot(...u);
        if(!(length>0&&edgeLength>0))throw Error('STEP cannot contain degenerate facets.');
        const loop=add(`POLY_LOOP('',(${t.map(i=>ref(pointIDs[i])).join(',')}))`),bound=add(`FACE_OUTER_BOUND('',#${loop},.T.)`),normal=add(`DIRECTION('',(${cross.map(x=>num(x/length)).join(',')}))`),axis=add(`DIRECTION('',(${u.map(x=>num(x/edgeLength)).join(',')}))`),placement=add(`AXIS2_PLACEMENT_3D('',#${pointIDs[t[0]]},#${normal},#${axis})`),plane=add(`PLANE('',#${placement})`);
        return add(`FACE_SURFACE('',(#${bound}),#${plane},.T.)`);
      });
      const shell=add(`CLOSED_SHELL('',(${faces.map(ref).join(',')}))`),solid=add(`FACETED_BREP('Wing module ${k+1}',#${shell})`),representation=add(`FACETED_BREP_SHAPE_REPRESENTATION('Wing module ${k+1}',(#${solid}),#${context})`);add(`SHAPE_DEFINITION_REPRESENTATION(#${shape},#${representation})`);
      const text=`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Faceted physical wing solid; millimetres; original aircraft placement'),'2;1');\nFILE_NAME('wing_module_${k+1}.step','${new Date().toISOString()}',('MIE 446'),('UMass'),'Wing Lab faceted CAD exporter','Wing Lab','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
      reports.push({module:k+1,triangles:count,vertices:points.length,volumeMm3:checked.volumeMm3,placement:'Original aircraft coordinates restored from print translation',byteLength:enc(text).byteLength});
      return {name:`wing_module_${k+1}_faceted.step`,bytes:enc(text),text,mime:'application/step'};
    });
    return {files,report:{format:'mie446-faceted-step',schema:'AP203 CONFIG_CONTROL_DESIGN',units:'mm',fullWing:!!input.report.fullWing,representation:'FACETED_BREP: closed planar polygon faces',modules:reports,limitations:[...limitations]}};
  }
  function buildDXF(input={}){
    if(!E||!G)throw Error('Load wing geometry and engine before CAD export.');
    const g=E.makeGeometry(input.geometry||{}),full=!!input.fullWing,files=[],sections=[];
    const entity=(layer,points)=>['0','LWPOLYLINE','100','AcDbEntity','8',layer,'100','AcDbPolyline','90',String(points.length),'70','1',...points.flatMap(p=>['10',num(p[0]),'20',num(p[1])])];
    function document(name,entities,note){const data=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','9','$MEASUREMENT','70','1','9','$LUNITS','70','2','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','3',...['PLANFORM_REFERENCE','RIB_OUTER','ROD_HOLE'].flatMap((layer,i)=>['0','LAYER','2',layer,'70','0','62',String(i+1),'6','CONTINUOUS']),'0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES',...entities,'0','ENDSEC','0','EOF'];const text='999\n'+safe(note)+'\n'+data.join('\n')+'\n';files.push({name,bytes:enc(text),text,mime:'application/dxf'});}
    // Cosine span sampling resolves the elliptic apex without a chord floor.
    const ys=Array.from({length:257},(_,i)=>g.semiSpan*(1-Math.cos(Math.PI*i/256))/2),lead=ys.map(y=>{const s=G.stationAt(g,y);return[s.xLE,y];}),trail=ys.map(y=>{const s=G.stationAt(g,y);return[s.xLE+s.chord,y];});
    const semi=[...lead,...trail.reverse()].filter((p,i,a)=>i===0||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>1e-10);
    document('wing_planform_reference_mm.dxf',entity('PLANFORM_REFERENCE',semi).concat(full?entity('PLANFORM_REFERENCE',semi.map(([x,y])=>[x,-y]).reverse()):[]),'2D planform reference in aircraft X-Y, millimetres; not a 3D solid or cutting toolpath');
    const stations=E.ribStations(g);
    stations.forEach((y,i)=>{
      const transform=p=>{const q=G.transformPoint(g,y,p);return[q[0],q[2]];},outer=E.outerContour(g,y,241).map(transform),entities=entity('RIB_OUTER',outer),rodCenters=E.rodCentres(g,y),r=E.holeRadius(g);
      // A straight inclined cylindrical channel cuts an aircraft-y rib as an
      // ellipse: major radius r/|axis_y| along its projected channel axis.
      if(rodCenters.length){for(let j=0;j<rodCenters.length;j++){
        const a=G.transformPoint(g,0,E.rodCentres(g,0)[j]),b=G.transformPoint(g,g.semiSpan,E.rodCentres(g,g.semiSpan)[j]),d=b.map((x,k)=>x-a[k]),length=Math.hypot(...d),transverse=Math.hypot(d[0],d[2]),ratio=Math.abs(d[1])/length,p=transform(rodCenters[j]);
        if(!(ratio>1e-8))throw Error('Rod channel does not cross an aircraft-y rib plane.');
        for(let k=1;k<32;k++){const q=G.transformPoint(g,g.semiSpan*k/32,E.rodCentres(g,g.semiSpan*k/32)[j]);if(Math.hypot(...q.map((x,h)=>x-a[h]-d[h]*k/32))>.01)throw Error('A curved rod channel cannot be exported as a straight physical rod hole.');}
        const common=['0',transverse<1e-9?'CIRCLE':'ELLIPSE','100','AcDbEntity','8','ROD_HOLE','100',transverse<1e-9?'AcDbCircle':'AcDbEllipse','10',num(p[0]),'20',num(p[1]),'30','0.'];
        entities.push(...common,...(transverse<1e-9?['40',num(r)]:['11',num(r*d[0]/(ratio*transverse)),'21',num(r*d[2]/(ratio*transverse)),'31','0.','40',num(ratio),'41','0.','42',num(2*Math.PI)]));
      }}
      document(`wing_rib_${i+1}_y_${y.toFixed(3)}_mm.dxf`,entities,`2D aircraft-y rib section at y=${y.toFixed(6)} mm; DXF X-Y corresponds to aircraft X-Z; center profile, finite rib taper not unfolded; no kerf allowance`);
      sections.push({rib:i+1,yMm:y,thicknessMm:g.ribThickness,holes:rodCenters.length,coordinatePlane:'DXF X-Y = aircraft X-Z',symmetricCopy:full?'Same profile at negative y; no duplicate cutting profile generated':null});
    });
    return {files,report:{format:'mie446-2d-dxf',version:'AutoCAD 2000 ASCII',units:'mm',fullWing:full,planform:'Reference outline sampled at 257 span stations per half',ribSections:sections,limitations:['DXF contains 2D reference outlines and individual center-plane rib profiles, not a 3D wing solid.','Rib profiles retain actual aircraft X-Z placement; finite rib thickness/taper and tool compensation are not unfolded into manufacturing patterns.',...limitations]}};
  }
  return {buildSTEP,buildDXF};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=WingCADExport;
