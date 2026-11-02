import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const plain=v=>JSON.parse(JSON.stringify(v));
const triangle={nodes:[{id:1,name:'A',x:0,y:0,support:'pin',fx:0,fy:0},{id:2,name:'B',x:1000,y:0,support:'rollerY',fx:0,fy:0},{id:3,name:'C',x:500,y:500,support:'free',fx:0,fy:-10}],members:[[1,2],[1,3],[2,3]].map(([a,b])=>({a,b,E:70000,A:100}))};
for(const relative of ['./truss_lab_template.html','../../../docs/truss-lab.html','../../../docs/wing-panel-stress-analyzer/truss-lab.html']){
 const dom=new JSDOM(readFileSync(new URL(relative,import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
 w.confirm=()=>true;
 const scripts=relative.includes('template')?['truss_engine.js','truss_ui.js'].map(f=>readFileSync(new URL(f,import.meta.url),'utf8')):Array.from(w.document.scripts,e=>e.textContent);
 for(const source of scripts)vm.runInContext(source,dom.getInternalVMContext());
 const submit=s=>$(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const change=(id,value)=>{const e=$('#'+id);if(typeof value==='boolean')e.checked=value;else e.value=value;e.dispatchEvent(new w.Event('change'));};
 const label=i=>$(`[data-member="${i}"] text`).textContent,nodeLabel=id=>$(`[data-node="${id}"] text`).textContent;
 const view=()=>JSON.parse(w.TrussLab.exportText()).settings.view;
 const contained=()=>{const v=view();for(const n of w.TrussLab.state().model.nodes){assert.ok(n.x>=v.xmin&&n.x<=v.xmin+v.width);assert.ok(n.y>=v.ymin&&n.y<=v.ymin+v.height);const c=$(`[data-node="${n.id}"] circle`);assert.ok(+c.getAttribute('cx')>=60&&+c.getAttribute('cx')<=940);assert.ok(+c.getAttribute('cy')>=50&&+c.getAttribute('cy')<=470);}};
 try{
  assert.ok($('#editNodeName').closest('aside'));
  for(const id of ['reactionView','trussNodeCoordinates','trussShowComponents','trussShowDisplacements','trussShowDeformed','trussDeformationMode'])assert.equal($('#'+id).closest('details').id,'trussDrawingLabels');
  for(const [x,y]of [[0,0],[2400,1200],[-600,-350]]){$('#nodeX').value=x;$('#nodeY').value=y;submit('#nodeForm');contained();}
  assert.deepEqual(plain(w.TrussLab.state().model.nodes.map(n=>[n.x,n.y])),[[0,0],[2400,1200],[-600,-350]],'Expanding the drawing cannot rescale physical coordinates');
  const a=$('[data-node="1"] circle'),b=$('[data-node="2"] circle');assert.ok(Math.abs((+b.getAttribute('cx')- +a.getAttribute('cx'))/2400-(+a.getAttribute('cy')- +b.getAttribute('cy'))/1200)<1e-12,'Physical axes use equal scale');
  const grid=$('[data-grid-background]');for(const n of w.document.querySelectorAll('[data-node] circle')){assert.ok(+n.getAttribute('cx')>=+grid.getAttribute('x')-1e-8);assert.ok(+n.getAttribute('cx')<=+grid.getAttribute('x')+ +grid.getAttribute('width')+1e-8);assert.ok(+n.getAttribute('cy')>=+grid.getAttribute('y')-1e-8);assert.ok(+n.getAttribute('cy')<=+grid.getAttribute('y')+ +grid.getAttribute('height')+1e-8);}
  w.TrussLab.setModel(triangle);assert.equal(label(0),'A–B');assert.equal(label(1),'A–C');
  const cable=plain(triangle);cable.members[1].type='cable';w.TrussLab.setModel(cable);assert.equal(label(1),'A–C','Cable names also follow endpoint names');w.TrussLab.setModel(triangle);
  change('editNodePicker','2');$('#editNodeName').value='  Tip <B &>  ';submit('#nodeNameForm');assert.equal(w.TrussLab.state().model.nodes[1].name,'Tip <B &>');assert.equal(label(0),'A–Tip <B &>');assert.equal($('#editNodeName').value,'Tip <B &>');assert.equal(w.TrussLab.state().model.members[0].name,undefined,'Automatic labels remain derived rather than frozen as custom names');assert.equal($('[data-node="2"] B'),null);
  $('#undo').click();assert.equal(w.TrussLab.state().model.nodes[1].name,'B');$('#redo').click();assert.equal(w.TrussLab.state().model.nodes[1].name,'Tip <B &>');
  $('[data-node="2"] circle').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));$('#moveNodeName').value='Beta';submit('#nodeMoveBar');assert.equal($('#editNodeName').value,'Beta');assert.equal(label(0),'A–Beta');$('#closeNodeMove').click();
  $('[data-member="0"] text').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('#editFields [name="name"]').value='Legacy custom AB';submit('#editForm');change('editNodePicker','2');$('#editNodeName').value='B';submit('#nodeNameForm');assert.equal(label(0),'Legacy custom AB','Explicit labels survive endpoint renaming');
  $('#editNodeCoordinates').click();assert.equal($('#editFields [name="name"]').value,'B');$('#editFields [name="name"]').value='B2';$('#editFields [name="x"]').value='-1800';submit('#editForm');contained();assert.equal(w.TrussLab.state().model.nodes[1].x,-1800);assert.equal(w.TrussLab.state().model.nodes[1].name,'B2');
  const imported=JSON.parse(w.TrussLab.exportText());assert.equal(w.TrussLab.importText(JSON.stringify(imported)),true);assert.equal(label(0),'Legacy custom AB');assert.equal(w.TrussLab.state().model.nodes[1].name,'B2');
  w.TrussLab.setModel(triangle);$('#solve').click();assert.ok(w.TrussLab.state().result);const physical=JSON.stringify(w.TrussLab.state().model),solved=JSON.stringify(w.TrussLab.state().result),r=w.TrussLab.state().result.nodes[2];assert.ok(r.ux>0&&r.uy<0);
  change('trussShowComponents',true);assert.match(nodeLabel(3),/ux=.* mm; uy=-.* mm/);assert.doesNotMatch(nodeLabel(3),/\|u\|=/);
  change('trussShowDisplacements',true);assert.match(nodeLabel(3),/ux=.*uy=.*\|u\|=.* mm/);
  change('trussShowComponents',false);assert.doesNotMatch(nodeLabel(3),/ux=/);assert.match(nodeLabel(3),/\|u\|=/);
  change('trussShowComponents',true);const actualLabel=nodeLabel(3);change('trussDeformationMode','manual');change('trussDeformationScale','100');assert.equal(nodeLabel(3),actualLabel);change('trussShowDeformed',false);assert.equal(nodeLabel(3),actualLabel);assert.equal(w.document.querySelectorAll('[data-deformed-member]').length,0);assert.equal(JSON.stringify(w.TrussLab.state().model),physical);assert.equal(JSON.stringify(w.TrussLab.state().result),solved);
  const saved=JSON.parse(w.TrussLab.exportText());assert.equal(saved.settings.resultDisplay.showComponents,true);assert.equal(saved.settings.resultDisplay.showDisplacements,true);assert.equal(w.TrussLab.importText(JSON.stringify(saved)),true);assert.equal($('#trussShowComponents').checked,true);assert.equal($('#trussShowDisplacements').checked,true);
  delete saved.settings.resultDisplay.showComponents;assert.equal(w.TrussLab.importText(JSON.stringify(saved)),true);assert.equal($('#trussShowComponents').checked,false,'Older settings have a compatible default');
  const before=JSON.stringify(w.TrussLab.state());for(const value of ['bad\nname','x'.repeat(41),{}]){const bad=plain(saved);bad.model.nodes[0].name=value;assert.equal(w.TrussLab.importText(JSON.stringify(bad)),false);assert.equal(JSON.stringify(w.TrussLab.state()),before);}
  assert.ok(!/NaN|Infinity/.test($('#trussCanvas').innerHTML));
  console.log(relative+': PASS · external/negative bounds and checker, equal axes, three node-name editors, dynamic member/cable labels, custom-label recovery, independent actual components/resultant, visual-only scale, JSON compatibility.');
 }finally{dom.window.close();}
}
