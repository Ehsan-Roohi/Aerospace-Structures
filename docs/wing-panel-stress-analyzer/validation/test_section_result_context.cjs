// Physical meaning of section selection: changing chord alone is not a new
// isolated inviscid 2D boundary-value problem. No expected Cp is fitted.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),ctx=vm.createContext({window:{},module:{exports:{}},console,performance});
vm.runInContext(fs.readFileSync(path.join(app,'wing-aero/aero_bundle.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(app,'ui/wx-aero-results.js'),'utf8'),ctx);
const P=ctx.window.WingAirfoilPanel2D,R=ctx.window.WingAeroStructResults;
const g={naca:'2412',planform:'linear',semiSpan:900,rootChord:260,tipChord:100,skin:1.2,ribThickness:1.6,modules:1,twistEnabled:false};
const a=P.section(g,.05,80),b=P.section({...g,rodFractions:[.25,.65],customInteriorRibs:[100,400,700],spars:[{fraction:.45}]},.85,80);
assert.notEqual(a.chord_mm,b.chord_mm);assert.equal(JSON.stringify(a.points),JSON.stringify(b.points));
const ra=P.solveCoordinates(a.points,4),rb=P.solveCoordinates(b.points,4),zero=P.solveCoordinates(a.points,0);
assert.equal(JSON.stringify(ra.panels.map(p=>p.cp)),JSON.stringify(rb.panels.map(p=>p.cp)));
assert.equal(ra.cl,rb.cl);assert.ok(Math.abs(ra.cl-zero.cl)>.3,'changing entered angle changes the independent solve');
const mixed={...g,stations:[{eta:0,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:0},{eta:1,airfoil:{kind:'naca4',code:'0012'},incidenceDeg:0}]};
assert.notEqual(JSON.stringify(P.section(mixed,0,80).points),JSON.stringify(P.section(mixed,.85,80).points),'different local profile is a different 2D problem');
const strips=[{y_mm:20},{y_mm:200},{y_mm:600}];
assert.equal(R.nearestSectionIndex(strips,180),1);assert.equal(R.nearestSectionIndex(strips,890),2);assert.equal(R.nearestSectionIndex([],100),-1);assert.equal(R.nearestSectionIndex(strips,NaN),-1);
const review=JSON.parse(fs.readFileSync(path.join(app,'validation/2026-10-29/TE_REPAIR_REVIEW.json'),'utf8'));
const rows=review.rows.filter(r=>r.alphaDeg===4&&r.airfoil==='joukowski (cusp)').sort((a,b)=>a.panels-b.panels);
assert.deepEqual(rows.map(r=>r.panels),[80,160,320]);assert.ok(rows.every(r=>r.last3_panels_max_abs_Cp_error>0));assert.ok(rows[2].last3_panels_max_abs_Cp_error<rows[1].last3_panels_max_abs_Cp_error&&rows[1].last3_panels_max_abs_Cp_error<rows[0].last3_panels_max_abs_Cp_error);
console.log(JSON.stringify({sameNormalizedProfileAndAngle_identical2DCp:true,differentChordMm:[a.chord_mm,b.chord_mm],cl2D:ra.cl,ribsAndRodsDoNotEnterIsolatedFlow:true,enteredAngleChangesSolution:true,localProfileVariationChangesInput:true,threeDSelectsActualNearestStrip:true,retainedCuspError:rows.map(r=>({panels:r.panels,last3MaxAbsCpError:r.last3_panels_max_abs_Cp_error}))},null,2));
