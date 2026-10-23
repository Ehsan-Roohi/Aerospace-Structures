// Compact summaries must never delete the complete diagnostic or hide its severity.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const template=readFileSync(new URL('./wing_lab_template.html',import.meta.url),'utf8');
const start=template.indexOf('  function syncCompactStatus('),end=template.indexOf('  function setStatus(',start);
assert.ok(start>0&&end>start);
const dom=new JSDOM('<span id="stateChip"></span><span id="statePreview"></span><span id="stateText"></span>',{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
w.$=$;vm.runInContext(template.slice(start,end),dom.getInternalVMContext());
const sync=vm.runInContext('syncCompactStatus',dom.getInternalVMContext());
let checks=0;
try{
 for(const [chip,full,expected] of [
  ['Linear range exceeded','Outside the admitted small-displacement screening (translation/span > 5% or rotation > 0.1 rad). Linear results are illustrative only; reduce loads or use a geometrically nonlinear model.','Illustrative only · reduce loads.'],
  ['Input error','Skin thickness must be positive. Results shown are for the last solved model.','Check input details.'],
  ['Analysis blocked','Imported outer geometry: confirm its structural inputs before solving.','Confirm imported structure.'],
  ['Empty study','Choose an airfoil and dimensions, then Apply geometry to create your wing.','Choose Airfoil & planform.'],
  ['Out of date','Inputs changed — press Solve. Results shown are for the last solved model.','Press Solve to update.'],
  ['Solving','Meshing and solving the inputs on screen','Computing…'],
  ['Solved','Solved with no load: no load defined.','No loads applied.'],
  ['Solved · 3-D beam','Spatial beam matches inputs · nominal prediction; not a safety approval.','Nominal beam results.'],
  ['Solved','Results match the inputs · other-check U = 1.2 (PLA tension), exceeded · buckling unresolved','Strength check exceeded.'],
  ['Solved','Results match the inputs · buckling unresolved','Results match inputs.'],
 ]){
  $('#stateChip').textContent=chip;$('#stateText').textContent=full;sync();
  assert.equal($('#statePreview').textContent,expected);assert.equal($('#stateText').textContent,full);assert.equal($('#stateChip').title,full);assert.equal($('#stateChip').textContent,chip);checks+=4;
 }
 sync('Notebook export blocked: printer/material mismatch');assert.equal($('#statePreview').textContent,'See status details.');checks++;
 assert.ok(template.includes('id="wingStatusDetails"'));assert.ok(template.includes('class="wing-status-popover"'));assert.ok(template.includes('> Auto-solve</label>'));checks+=3;
 console.log(`Wing compact header PASS: ${checks} concise states, retained full diagnostics, warning severity, details disclosure and Auto-solve label checks.`);
}finally{dom.window.close();}
