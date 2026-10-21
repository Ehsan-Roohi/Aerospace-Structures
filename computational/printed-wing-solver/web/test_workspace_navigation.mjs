import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadBeamLab,JSDOM} from './beam_test_dom.mjs';
const expected=['Beam','Truss','Wing','Full-scale wing','Wing geometry tool'];
const labels=nav=>[...nav.querySelectorAll(':scope > .workspace-link,:scope > details > summary.workspace-link')].map(e=>e.textContent.trim());
const beam=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'});
try{
 const {w,$}=loadBeamLab(beam),nav=$('#beamNav');assert.ok(nav.classList.contains('workspace-nav'));assert.deepEqual(labels(nav),expected);
 assert.equal(nav.querySelector('[href="truss-lab.html"]').textContent,'Truss');assert.equal(nav.querySelector('[data-stage="beam"]').getAttribute('aria-pressed'),'true');
 assert.ok(nav.querySelector('.bl-companion .companion-card'));assert.equal(nav.querySelector('.bl-companion a').getAttribute('href'),'https://vinco-rc.com/?generator=wing');
 w.document.documentElement.dataset.wingReady='true';const stages=[];w.addEventListener('wing-learning-stage',e=>stages.push(e.detail));
 nav.querySelector('[data-stage="wing"]').click();nav.querySelector('[data-stage="metal"]').click();assert.deepEqual(stages,['wing','metal']);
 $('#beamNavToggle').click();assert.equal($('#beamNavToggle').getAttribute('aria-expanded'),'true');assert.ok(nav.classList.contains('is-open'));$('#beamNavToggle').click();assert.equal(nav.classList.contains('is-open'),false);
}finally{beam.window.close();}
const truss=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'});
try{
 const nav=truss.window.document.querySelector('header .workspace-nav');assert.deepEqual(labels(nav),expected);
 assert.deepEqual([...nav.querySelectorAll('a')].map(a=>a.getAttribute('href')),['wing-lab.html','truss-lab.html','wing-lab.html#wing','wing-lab.html#d520','https://vinco-rc.com/?generator=wing']);
 assert.equal(nav.querySelector('[aria-current="page"]').textContent,'Truss');assert.equal(nav.lastElementChild.getAttribute('target'),'_blank');assert.match(nav.lastElementChild.getAttribute('rel'),/noopener/);
 for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),truss.getInternalVMContext());
 assert.deepEqual(labels(nav),expected,'toolbar initialization must preserve workspace navigation');assert.equal(truss.window.document.querySelector('#trussAutoSolve').checked,false);
}finally{truss.window.close();}
const wingSource=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8'),metalSource=readFileSync(new URL('./metal_wing_ui.js',import.meta.url),'utf8');
for(const [name,source,id,current] of [['printed Wing',wingSource,'wingNavigation','Wing'],['full-scale Wing',metalSource,'metalNav','Full-scale wing']]){
 const markup=source.match(new RegExp(`<nav id="${id}"[\\s\\S]*?<\\/nav>`))?.[0];assert.ok(markup,`${name} has a workspace nav`);
 const dom=new JSDOM(markup);try{const nav=dom.window.document.querySelector('nav');assert.ok(nav.classList.contains('workspace-nav'));assert.deepEqual(labels(nav).slice(0,5),expected,`${name} keeps the same first five controls`);
  assert.equal(nav.querySelector('[aria-current="page"]').textContent,current);assert.equal(nav.querySelector('[href="truss-lab.html"]').textContent,'Truss');assert.equal(nav.querySelectorAll(':scope > .workspace-link').length,nav.children.length,'all nav controls share the same class');
  assert.doesNotMatch(nav.textContent,/Beam lessons|choose supports|Truss Lab/i);assert.equal(nav.querySelector('[href="https://vinco-rc.com/?generator=wing"]').getAttribute('target'),'_blank');
 }finally{dom.window.close();}
}
// Check the hash router in isolation, without requiring WebGL or the wing solver.
const router=wingSource.match(/function openWorkspaceHash\(\)\{[^\n]*\}/)?.[0];assert.ok(router,'printed Wing exposes a hash router');
const dispatched=[],routeContext=vm.createContext({location:{hash:'#wing'},window:{dispatchEvent:e=>dispatched.push(e.type)},CustomEvent:class{constructor(type){this.type=type;}},returnToBeams:()=>dispatched.push('beam')});
vm.runInContext(router,routeContext);vm.runInContext('openWorkspaceHash()',routeContext);assert.deepEqual(dispatched,['wing-show']);routeContext.location.hash='#beam';vm.runInContext('openWorkspaceHash()',routeContext);assert.deepEqual(dispatched,['wing-show','beam']);
routeContext.location.hash='#wingstudy=preserve';vm.runInContext('openWorkspaceHash()',routeContext);assert.equal(dispatched.length,2,'workspace route must not swallow study links');assert.match(wingSource,/addEventListener\('hashchange',openWorkspaceHash\)/);assert.match(wingSource,/addEventListener\('hashchange',openStudyLink\)/);
assert.match(metalSource,/#mBackBeams[\s\S]*?closeMetal\("beams"\)/);assert.match(metalSource,/#mBackWing[\s\S]*?closeMetal\("wing"\)/);assert.match(metalSource,/if \(\["#d520", "#metal", "#metal-wing"\]\.includes\(h\)\) openMetal\(\)/);
const css=readFileSync(new URL('./beam_lab.css',import.meta.url),'utf8');assert.match(css,/nav\.workspace-nav \.workspace-link \{/);assert.match(css,/workspace-link\[aria-current="page"\]/);assert.match(css,/\.workspace-nav:not\(\.bl-nav\)/,'shared styling must not force the collapsed mobile Beam nav open');
console.log('Workspace navigation PASS: matching Beam/Truss/Wing/D.520 nav order/classes, concise labels, current-workspace state, cross-links, companion attribution, mobile toggle, #wing/#beam routes and preserved study-link routing.');
