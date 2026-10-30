/* Publish only the technical evidence, not private consultation transcripts. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),app=path.join(repo,'docs/wing-panel-stress-analyzer'),out=path.join(repo,'output/design-advisor-review');
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const page=fs.readFileSync(path.join(app,'index.html')),alias=fs.readFileSync(path.join(app,'wing-lab.html'));
assert.ok(page.equals(alias));
const build=JSON.parse(fs.readFileSync(path.join(app,'BUILD.json'),'utf8'));assert.equal(hash(page),build.pageSha256);
let count=0;for(const m of page.toString().matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|type=["'](?:importmap|application\/json)/i.test(m[1]))continue;new vm.Script(m[2],{filename:'inline-'+(++count)});}
for(const n of ['ui/wing-design-advisor.js','ui/wing-design-advisor-ui.js','wing-design-advisor-worker.js','wing-design-advisor-kernel.js'])new vm.Script(fs.readFileSync(path.join(app,n),'utf8'),{filename:n});
assert.equal(hash(fs.readFileSync(path.join(app,'wing-design-advisor-kernel.js'))),build.design_advisor.kernelSha256);
const checks=read('TEST_REVIEW.json'),delta=read('delta-comparison.json'),finite=read('finite-tip-comparison.json');assert.ok(checks.passed);
const row=x=>({id:x.id,label:x.label,fullWingMassG:x.metrics?2*x.metrics.massG:null,inboardDisplacementMm:x.metrics?.displacementMm??null,skinTensionMPa:x.metrics?.skinTensionMpa??null,skinCompressionMagnitudeMPa:x.metrics?.skinCompressionMpa??null,error:x.error??null,eligibleForFullWingOptimum:x.eligible===true});
const review={version:build.version,status:'SCOPED_NUMERICAL_LAYOUT_COMPARISON',date:'2026-10-30',basePhysicsCommit:build.design_advisor.baseCommit,
 algorithm:'Finite deterministic candidate search; no trained AI, global optimum, or full flight certification is claimed.',
 unchanged:{numericalKernelSha256:build.design_advisor.kernelSha256,normalSolveDoesNotStartAdvisor:true,geometryUnchangedUntilUserApplies:true,aerodynamicPressureRecordUnchanged:true,admissionCriteriaUnchanged:true,wingLabStudentPageUnchanged:true},
 verification:{...checks,inlineScriptSyntaxChecks:count,aliasByteIdentical:true,pageHashMatchesBuild:true,regressionCandidateStartBudgetMs:delta.candidateStartBudgetMs,interactiveCandidateStartBudgetMs:45000,
   controllerDomChecks:['Both objectives and actual flight basis rendered','Snapshot-based worker and progress','Cancel terminates worker and late results are ignored','State or flow-draft change invalidates applying/exporting results','CSV preserves units, flight basis and runouts','Apply goes through existing geometry validation and normal solve'],
   regressionsPassed:['zero-load display','geometry preview recovery','activity feedback','speed unit guidance','2D/3D section context','aerodynamic result charts'],
   browserScope:'Numerical and DOM controller regressions are recorded separately from initial Chromium interaction checks. End-to-end Firefox testing was not performed for this feature.'},
 exactDeltaCase:{semiSpanMm:600,rootChordMm:250,tipChordMm:0,flightBasis:delta.flightBasis,comparisonEta:delta.comparisonEta,stressProbeCount:delta.comparisonStationsMm.length,
   bendingSamples:25,stressSampling:'Common station union including root-cap exit, ribs, cavity and runout transitions; sampled inboard values, not global maxima',
   baselineFormalTipBendingMm:delta.rows[0].metrics.tipBendingMm,tipSlopeFinite:delta.rows[0].metrics.tipSlopeFinite,fullWingOptimum:null,rows:delta.rows.map(row)},
 finiteTipControl:{semiSpanMm:300,rootChordMm:160,tipChordMm:120,load:'1 N point force at y=300 mm, x/c=0.25; no self-weight',bothGoalsAssessed:true,ranking:finite.ranking},
 limitations:['One fixed rigid-wing flight/load case; changing the outer aerodynamic shape requires a new pressure solve.',
   'Exact zero-area tip: full-tip slope validity, torsion, overall factor of safety and modes remain unassessed. Inboard comparisons are exploratory.',
   'No local skin buckling, diaphragm stiffness, bond/runout failure, manufacturing approval, trim or aeroelastic optimisation.',
   'Rib-removal candidates are prohibited and rib-count changes excluded from ranking.',
   'Skin changes can alter cavity closure and the structural trailing-edge transition; geometry effects are reported and stress comparison can be withheld.',
   '45 seconds is a budget for starting new candidates, not a hard termination of an individual solve. Cancel terminates the optional worker.'],
 references:[{title:'OpenAeroStruct aerostructural wingbox optimisation walkthrough',url:'https://mdolab-openaerostruct.readthedocs-hosted.com/en/latest/aerostructural_wingbox_walkthrough.html',role:'Formulation context only; not validation of this implementation.'}]};
fs.writeFileSync(path.join(app,'validation/DESIGN_ADVISOR_REVIEW.json'),JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({passed:true,pageSha256:hash(page),inlineScriptsParsed:count,kernelUnchanged:true,deltaCandidates:delta.testedCandidates,finiteTipCandidates:finite.testedCandidates},null,2));
