// Real engines and DOM/scene graph. Not a real WebGL pixel or hardware-pointer test.
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';
const require=createRequire(import.meta.url),{JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),fixture=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
const makeThree=new Function(fixture.slice(fixture.indexOf('function makeThree()'),fixture.indexOf('function openPage('))+'\nreturn makeThree;')();
let hitKind=null;
class TestRaycaster{setFromCamera(){}intersectObjects(objects){const object=objects.find(o=>o.userData.kind===hitKind);return object?[{object,point:{x:0}}]:[];}}
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,ctx=dom.getInternalVMContext(),$=s=>w.document.querySelector(s);
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.setInterval=()=>0;
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLCanvasElement.prototype.getContext=()=>null;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.confirm=()=>true;
for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))w.THREE=new Proxy(makeThree(),{get:(obj,key)=>key==='Raycaster'?TestRaycaster:obj[key]});continue;}vm.runInContext(code,ctx);}
const tick=()=>new Promise(r=>setTimeout(r,10)),ui=()=>w.WingLabUI;
async function wait(test){const end=Date.now()+60000;while(!test()){assert.ok(Date.now()<end,'timeout '+errors.join(';'));await tick();}}
async function choose(value){$('#wpChoice').value=value;$('#wpChoice').dispatchEvent(new w.Event('change'));await tick();}
async function settle(){await tick();await tick();}
const del=target=>target.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));
try{
 assert.equal(w.document.querySelectorAll('#beamNav [data-stage="wing"]').length,1);
 assert.equal(w.document.querySelectorAll('#beamNav [data-stage="shell"],#beamNav [data-stage="rods"],#beamNav [data-stage="ribs"],#beamNav [data-stage="project"]').length,0);
 w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'wing'}));await wait(()=>ui().result()&&!ui().isRunning()&&!ui().isStale());
 assert.equal(ui().state().geometry.rodFractions.length,0);assert.equal(ui().state().geometry.spars.length,0);assert.equal(ui().view().members.ribs,0);
 const originalLoads=JSON.stringify(ui().state().load);
 $('#wpNewRib').value='200';$('#wpAddRib').click();await settle();assert.deepEqual([...ui().state().geometry.customInteriorRibs],[200]);assert.equal(ui().view().members.ribs,1);assert.ok(ui().isStale());
 await choose('rib:200');assert.equal($('#wpDelete').disabled,false);
 $('#wpPosition').value='220';$('#wpMove').click();await settle();assert.deepEqual([...ui().state().geometry.customInteriorRibs],[220]);
 await choose('rib:220');$('#wpPosition').value='300';$('#wpDuplicate').click();await settle();assert.deepEqual([...ui().state().geometry.customInteriorRibs],[220,300]);
 await choose('rib:220');del($('#wpPosition'));await settle();assert.equal(ui().view().members.ribs,2,'Delete in an input must not delete a part');
 del(w.document.body);await settle();assert.deepEqual([...ui().state().geometry.customInteriorRibs],[300]);assert.equal($('#wpChoice').value,'');
 $('#wpUndo').click();await settle();assert.equal(ui().view().members.ribs,2);
 await choose('rib:220');$('#wpPosition').value='900';$('#wpMove').click();await settle();assert.equal(ui().view().members.ribs,2,'invalid move rejected atomically');
 $('#wpAddSpar').click();await settle();assert.equal(ui().view().members.sparParts,3);
 await choose('spar:0');$('#wpPosition').value='.55';$('#wpDuplicate').click();await settle();assert.equal(ui().state().geometry.spars.length,2);assert.equal(ui().view().members.sparParts,6);
 await choose('spar:1');del(w.document.body);await settle();assert.equal(ui().state().geometry.spars.length,1,'Delete any selected spar removes all three members');
 $('#wpUndo').click();await settle();assert.equal(ui().state().geometry.spars.length,2);
 // Exercise pointer hit routing using the test Raycaster and real generated model members.
 hitKind='spar';
 assert.equal($('#wpPick').getAttribute('aria-pressed'),'false','direct picking needs no mode button');
 function pointer(type,x){const ev=new w.Event(type,{bubbles:true});Object.assign(ev,{clientX:x,clientY:10,pointerId:1});$('#gl').dispatchEvent(ev);}
 pointer('pointerdown',10);pointer('pointerup',40);assert.equal($('#wpChoice').value,'','orbit drag is not a selection');
 pointer('pointerdown',10);pointer('pointerup',10);assert.equal($('#wpChoice').value,'spar:0','cap/web hit selects its parent spar');
 assert.equal($('.wing-editor-pop[aria-labelledby="appEditorTitle"]').hidden,false,'direct hit opens the compact real editor');
 assert.ok($('.wing-editor-pop[aria-labelledby="appEditorTitle"]').contains($('#wingPartEditor')));
 $('#wpDelete').click();await settle();assert.equal(ui().state().geometry.spars.length,1);
 hitKind='rib';pointer('pointerdown',10);pointer('pointerup',10);assert.match($('#wpChoice').value,/^rib:/);$('#wpDelete').click();await settle();assert.equal(ui().view().members.ribs,1);
 const touch=(type,id)=>{const ev=new w.Event(type,{bubbles:true});Object.assign(ev,{clientX:10,clientY:10,pointerId:id,button:0,pointerType:'touch'});$('#gl').dispatchEvent(ev);};
 touch('pointerdown',1);touch('pointerdown',2);touch('pointerup',1);touch('pointerup',2);assert.equal($('#wpChoice').value,'','pinch/pan must not select a member');
 pointer('pointerdown',10);const cancel=new w.Event('pointercancel');Object.assign(cancel,{pointerId:1});$('#gl').dispatchEvent(cancel);pointer('pointerup',10);assert.equal($('#wpChoice').value,'','cancelled gesture does not select');
 assert.deepEqual([...w.document.querySelectorAll('#app .dock [role="tab"]')].map(b=>b.dataset.tab),['diagrams','checks','section','report'],'only results remain below the wing');
 for(const name of ['learn','loads','design','members','predict','joints'])assert.ok($('#tab-'+name).closest('.wing-input-library'),'input/teaching panel has no home under the model: '+name);
 $('#learnBtn').click();assert.ok($('.wing-editor-pop[aria-labelledby="appEditorTitle"]').contains($('#tab-learn')));assert.equal($('#tab-diagrams').hidden,false,'lesson keeps the last results tab selected');
 $('.wing-editor-pop[aria-labelledby="appEditorTitle"] .wing-editor-close').click();assert.ok($('#tab-learn').closest('.wing-input-library'),'closing restores lesson without duplicating it');
 assert.equal($('#runBtn').closest('.bar').getAttribute('aria-label'),'Commands','Solve remains available when tablet input drawer is closed');
 $('#inputsBtn').click();assert.equal($('#app').classList.contains('tablet-inputs-open'),true);$('#wingSide > button').click();assert.equal($('#app').classList.contains('tablet-inputs-open'),false);
 assert.equal(JSON.stringify(ui().state().load),originalLoads,'all part operations preserve load case');
 const saved=JSON.stringify(ui().state());w.document.querySelector('#backFoundations').click();w.document.querySelector('#beamNav [data-stage="wing"]').click();assert.equal(JSON.stringify(ui().state()),saved,'returning to Wing preserves the custom design');
 w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'project'}));await wait(()=>!ui().isRunning()&&!ui().isStale());
 assert.equal($('#wpChoice').value,'','switching model clears selection');
 hitKind='rod';$('#app [data-wing-action="inside"]').click();pointer('pointerdown',10);pointer('pointerup',10);assert.equal($('#wpChoice').value,'rod:0','a visible rod is directly selectable');
 const rodCount=ui().state().geometry.rodFractions.length;$('#wpDelete').click();await settle();assert.equal(ui().state().geometry.rodFractions.length,rodCount-1,'rod deletion removes only the selected rod');$('#wingUndo').click();await settle();assert.equal(ui().state().geometry.rodFractions.length,rodCount,'Wing history restores deleted rod');
 const locked=[...$('#wpChoice').options].find(o=>o.textContent.includes('locked'));assert.ok(locked);await choose(locked.value);const count=ui().view().members.ribs;assert.equal($('#wpDelete').disabled,true);del(w.document.body);await settle();assert.equal(ui().view().members.ribs,count,'seam rib protected');
 assert.deepEqual(errors,[]);console.log('Wing part editor PASS: live add/move/duplicate/delete/undo, input-safe Delete, invalid edit rejection, cap/web parent picking, drag filtering, locked seams, model switch and unchanged loads (DOM/scene graph only).');
}finally{dom.window.close();}
