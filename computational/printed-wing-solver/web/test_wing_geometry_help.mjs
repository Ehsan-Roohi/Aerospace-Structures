import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),E=require('./engine.js'),A=require('./wing_airfoils.js'),H=require('./wing_geometry_help.js'),UI=require('./wing_geometry_ui.js'),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const geometry=()=>E.makeGeometry({rodFractions:[],spars:[],modules:1,rootChord:160,tipChord:100,skin:1.2,airfoil:A.preset('naca23012'),stations:[{eta:0,airfoil:A.preset('naca23012'),incidenceDeg:0},{eta:.5,airfoil:A.preset('naca632615'),incidenceDeg:0},{eta:1,airfoil:A.preset('naca23012'),incidenceDeg:0}]});
const g=geometry(),original=JSON.stringify(g),t=performance.now(),d=H.diagnoseCavity(g,E);
assert.equal(JSON.stringify(g),original);assert.equal(d.section,2);assert.equal(d.profile,'NACA 63(2)-615');assert.equal(d.chord,130);assert.ok(Math.abs(d.gap-.6202045412478738)<1e-9);assert.ok(Math.abs(d.x-.9)<1e-12);
const skin=d.suggestions.find(s=>s.kind==='skin'),chords=d.suggestions.find(s=>s.kind==='chords');assert.equal(skin.value,1.1);assert.ok(skin.value>=.8);
for(const patch of [{skin:skin.value},{rootChord:chords.root,tipChord:chords.tip}]){const candidate=E.makeGeometry({...g,...patch});for(let i=0;i<=128;i++)assert.doesNotThrow(()=>E.ringLoops(candidate,candidate.semiSpan*i/128));}
assert.equal(H.diagnoseCavity({...g,skin:skin.value},E),null);
const thin=H.diagnoseCavity({...g,rootChord:20,tipChord:15},E);assert.ok(thin&&!thin.suggestions.some(s=>s.kind==='skin'&&s.value<.8));
const dom=new JSDOM('<div id="host"></div>'),w=dom.window;let state=g,applied=0;
const ui=UI.mount(w.document.querySelector('#host'),{getGeometry:()=>state,applyGeometry:patch=>{const candidate=E.makeGeometry({...state,...patch}),diagnostic=H.diagnoseCavity(candidate,E);if(diagnostic)return{ok:false,error:diagnostic.summary,guidance:diagnostic};state=candidate;applied++;return{ok:true};}});ui.refresh();
const $=s=>w.document.querySelector(s),submit=()=>ui.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
try{
 submit();assert.equal(applied,0);assert.equal(JSON.stringify(state),original);assert.ok($('.wing-geometry-guidance').textContent.includes('0.62 mm'));assert.ok($('.wing-geometry-guidance').textContent.includes('Section 2'));
 const useSkin=[...$('.wing-geometry-guidance').querySelectorAll('button')].find(b=>b.textContent.includes('skin'));useSkin.click();assert.equal($('#wgtSkin').value,'1.1');assert.equal(state.skin,1.2,'suggestions only edit the draft');assert.equal(applied,0);submit();assert.equal(applied,1);assert.equal(state.skin,1.1);assert.equal(state.stations[1].airfoil.name,'NACA 63(2)-615');
 ui.refresh();const middle=$('#wgtStation1Kind');middle.value='naca4415';middle.dispatchEvent(new w.Event('change'));assert.match(w.document.querySelectorAll('.wing-station-card>summary')[1].textContent,/NACA 4415/,'section headings track the actual profile picker');
 state=geometry();ui.refresh();submit();[...$('.wing-geometry-guidance').querySelectorAll('button')].find(b=>b.textContent.includes('larger chords')).click();assert.equal(w.document.querySelectorAll('#wgtRootChord').length,1);assert.equal(state.rootChord,160);submit();assert.equal(state.rootChord,chords.root);assert.equal(state.tipChord,chords.tip);
}finally{dom.window.close();}
// Actual generated controller must return diagnostics without committing the invalid design.
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8'),fixture=readFileSync(new URL('./test_wing_layout_controls.mjs',import.meta.url),'utf8');
const makeThree=new Function(fixture.slice(fixture.indexOf('function makeThree()'),fixture.indexOf('function openPage('))+'\nreturn makeThree;')();
const live=new JSDOM(page,{url:'https://example.org/wing-lab.html#beam',runScripts:'outside-only'}),v=live.window;
v.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});v.requestAnimationFrame=()=>0;v.cancelAnimationFrame=()=>{};v.setInterval=()=>0;v.confirm=()=>true;v.HTMLElement.prototype.scrollIntoView=function(){};v.HTMLCanvasElement.prototype.getContext=()=>null;v.ResizeObserver=class{observe(){}disconnect(){}};
try{for(const[,attrs,code]of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(attrs)){if(/OrbitControls/.test(attrs))v.THREE=makeThree();continue;}vm.runInContext(code,live.getInternalVMContext());}
 const before=JSON.stringify(v.WingLabUI.engineInput()),out=v.WingLabUI.applyGeometry(g);assert.equal(out.ok,false);assert.equal(out.guidance.section,2);assert.equal(out.guidance.chord,130);assert.equal(JSON.stringify(v.WingLabUI.engineInput()),before);assert.match(out.error,/0.62 mm/);
}finally{live.window.close();}
console.log(`Wing geometry help PASS: real 23012 → 63(2)-615 → 23012 rejection, retained inputs, 258 dense independent engine checks of suggested geometries, no sub-minimum skin advice, draft-only fixes, live headings and actual controller propagation (${(performance.now()-t).toFixed(0)} ms QA).`);
