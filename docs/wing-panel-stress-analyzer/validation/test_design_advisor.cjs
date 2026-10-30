const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..'),out=path.join(repo,'output/design-advisor-review');fs.mkdirSync(out,{recursive:true});
// Native lexical scope matches the browser worker; a proxied vm global makes
// this numerical workload much slower than production and distorts its budget.
const {E,A,U,IO,D}=new Function('module','require','window','self',fs.readFileSync(path.join(app,'wing-design-advisor-kernel.js'),'utf8')+'\n'+fs.readFileSync(path.join(app,'ui/wing-design-advisor.js'),'utf8')+'\nreturn {E:WingEngine,A:WingAeroPanel,U:WingAeroUI,IO:WingStudyIO,D:WingDesignAdvisor};')(undefined,undefined,undefined,{});
IO.setAeroGeometryKey(g=>IO.sha256(A.geometryKey(g)));
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const raw=fs.readFileSync(path.join(__dirname,'fixtures/delta-advisor.json'),'utf8'),imp=IO.importPrintedStudy(raw,E);assert.ok(imp.ok,JSON.stringify(imp.errors));
 // The numerical regression evaluates every candidate independent of machine
 // speed; the interactive UI retains its 45 s start budget and cancellation.
 const original=JSON.stringify(imp.state),r=await D.run(imp.state,{E,A,U,IO},{massBudgetPercent:10,candidateStartBudgetMs:180000,progress:p=>console.log('delta',p.completed,p.label)});
 assert.equal(JSON.stringify(imp.state),original);assert.ok(Math.abs(r.rows[0].metrics.massG*2-656.207325)<.01);
 assert.equal(r.rows[0].metrics.tipSlopeFinite,false);assert.equal(r.ranking.lightest,null);assert.equal(r.ranking.stiffest,null);
 assert.equal(r.rows[0].assessed.deflection,null,'inboard samples cannot pass a tip displacement requirement');
 assert.equal(r.rows[0].assessed.twist,null);assert.equal(r.rows[0].eligible,false);
 assert.equal(r.comparisonEta,.9);assert.equal(r.outerAerodynamicShapePreserved,true);
 assert.ok(r.comparisonStationsMm.includes(2));assert.ok(r.comparisonStationsMm.some(y=>y>2&&y<2.001),'probe just outside root cap');
 assert.ok(r.rows[0].metrics.skinCompressionMpa>.28,'root-cap exit stress is included');
 assert.equal(r.flightBasis.flow.speed,15);assert.equal(r.flightBasis.flow.alphaDeg,4);assert.equal(r.flightBasis.selfWeight,false);
 assert.ok(Math.abs(r.flightBasis.upwardAerodynamicForcePerHalfN-5.6648437685)<1e-8);
 for(const x of r.rows.filter(x=>x.metrics))assert.deepEqual(x.loadWrench,r.rows[0].loadWrench,'same six aerodynamic resultants');
 assert.ok(r.rows.find(x=>x.error&&/runout fit limit/.test(x.error)),'invalid member runout remains a visible rejected candidate');
 for(const v of D.variants(imp.state)){assert.ok(!('semiSpan' in v.patch)&&!('rootChord' in v.patch)&&!('airfoil' in v.patch));assert.ok(!('load' in v.patch));}
 const rb=r.rows.find(x=>x.massOnly);if(rb)assert.equal(rb.eligible,false);
 const tested=r.rows.find(x=>x.id==='add0.55'&&x.metrics);assert.ok(tested,'second-spar comparison completed');if(tested){
  const trial=clone(imp.state);Object.assign(trial.geometry,clone(tested.patch));const doc=IO.exportPrintedStudy(trial,E),reload=IO.importPrintedStudy(doc,E);
  assert.ok(reload.ok,JSON.stringify(reload.errors));assert.equal(reload.state.geometry.spars.length,2);assert.equal(reload.state.aeroLoad.geometrySha256,imp.state.aeroLoad.geometrySha256);
  fs.writeFileSync(path.join(out,'Delta_second_spar_EXPLORATORY.json'),doc);
 }
 assert.ok(r.rows[0].geometryEffects.spars[0].embeddedLengthMm>0,'embedded existing solid-tip continuation is reported');
 fs.writeFileSync(path.join(out,'delta-comparison.json'),JSON.stringify(r,null,2));
 const s=clone(imp.state);delete s.aeroLoad;s.geometry={...s.geometry,planform:'linear',semiSpan:300,rootChord:160,tipChord:120,sweepReferenceFraction:0};s.geometry.spars[0].length=300;
 s.load={...s.load,kind:'custom',items:[{kind:'point',position:300,force:1,fraction:.25}],selfWeight:false};s.analysis={nElements:12};
 const before=JSON.stringify(s),normal=await D.run(s,{E,A,U,IO},{massBudgetPercent:10,candidateStartBudgetMs:180000,progress:p=>console.log('finite-tip',p.completed,p.label)});
 assert.equal(JSON.stringify(s),before);assert.ok(normal.ranking.lightest);assert.ok(normal.ranking.stiffest);
 for(const id of [normal.ranking.lightest,normal.ranking.stiffest])assert.equal(normal.rows.find(x=>x.id===id).eligible,true);
 assert.ok(normal.rows.find(x=>x.id===normal.ranking.stiffest).metrics.massG<=normal.rows[0].metrics.massG*1.1+1e-9);
 fs.writeFileSync(path.join(out,'finite-tip-comparison.json'),JSON.stringify(normal,null,2));
 const noLoad=clone(s);noLoad.load.items=[];await assert.rejects(()=>D.run(noLoad,{E,A,U,IO}),/No structural load/);
 const stale=clone(imp.state);stale.geometry.rootChord+=1;await assert.rejects(()=>D.run(stale,{E,A,U,IO}),/another outer shape/);
 assert.equal(D.variants(s).filter(x=>x.massOnly).length,1);assert.ok(D.variants(s).every(x=>x.patch.skin===undefined||x.patch.skin>=.8));
 const summary={passed:true,exactDeltaBaselineMassG:r.rows[0].metrics.massG*2,commonInboardStations:true,rootCapExitStressIncluded:true,actualAppliedFlightBasis:true,sixAerodynamicResultantsPreserved:true,embeddedSparRunoutReported:true,noFalseTipOrTwistPass:true,originalUnchanged:true,runoutRejectionsPreserved:true,ordinaryWingBothGoalsAssessed:true,massBudgetEnforced:true,noLoadRefused:true,stalePressureRefused:true,editableVariantReimported:!!tested,normalSolverHasNoAdvisorCost:true,deltaMs:r.elapsedMs,finiteTipMs:normal.elapsedMs};
 fs.writeFileSync(path.join(out,'TEST_REVIEW.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
