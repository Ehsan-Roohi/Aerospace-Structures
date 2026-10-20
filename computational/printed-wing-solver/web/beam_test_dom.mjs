// Shared jsdom loader for the Beam Lab DOM tests (DOM component tests; no browser rendering).
// Install jsdom separately (not vendored); optionally set MIE446_JSDOM_MODULE to its module path.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
export const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE || 'jsdom');
// Same order as the inline script in wing_lab_template.html, then the controller.
export const BEAM_SCRIPTS=['load_profiles.js','beam_sections.js','beam_learning_engine.js','beam_study.js','beam_diagrams.js','beam_solution.js','companion_tools.js','foundations_ui.js'];
export const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
/** Load the Beam Lab into a JSDOM context; reduced motion and timers as in the original tests. */
export function loadBeamLab(dom,{scripts=BEAM_SCRIPTS,matches=true}={}) {
  const w=dom.window, ctx=dom.getInternalVMContext();
  w.matchMedia=()=>({matches});
  // Tests model an intentional confirmation by default; cancel-path tests override this.
  w.confirm=()=>true;
  w.setInterval=()=>0;
  if(!w.HTMLElement.prototype.scrollIntoView) w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const file of scripts) vm.runInContext(read('./'+file),ctx,{filename:file});
  return {w,ctx,$:s=>w.document.querySelector(s),$$:s=>[...w.document.querySelectorAll(s)]};
}
/** Explicitly enter a test model through the same controls as a user; production now starts blank. */
export function configureBlankBeam(dom){
 const w=dom.window,$=s=>w.document.querySelector(s);
 for(const [name,value] of Object.entries({length:450,E:2000,density:1.24,elements:30}))$(`#beamGeometry [name="${name}"]`).value=String(value);
 $('#beamShape').value='rectangle';$('#beamShape').dispatchEvent(new w.Event('change'));
 $('#beamSectionFields [data-sec="width"]').value='20';$('#beamSectionFields [data-sec="height"]').value='10';$('#beamSectionFields [data-sec="height"]').dispatchEvent(new w.Event('input',{bubbles:true}));
}
