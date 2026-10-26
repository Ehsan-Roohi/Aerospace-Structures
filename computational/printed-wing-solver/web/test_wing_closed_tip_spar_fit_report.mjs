import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),S=require('./wing_spars.js');
const spar=fraction=>({fraction,length:450,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:S.MAT});
for(const [planform,known]of [['delta',198.9414111266567],['elliptic',372.79302020181126]]){
 const g=E.makeGeometry({planform,naca:'2412',semiSpan:450,rootChord:160,tipChord:0,skin:1.2,modules:1,rodFractions:[],spars:[]}),s=spar(.45),before=JSON.stringify([g,s]),report=E.closedTipSparFit(g,s);
 assert.equal(report.maximumLengthMm,E.closedTipSparLimit(g,s),'numeric API remains compatible');
 assert.ok(Math.abs(report.maximumLengthMm-known)<1e-10,'published fit limit is unchanged');
 assert.equal(report.governingLimit,'solid-tip-closure');assert.equal(report.category,'closure-policy');
 assert.ok(Math.abs(report.solidTipStartMm-(E.cavityTipLimit(g)-g.cap))<1e-10);
 assert.ok(report.sectionAtMaximum.minimumWebHeightMm>report.sectionAtMaximum.requiredWebHeightMm+2,'local web is well inside h/5 admission at the closure-limited endpoint');
 assert.ok(report.sectionAtMaximum.capVerticalClearanceMm>0&&report.sectionAtMaximum.capLeftClearanceMm>0&&report.sectionAtMaximum.capRightClearanceMm>0,'local fixed caps still fit');
 assert.match(report.reason,/not a claim/);assert.equal(report.dimensionsChanged,false);assert.equal(JSON.stringify([g,s]),before);
}
const base={planform:'delta',naca:'0020',semiSpan:130,rootChord:160,tipChord:0,skin:.8,te:.8,cavityStart:.12,cavityEnd:.8,modules:1,rodFractions:[],spars:[]},g=E.makeGeometry(base);
const thin=E.closedTipSparFit(g,{...spar(.3),length:130});assert.equal(thin.governingLimit,'web-thin-wall');assert.equal(thin.category,'model-admission');assert.match(thin.reason,/not proof of physical impossibility/);
assert.ok(Math.abs(thin.sectionAtMaximum.minimumWebHeightMm-3)<1e-4);assert.ok(thin.firstRejectedStationMm>thin.maximumLengthMm);
const width=E.closedTipSparFit(g,{...spar(.2),length:130});assert.equal(width.governingLimit,'cap-cavity-width');assert.equal(width.category,'geometry');assert.ok(width.sectionAtMaximum.capLeftClearanceMm<1e-4);
const existing={...spar(.3),length:65},two=E.makeGeometry({...base,spars:[existing]}),overlap=E.closedTipSparFit(two,{...spar(.37),length:130});assert.equal(overlap.governingLimit,'spar-overlap');assert.equal(overlap.category,'geometry');
const regular=E.makeGeometry({rodFractions:[],spars:[]});assert.equal(E.closedTipSparLimit(regular,spar(.45)),regular.semiSpan);assert.equal(E.closedTipSparFit(regular,spar(.45)).governingLimit,'span');
assert.throws(()=>E.closedTipSparFit(g,{...spar(.2),topWidth:120}),/root cavity/);
console.log('PASS exact-tip spar fit report: unchanged numeric API; closure policy, local cap clearance, thin-wall admission, overlap and regular-span reasons.');
