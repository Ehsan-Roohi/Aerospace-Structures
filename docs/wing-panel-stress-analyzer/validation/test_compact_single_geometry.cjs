// UI navigation regression. Synthetic result values exercise presentation only;
// independent scientific verification remains in the numerical validation suites.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..');
const {JSDOM}=require(path.join(repo,'.review-js/node_modules/jsdom'));
const read=n=>fs.readFileSync(path.join(app,n),'utf8').replace(/\r\n/g,'\n');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const page=read('index.html'),shell=read('ui/wx-shell.js'),css=read('ui/wx-shell.css'),results=read('ui/wx-aero-results.js');
assert.equal(page,read('wing-lab.html'));
assert.equal(hash(page),JSON.parse(read('BUILD.json')).pageSha256);
for(const s of [shell,css,results])assert.equal(page.split(s.trim()).length-1,1,'each editable source embedded once');
let inlineScripts=0;
for(const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=|type=["'](?:importmap|application\/json)/i.test(m[1])){new vm.Script(m[2]);inlineScripts++;}
const baseline=JSON.parse(read('BUILD.json')).compact_single_geometry_port;
const blocks=s=>[...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>m[2]);
const changed=blocks(page).map((s,i)=>hash(s)!==baseline.baselineInlineScriptSha256[i]?i:-1).filter(i=>i>=0);
assert.deepEqual(changed,[5,8]);
assert.equal(hash(blocks(page)[5].split('const WingAeroUI =')[0]),baseline.structuralAndPanelKernelSha256,'structural and 3D panel numerical kernels unchanged');
assert.equal(hash(results.split('window.WingAeroStructResults =')[0]),baseline.independent2DSourceSha256,'2D numerical equations unchanged');
assert.ok(shell.includes('bar.replaceChildren(menubar, results)'));
assert.ok(shell.indexOf('fileBtn, geometryBtn, aeroBtn, structBtn')>0,'shared geometry precedes both solvers');
assert.ok(!shell.includes('geoSlotAero')&&!shell.includes('geoSlotStruct'),'no competing geometry locations');
assert.ok(!shell.includes("cap('Shared wing shape')"),'solver menus contain no geometry accordion');
assert.ok(shell.includes('park(...replacedSideWrappers)'),'old sidebar wrappers cannot leak into active panel');
assert.match(css,/\.wl-treepm aside\.tree[^}]*overflow: auto/s,'tree is bounded and scrolls before properties');
assert.ok(css.includes('grid-template-areas: "bar" "view" "dock"'),'no independent results grid row');

const dom=new JSDOM('<main id="view"><div id="loading"></div></main><section id="strip"><button data-plot="model"></button><select id="wingMoreResults"></select></section><details id="legacy"><summary>Solver report &amp; load CSV</summary><div id="aeroResults"><button id="aeroCsv">Original download</button></div></details>',{runScripts:'outside-only',url:'https://example.test/'});
const w=dom.window,d=w.document;let solveCalls=0,downloadCalls=0,recordCalls=0;
w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};w.URL.createObjectURL=()=>{downloadCalls++;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
w.eval(results);
const el=(tag,attrs={},...kids)=>{const e=d.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')e.textContent=v;else if(k==='html')e.innerHTML=v;else e.setAttribute(k,v===true?'':v);}for(const n of kids)if(n!=null)e.append(n);return e;};
let state={status:'none'};
const ui={state:()=>({geometry:{semiSpan:450,rootChord:160,tipChord:100},aeroLoad:{label:'Applied'}}),aero:()=>({solvedKey:'test',solve:()=>solveCalls++})};
w.WingAeroUI={provenanceHelp:()=>'<p>Internal mesh estimate; external references are separate.</p>',admissionVerdict:()=>({ok:true,html:'Admitted test load'}),admissionTable:()=>'<table><tr><td>Admission diagnostics</td></tr></table>',recordFromSequence:()=>{recordCalls++;return {};},csv:()=>'quantity,value\nCL,0.5\n'};
const original=d.getElementById('legacy'),originalOutput=d.getElementById('aeroResults'),originalCsv=d.getElementById('aeroCsv');
const r=w.WingAeroStructResults.install({el,ui,strip:d.getElementById('strip'),view:d.getElementById('view'),state:()=>state,reportNode:original,openAero:()=>{},exportStructureFigure:()=>{}});
d.body.append(r.selector,r.csvButton,r.pngButton);
r.show('coef');
assert.match(d.getElementById('wxArNotice').textContent,/Solve Aerodynamics/);
assert.equal(d.getElementById('wxArReport').hidden,true);assert.equal(d.getElementById('wxReportCsv').disabled,true);
const e={value:.5,uncertainty:.01,finest:.49,base:.48,chord:{levels:[16,32],values:[.48,.49],observedOrder:2},span:{levels:[8,16],values:[.48,.49],observedOrder:2}};
const coefficients=Object.fromEntries(['CL','CLTrefftz','CDiTrefftz','CDpressure','Cm'].map(k=>[k,e]));
state={status:'ok',result:{label:'UI fixture',base:{flow:{speed:15,density:1.225,alphaDeg:4,dynamicPressure_Pa:137.8,reynoldsMac:100000,mach:.04},diagnostics:{linearSolver:'LU',linearRelativeResidual:1e-12},warnings:[]},levels:[{chordPanels:16,spanPanels:8,panels:256,coefficients:{CL:.48},strips:[[0,1,0,0,1,0]]}]},combined:{coefficients,rootWrench:[e,e,e,e,e,e],weights:[{chordPanels:16,spanPanels:8,weight:1}],consistency:{lift:{relativeDifference:.01},drag:{difference:.001,combinedUncertainty:.002}}},admission:{admitted:true}};
original.hidden=false;r.refresh();
assert.equal(d.getElementById('wxArReport').hidden,false);assert.equal(d.getElementById('wxReportCsv').disabled,false);
assert.match(d.getElementById('wxCoefficientReport').textContent,/Mesh convergence/);
assert.match(d.getElementById('wxCoefficientReport').textContent,/Admission diagnostics/);
assert.equal(d.getElementById('aeroResults'),originalOutput);assert.equal(d.getElementById('aeroCsv'),originalCsv);
assert.equal(d.querySelectorAll('#aeroResults').length,1);assert.equal(d.querySelectorAll('#aeroCsv').length,1);
d.getElementById('wxReportCsv').click();assert.equal(recordCalls,1);assert.equal(downloadCalls,1);
state={status:'stale',why:'wing shape changed'};r.refresh();
assert.equal(d.getElementById('wxArReport').hidden,true);assert.equal(d.getElementById('wxReportCsv').disabled,true);
r.close();r.show('coef');assert.equal(solveCalls,0,'viewing a report must never initiate a solver');
assert.equal(d.querySelectorAll('#aeroResults').length,1,'report remains connected after navigation');
dom.window.close();
console.log(JSON.stringify({passed:true,inlineScriptsParsed:inlineScripts,unchangedInlineScripts:8,structuralAnd3DPanelKernelsUnchanged:true,independent2DEquationsUnchanged:true,oneGeometryEditor:true,noPermanentSidebar:true,resultsInFirstHeaderRow:true,reportEmptyAndStaleStates:true,originalReportAndCsvIdentityRetained:true,csvUsesCurrentSolverRecord:true,noSolveFromNavigation:true},null,2));

// Exercise the actual mount/compute/render controller after its report is moved.
// Only the costly numerical sequence is stubbed; markup, scoped lookups and handlers are real.
(async()=>{
 const dom2=new JSDOM('<div id="host"></div><section id="reportView"></section>',{runScripts:'outside-only',url:'https://example.test/'}),v=dom2.window,doc=v.document;
 const estimate={value:.5,uncertainty:.01,finest:.49,base:.48};
 const strip=[0,450,0,0,1,0,0,0],combined={coefficients:Object.fromEntries(['CL','CLTrefftz','CDiTrefftz','CDpressure','Cm'].map(k=>[k,estimate])),rootWrench:Array(6).fill(estimate),weights:[{chordPanels:16,spanPanels:8,weight:1}],strips:[strip],consistency:{lift:{relativeDifference:.01},drag:{difference:.001,combinedUncertainty:.002}}};
 const base={flow:{speed:15,density:1.225,alphaDeg:4,reynoldsMac:100000,mach:.04,dynamicPressure_Pa:137.8},reference:{span_mm:900},warnings:[],scope:{method:'Test fixture',flow:'Potential flow',excluded:[],claim:'UI test'},stripLoads:[strip],strips:[{yMid:225}],chordwise:[{y_mm:225,chord_mm:160,upper:[[0,-1],[1,0]],lower:[[0,.5],[1,0]]}]};
 const sequence={sequence:'standard',definition:{baseSpan:8,baseChord:16},base,levels:[{chordPanels:16,spanPanels:8,panels:256,coefficients:{CL:.48},strips:[strip]}]};
 v.WingAeroPanel={normalizeFlow:()=>{},runSequence:()=>sequence,combineSequence:()=>combined};
 v.eval(read('ui/wing-aero-ui.js')+'\nwindow.MountedAeroUI=WingAeroUI;');
 const host=doc.getElementById('host'),mounted=v.MountedAeroUI.mount(host,{geometry:()=>({semiSpan:450}),geometryKey:()=> 'test-key',download:()=>{}});
 const output=doc.getElementById('aeroResults');doc.getElementById('reportView').append(output);
 await mounted.compute();
 assert.doesNotMatch(doc.getElementById('aeroStatus').textContent,/Cannot set|Error|null/);
 assert.match(output.textContent,/Computed result/);assert.ok(output.querySelector('#aeroCsv'),'real moved report creates its CSV control');
 assert.equal(doc.querySelectorAll('#aeroResults').length,1);assert.equal(mounted.result,sequence);
 const csv=output.querySelector('#aeroCsv');assert.equal(typeof csv.onclick,'function','real CSV handler bound after reparent');
 mounted.reset();assert.equal(output.innerHTML,'','reset reaches the moved original report');mounted.refresh();
 dom2.window.close();console.log(JSON.stringify({actualMountRenderAfterReportReparent:true,realCsvHandlerBound:true,resetAfterReparent:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
