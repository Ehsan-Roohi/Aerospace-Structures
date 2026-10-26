import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('./engine.js'),S=require('./wing_spars.js');
const spec={fraction:.45,length:450,topWidth:8,topThickness:.8,bottomWidth:8,bottomThickness:.8,webThickness:.6,material:S.MAT};
for(const [planform,fixedKnown,autoKnown]of [['delta',198.9414111266567,273.94240072874675],['elliptic',372.79302020181126,414.130052413873]]){
 const base=E.makeGeometry({planform,naca:'2412',semiSpan:450,rootChord:160,tipChord:0,skin:1.2,modules:1,rodFractions:[],spars:[]}),draft={...spec,widthMode:'auto'},before=JSON.stringify(draft),fit=E.closedTipSparFit(base,draft);
 assert.ok(Math.abs(E.closedTipSparLimit(base,spec)-fixedKnown)<1e-10,'absent widthMode keeps the fixed-width limit');
 assert.equal(E.closedTipSparLimit(base,{...spec,widthMode:'fixed'}),E.closedTipSparLimit(base,spec));
 assert.ok(Math.abs(fit.maximumLengthMm-autoKnown)<1e-9);assert.ok(fit.maximumLengthMm>fixedKnown&&fit.maximumLengthMm<base.semiSpan);
 assert.equal(fit.governingLimit,'web-thin-wall');assert.equal(fit.widthMode,'auto');assert.equal(fit.embeddedContinuation,true);assert.equal(fit.sectionAtMaximum.topWidthMm,4);assert.equal(fit.sectionAtMaximum.bottomWidthMm,4);
 assert.ok(Math.abs(fit.sectionAtMaximum.minimumWebHeightMm-3)<1e-4);assert.equal(JSON.stringify(draft),before,'root dimensions remain unmodified');
 const auto=E.makeGeometry({...base,spars:[{...draft,length:fit.maximumLengthMm}]}),fixed=E.makeGeometry({...base,spars:[{...spec,length:fixedKnown}]}),a0=E.sparParts(auto,0)[0],f0=E.sparParts(fixed,0)[0];
 assert.deepEqual(a0.polygons,f0.polygons,'root physical I-section is unchanged');assert.equal(auto.spars[0].topWidth,8);assert.equal(auto.spars[0].topThickness,.8);assert.equal(auto.spars[0].webThickness,.6);
 let previous=8;for(let i=0;i<=250;i++){
  const y=fit.maximumLengthMm*i/250,p=E.sparParts(auto,y)[0],c=E.chordAt(auto,y),expected=Math.max(4,8*c/160),actual=Math.max(...p.top.map(v=>v[0]))-Math.min(...p.top.map(v=>v[0]));
  assert.ok(Math.abs(actual-expected)<1e-10,'actual cap polygon has the local auto width');assert.ok(actual<=previous+1e-10&&actual>=4-1e-10);previous=actual;
  assert.ok(Math.abs(p.widths.topWidth-expected)<1e-12);assert.equal(p.embeddedInSolidTip,y>=fit.solidTipStartMm);assert.equal(p.s.topWidth,8,'part retains original specification');
 }
 const kinks=E.sparWidthBreaks(auto,auto.spars[0]);assert.equal(kinks.length,1);assert.ok(Math.abs(E.chordAt(auto,kinks[0])-80)<1e-10);assert.deepEqual(kinks,fit.widthFloorStationsMm);
 assert.equal(E.sparParts(auto,fit.maximumLengthMm+.01).length,0,'membership ends at the actual finite runout');
 assert.throws(()=>E.makeGeometry({...base,spars:[draft]}),/finite runout fit limit/);assert.throws(()=>E.makeGeometry({...base,spars:[{...draft,widthMode:'unbounded'}]}),/widthMode/);
 const atFuture=fit.maximumLengthMm+.01,extended={...auto,spars:[{...draft,length:450}]};assert.throws(()=>E.sparParts(extended,atFuture),/web height|web thickness/,'extension past admission remains rejected');
 console.log('PASS physical auto-width polygons, width-floor stations, finite endpoint, unchanged root and legacy fixed behavior:',planform);
}
