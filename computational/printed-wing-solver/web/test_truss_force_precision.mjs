import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const click=s=>$(s).dispatchEvent(new w.MouseEvent('click',{bubbles:true})),submit=()=>$('#forceForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const mode=value=>{$('#forceDirection').value=value;$('#forceDirection').dispatchEvent(new w.Event('change'));};
const pair=()=>{const n=w.TrussLab.state().model.nodes[1];return [n.fx,n.fy];};
function setPair(fx,fy){w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:100,y:0,support:'rollerY',fx,fy}],members:[{a:1,b:2,E:200000,A:100}]});click('[data-tool="force"]');click('[data-node="2"] circle');}
try{
 setPair(0,0);mode('angle');$('#forceMagnitude').value='100';$('#forceAngle').value='35';submit();const original=pair();
 click('[data-force="2"]');assert.equal($('#forceMagnitude').value,'100');assert.equal($('#forceAngle').value,'35');submit();assert.deepEqual(pair(),original,'unchanged polar Apply retains full-precision components');
 for(let i=0;i<20;i++){click('[data-force="2"]');mode('custom');mode('angle');submit();}assert.deepEqual(pair(),original,'switching modes cannot accumulate trigonometric or display rounding');
 const precise=[123.45678901234567,-9.876543210987654];setPair(...precise);mode('custom');assert.notEqual($('#forceX').value,String(precise[0]),'display can be concise');submit();assert.deepEqual(pair(),precise,'concise input display does not truncate model data');
 click('[data-force="2"]');mode('angle');mode('custom');submit();assert.deepEqual(pair(),precise,'custom/polar/custom retains imported precision');
 for(const magnitude of [1e-300,1e-150,1e150,1e300]){const a=35*Math.PI/180,expected=[magnitude*Math.cos(a),magnitude*Math.sin(a)];setPair(...expected);mode('angle');assert.ok(+$('#forceMagnitude').value>0,'small magnitudes are not rounded to zero');assert.ok(Number.isFinite(+$('#forceMagnitude').value));submit();assert.deepEqual(pair(),expected);click('[data-node="2"] circle');mode('custom');submit();assert.deepEqual(pair(),expected);}
 setPair(1.2345678901234567,2.345678901234567);mode('custom');$('#forceX').value='3.456789012345678';$('#forceY').value='-4.567890123456789';submit();assert.deepEqual(pair(),[3.456789012345678,-4.567890123456789],'newly typed input keeps all available precision');
 click('[data-force="2"]');mode('angle');$('#forceMagnitude').value='123.45678901234567';$('#forceAngle').value='23.45678901234567';submit();const a=23.45678901234567*Math.PI/180;assert.deepEqual(pair(),[123.45678901234567*Math.cos(a),123.45678901234567*Math.sin(a)],'new polar values are not display-rounded before solving');
 click('[data-force="2"]');const before=pair();$('#forceMagnitude').value='-1';submit();assert.deepEqual(pair(),before);assert.equal($('#trussLoadEditor').hidden,false);$('#forceMagnitude').value='';mode('custom');assert.equal($('#forceX').value,'');assert.equal($('#forceY').value,'');submit();assert.deepEqual(pair(),before,'invalid conversion cannot reuse cached values');
 console.log('Truss force precision PASS: 100 N at 35° displays 100, exact unchanged Apply, twenty polar/component cycles, retained imported and typed precision, 1e-300–1e300 magnitudes, invalid drafts refused.');
}finally{dom.window.close();}
