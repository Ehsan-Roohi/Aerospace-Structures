const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const ctx=vm.createContext({module:{exports:{}},window:{},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);const A=ctx.module.exports;
vm.runInContext(fs.readFileSync(path.join(app,'ui/wx-aero-results.js'),'utf8'),ctx);const V=ctx.window.WingAeroStructResults;
const flow={speed:10,density:1.225,alphaDeg:4};
const geometry={naca:'2412',semiSpan:900,rootChord:160,tipChord:100,dihedralDeg:10};
const seq=A.runSequence(geometry,flow,'fine'),b=seq.base,f=V.surfaceField3D(b,geometry);
const max=f.panels.reduce((a,p)=>p.cp>a.cp?p:a),min=f.panels.reduce((a,p)=>p.cp<a.cp?p:a);
assert.ok(max.xc<.1,'Largest positive Cp should occur near the leading edge in this reference case');
assert.equal(max.side,'lower');assert.ok(max.cp<=1+1e-10);
const j=b.strips.reduce((a,s,i)=>Math.abs(s.yMid/900-.5)<Math.abs(b.strips[a].yMid/900-.5)?i:a,0);
const sec=b.chordwise[j],sort=s=>s.slice().sort((a,b)=>a[0]-b[0]);
const upper=sort(sec.upper),lower=sort(sec.lower);
const samples={eta:sec.y_mm/900,upper_LE:upper[0],lower_LE:lower[0],upper_TE:upper.at(-1),lower_TE:lower.at(-1),upper_min:upper.reduce((a,p)=>p[1]<a[1]?p:a)};
assert.ok(samples.upper_min[0]<.2,'Upper surface suction peak should occur near LE away from the tip');
assert.ok(Math.abs(samples.upper_TE[1]-samples.lower_TE[1])<.12,'TE pressures should approach each other; they need not be zero');
const symG={naca:'0012',semiSpan:600,rootChord:160,tipChord:160};
const model=A.prepare(symG,{chordPanels:24,spanPanels:8}),r=A.evaluate(model,{...flow,alphaDeg:0});
let symmetryError=0;
for(let j=0;j<r.strips.length;j++){const s=A.stripChordwiseCp(model,r,j);for(let i=0;i<s.upper.length;i++)symmetryError=Math.max(symmetryError,Math.abs(s.upper[i][1]-s.lower[i][1]));}
assert.ok(symmetryError<1e-8);assert.ok(Math.abs(r.coefficients.CL)<1e-8);
const metric=V.spanQuantities(b);for(let i=0;i<metric.length;i++){assert.equal(metric[i].cl,b.strips[i].cl);assert.equal(metric[i].te,b.strips[i].trailingEdgeDeltaCp);assert.ok(Math.abs(metric[i].clKJ-2*metric[i].gamma/(flow.speed*b.strips[i].chord*1e-3))<1e-10);}
const mesh=V.pressureMeshCheck(seq);
const meshSummary={rows:mesh.rows.map(m=>({chordPanels:m.chordPanels,spanPanels:m.spanPanels,panels:m.panels,minCp:m.diagnostics.minCp,maxCp:m.diagnostics.maxCp,CL:m.coefficients.CL})),comparisons:mesh.comparisons,sensitive:mesh.sensitive,certified:false};
const report={case:{geometry,flow,sequence:'fine'},max_positive_Cp:{value:max.cp,surface:max.side,x_over_c:max.xc,y_mm:max.y},min_Cp:{value:min.cp,surface:min.side,x_over_c:min.xc,y_mm:min.y},midspan:samples,zero_alpha_symmetric_airfoil:{CL:r.coefficients.CL,upper_lower_Cp_max_difference:symmetryError},mesh_extrema:meshSummary,scope:'Internal physics and rendering consistency checks; this is not a quantitative validation against another finite-wing solver. Local tip Cp remains mesh-sensitive.',sources:['https://www.nasa.gov/reference/openvsp-vspaero-basics/','https://flow5.tech/docs/flow5_doc/Post-processing/Cp3d.html']};
fs.writeFileSync(path.join(app,'validation/PRESSURE_PHYSICS_REVIEW.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({max_positive_Cp:report.max_positive_Cp,midspan:samples,symmetry:report.zero_alpha_symmetric_airfoil,tip_peak_mesh_sensitive:report.mesh_extrema.sensitive},null,2));
