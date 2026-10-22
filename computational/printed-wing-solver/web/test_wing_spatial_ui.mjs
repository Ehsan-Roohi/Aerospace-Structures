// Full generated app, real IO and mechanics. THREE is a scene-graph stand-in:
// this verifies DOM/event/picking dispatch, not WebGL pixels or hardware input.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),harness=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8'),raw=readFileSync(new URL('../../../tests/fixtures/wing_lab_station_browser.json',import.meta.url),'utf8');
const makeThree=new Function(harness.slice(harness.indexOf('function makeThree()'),harness.indexOf('function openPage('))+'\nreturn makeThree;')(),key='winglab:printed-study:v1';
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);checks++;},tick=()=>new Promise(r=>setTimeout(r,10));
const trace=message=>{if(process.env.MIE446_TEST_TRACE)console.log('Spatial UI: '+message);};
async function wait(f,label,p){const deadline=Date.now()+90000;while(!f()){assert.ok(Date.now()<deadline,label+'; errors='+p.errors.join('; ')+'; input='+p.ui.inputError());await tick();}}
function open(saved){
 const errors=[],downloads=[],blobs=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html#wing',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,$=s=>w.document.querySelector(s),state={hitKind:null};
 class TestRaycaster{constructor(){this.params={Line:{threshold:1}};}setFromCamera(){}intersectObjects(objects){const object=state.hitKind&&objects.find(o=>o.userData.kind===state.hitKind);return object?[{object,point:{x:0}}]:[];}}
 Object.defineProperty(w,'innerWidth',{value:1440,configurable:true});w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.Blob=Blob;w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:spatial-ui-'+blobs.length;};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 if(saved)w.localStorage.setItem(key,saved);
 for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))w.THREE=new Proxy(makeThree(),{get:(obj,k)=>k==='Raycaster'?TestRaycaster:obj[k]});continue;}vm.runInContext(code,dom.getInternalVMContext());}
 return {dom,w,$,errors,downloads,blobs,state,ui:w.WingLabUI,engine:vm.runInContext('WingEngine',dom.getInternalVMContext())};
}
const opened=[];
try{
 const p=open();opened.push(p);const {w,$,ui}=p,solved=()=>ui.result()&&!ui.isRunning()&&!ui.isStale();
 await wait(solved,'initial solve',p);
 trace('initial solve complete');
 const initial=JSON.stringify(ui.engineInput()),preview=ui.studyFiles().openText(raw,'station-wing.json');ok(preview.ok,JSON.stringify(preview.errors));
 ok(!$('.wing-file-pop').hidden,'advanced preview is visible');ok($('.wing-file-pop').contains($('#wingStudyFiles')));assert.equal(JSON.stringify(ui.engineInput()),initial,'preview cannot change the study');checks++;
 $('#wingStudyFiles .wio-apply').click();ok(ui.isStale(),'imported geometry is not mislabeled solved');
 const canonical=()=>JSON.parse(w.WingStudyIO.exportPrintedStudy(ui.state(),p.engine)).study;
 eq(canonical(),JSON.parse(raw).study,'all advanced profile coordinates, geometry, incidence and loads round-trip exactly');
 $('#runBtn').click();await wait(solved,'station wing spatial solve',p);
 trace('advanced import and solve complete');
 let result=ui.result();ok(result.analysis3D,'actual engine returned spatial mechanics');ok(result.analysis3D.verification.forceError<1e-6);ok(result.analysis3D.displacements.some(u=>Math.abs(u[0])+Math.abs(u[1])>1e-8),'response is not only a rotated scalar vertical curve');
 ok($('#wingSpatialResults')&&!$('#wingSpatialResults').hidden);ok($('#app > .dock > .tabs').hidden,'legacy result tabs are hidden');
 for(const text of ['Root reactions','Tip response','Equilibrium','normal stress','How the software solves','overall FoS are unresolved'])ok($('#wingSpatialResults').textContent.includes(text),text);
 ok($('#wingSpatialCharts').children.length>=5,'physical profiles are rendered');
 ok($('#wingSpatialResults').textContent.includes('beam-axis station y'),'envelope abscissa is the normal-cut axis, not a physical streamwise surface station');
 ok($('#wingSpatialResults').textContent.includes('not zero stress'),'unresolved fields cannot be mistaken for zero');
 ok($('#wingSpatialResults').textContent.includes('unvalidated applications'),'unseen designs cannot inherit a false benchmark-validation claim');
 ok($('#wingSpatialResults').textContent.includes('Torsional warping stress is not recovered'),'known non-affine torsional stress limitation remains visible');
 ok($('#wingSpatialResults').textContent.includes('not a validated Saint-Venant decay distance'),'geometric masks are not advertised as physically validated end zones');
 for(const label of ['Show nominal skin stress','Show nominal spar stress']){const b=Array.from($('#wingSpatialResults').querySelectorAll('button')).find(b=>b.textContent===label);ok(b&&!b.disabled,label+' available for this full-spar fixture');b.click();assert.equal(ui.state().plot,'stress');checks++;ok(!ui.isStale(),'stress display does not change mechanics');}
 ok($('#report').value.includes('equivalent beam axis'),'portable report retains fixture assumption');
 ok($('#report').value.includes('Endpoint wrench mapping:'),'portable report retains explicit end-load approximation');
 ok($('#report').value.includes('streamwise elastic incidence change'),'portable report distinguishes incidence from axis twist');
 for(const plot of ['mode','fos']){const b=$('#app > .bar [data-plot="'+plot+'"]');ok(b.disabled,plot+' unavailable control disabled');b.click();ok(ui.state().plot!==plot,'no false '+plot+' results');}
 for(const plot of ['stress','disp','model']){$('#app > .bar [data-plot="'+plot+'"]').click();assert.equal(ui.state().plot,plot);checks++;ok(!ui.isStale(),'display selection cannot change mechanics');}
 const deformed=ui.state().deformed;$('#defBtn').click();assert.equal(ui.state().deformed,!deformed);checks++;ok($('#plotinfo').textContent.includes('SPATIAL BEAM'));
 const loadBefore=JSON.stringify(ui.state().load);for(const view of ['iso','plan','section','front']){$('#app [data-view="'+view+'"]').click();ok(!ui.isStale(),'view '+view+' remains usable');}assert.equal(JSON.stringify(ui.state().load),loadBefore);checks++;
 const motion=p.engine.spatialPointMotion(result,90,[50,0]);ok(motion.displacement.every(Number.isFinite));ok(Number.isFinite(p.engine.normalStressAt3D(result,90,[50,4])));
 // Exercise actual model-hit routing with the real generated parts and a
 // deterministic Raycaster; orbit drags must not become selections.
 $('[data-wing-action="inside"]').click();p.state.hitKind='spar';
 const pointer=(type,x)=>{const event=new w.Event(type,{bubbles:true});Object.assign(event,{clientX:x,clientY:10,pointerId:1,button:0});$('#gl').dispatchEvent(event);};
 pointer('pointerdown',10);pointer('pointerup',40);assert.equal($('#wpChoice').value,'');checks++;
 pointer('pointerdown',10);pointer('pointerup',10);assert.equal($('#wpChoice').value,'spar:0');checks++;ok($('.wing-editor-pop').contains($('#wingPartEditor')),'picked spar opens its real editor');
 $('.wing-editor-pop .wing-editor-close').click();p.state.hitKind=null;
 trace('display and model picking complete');
 // The mesh is an analysis setting, never an edit of the printable geometry.
 const mesh=$('#wingMeshElements');ok(mesh);assert.equal(mesh.min,'4');assert.equal(mesh.max,'100');assert.equal(mesh.placeholder,'Auto');checks+=3;
 const geometryBefore=JSON.stringify(ui.state().geometry),enter=value=>{mesh.value=String(value);mesh.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));};
 enter(12);assert.equal(ui.state().analysis.nElements,12);assert.equal(ui.engineInput().nElements,12);assert.equal(JSON.stringify(ui.state().geometry),geometryBefore);checks+=3;ok(ui.isStale(),'mesh Enter marks analysis out of date');
 $('#runBtn').click();await wait(solved,'requested 12-element spatial solve',p);result=ui.result();assert.equal(result.mesh.requestedElements,12);assert.equal(result.mesh.actualElements,result.analysis3D.elements.length);ok(result.mesh.actualElements>=12);checks+=2;
 trace('mesh 12 solve complete');
 const validInput=JSON.stringify(ui.engineInput()),validBackup=w.localStorage.getItem(key),validResult=ui.result();
 for(const value of [3,101,4.5]){enter(value);assert.equal(JSON.stringify(ui.engineInput()),validInput,'invalid mesh is atomic');assert.equal(w.localStorage.getItem(key),validBackup,'invalid mesh cannot replace autosave');assert.equal(ui.result(),validResult);ok(!mesh.checkValidity(),'invalid count visibly rejected');checks+=3;}
 mesh.value='24';mesh.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(ui.state().analysis.nElements,24);assert.equal(ui.engineInput().nElements,24);checks+=2;
 enter(24);assert.equal(ui.state().analysis.nElements,24);ok(mesh.checkValidity(),'correcting count clears custom validity');checks++;
 $('#wingUndo').click();assert.equal(ui.state().analysis.nElements,12);checks++;$('#wingRedo').click();assert.equal(ui.state().analysis.nElements,24);assert.equal(ui.engineInput().nElements,24);checks+=2;
 const saved=canonical();assert.equal(saved.analysis.nElements,24);checks++;const expected={...JSON.parse(raw).study,analysis:{nElements:24}};eq(saved,expected,'only explicit mesh settings change the portable study');
 $('[data-wing-action="save-json"]').click();ok(p.downloads.at(-1).endsWith('.json'));const download=JSON.parse(await p.blobs.at(-1).text());eq(download.study,saved,'actual Save JSON bytes preserve advanced data plus mesh');
 ui.studyFiles().openText(JSON.stringify(download),'mesh-reopen.json');$('#wingStudyFiles .wio-apply').click();assert.equal(ui.state().analysis.nElements,24);assert.equal($('#wingMeshElements').value,'24');checks+=2;eq(canonical(),saved,'reimport retains full advanced study');
 trace('mesh validation, history, save and reimport complete');
 const restored=open(w.localStorage.getItem(key));opened.push(restored);await wait(()=>restored.ui.result()&&!restored.ui.isRunning()&&!restored.ui.isStale(),'restart spatial solve',restored);
 trace('restart solve complete');
 assert.equal(restored.ui.state().analysis.nElements,24);assert.equal(restored.ui.result().mesh.requestedElements,24);assert.equal(restored.$('#wingMeshElements').value,'24');checks+=3;eq(JSON.parse(restored.w.WingStudyIO.exportPrintedStudy(restored.ui.state(),restored.engine)).study,saved,'browser restart preserves canonical study');
 // Blank Auto removes only the optional analysis mesh and survives history.
 const rm=restored.$('#wingMeshElements');rm.value='';rm.dispatchEvent(new restored.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(restored.ui.state().analysis,null);assert.equal(restored.ui.engineInput().nElements,undefined);checks+=2;ok(!Object.hasOwn(JSON.parse(restored.w.WingStudyIO.exportPrintedStudy(restored.ui.state(),restored.engine)).study,'analysis'));
 restored.$('#wingUndo').click();assert.equal(restored.ui.state().analysis.nElements,24);checks++;
 // A later neutral-v1 outer shape cannot accidentally keep hidden advanced
 // station profiles, incidence, sweep or dihedral from the current study.
 const parameters=JSON.parse(readFileSync(new URL('./wing_parameters_template.json',import.meta.url),'utf8'));
 parameters.span.value=180;parameters.airfoil.code='0012';parameters.rootChord=160;parameters.tipChord=120;
 const advancedBefore=JSON.stringify(restored.ui.state().geometry),backupBefore=restored.w.localStorage.getItem(key);
 restored.ui.studyFiles().previewParameters(JSON.stringify(parameters),'neutral-0012.json');
 assert.equal(JSON.stringify(restored.ui.state().geometry),advancedBefore,'neutral preview cannot mutate the advanced study');checks++;
 ok(restored.$('#wingStudyFiles .wio-apply-geometry'),'neutral outer shape passes conflict checking');restored.$('#wingStudyFiles .wio-apply-geometry').click();
 const neutral=restored.ui.state().geometry;assert.equal(neutral.naca,'0012');ok(!neutral.airfoil&&!neutral.stations,'old explicit airfoils/stations removed');assert.equal(neutral.sweepDeg||0,0);assert.equal(neutral.dihedralDeg||0,0);assert.equal(neutral.twistEnabled,false);checks+=4;
 assert.equal(restored.engine.airfoilAt(restored.engine.makeGeometry(neutral),90),'0012');assert.equal(restored.ui.state().analysis.nElements,24,'outer geometry import preserves mesh settings');checks+=2;
 ok(restored.ui.importGate()?.open,'outer-only geometry still requires structural confirmations');assert.equal(restored.w.localStorage.getItem(key),backupBefore,'unconfirmed outer shape cannot overwrite the complete advanced backup');checks++;
 const referenceOnly=JSON.parse(raw);for(const field of ['airfoil','stations','sweepDeg','dihedralDeg','sweepReferenceFraction','twistReferenceFraction','twistEnabled'])delete referenceOnly.study.geometry[field];referenceOnly.study.geometry.sweepReferenceFraction=.25;
 const rp=restored.ui.studyFiles().openText(JSON.stringify(referenceOnly),'quarter-chord-only.json');ok(rp.ok,JSON.stringify(rp.errors));restored.$('#wingStudyFiles .wio-apply').click();
 assert.equal(restored.ui.state().geometry.sweepReferenceFraction,.25);ok(!restored.ui.state().geometry.airfoil&&!restored.ui.state().geometry.stations);checks++;
 restored.ui.studyFiles().previewParameters(JSON.stringify(parameters),'neutral-after-reference.json');ok(restored.$('#wingStudyFiles .wio-apply-geometry'));restored.$('#wingStudyFiles .wio-apply-geometry').click();
 assert.equal(restored.ui.state().geometry.sweepReferenceFraction||0,0,'reference-only quarter-chord alignment must not survive a neutral LE-aligned import');assert.equal(restored.engine.airfoilAt(restored.engine.makeGeometry(restored.ui.state().geometry),90),'0012');checks+=2;
 eq(opened.flatMap(x=>x.errors),[],'no application JavaScript errors');
 console.log(`Spatial wing UI PASS: ${checks} real-app import/Apply/solve, spatial result guards, display/picking dispatch, mesh keyboard/validation/history/download/import/restart and exact advanced-data checks (no real WebGL).`);
}finally{for(const p of opened)p.dom.window.close();}
