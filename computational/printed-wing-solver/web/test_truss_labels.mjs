import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
const change=(id,value)=>{const input=$(id);if(typeof value==='boolean')input.checked=value;else input.value=value;input.dispatchEvent(new w.Event('change'));};
const model={nodes:[{id:1,x:300,y:525,support:'pin',supportSide:'above',fx:Math.SQRT1_2*1000,fy:Math.SQRT1_2*1000},{id:2,x:975,y:525,support:'free',fx:-1000,fy:1.2246467991473532e-13},{id:3,x:975,y:150,support:'rollerY',fx:0,fy:0},{id:4,x:600,y:400,support:'free',fx:0,fy:0},{id:5,x:450,y:175,support:'rollerX',supportSide:'left',fx:0,fy:0}],members:[[1,4],[4,2],[1,2],[1,5],[5,4],[4,3],[2,3],[5,3]].map(([a,b])=>({a,b,E:70000,A:100}))};
try{
 w.TrussLab.setModel(model);$('#solve').click();assert.ok(w.TrussLab.state().result);
 const original=JSON.stringify(w.TrussLab.state().model),numbers=JSON.stringify(w.TrussLab.state().result);
 const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 for(const detail of ['compact','detailed','ids'])for(const coordinates of [false,true]){
  change('#trussLabelDetail',detail);change('#trussNodeCoordinates',coordinates);
  const labels=[...w.document.querySelectorAll('[data-drawing-label]')],boxes=labels.map(t=>JSON.parse(t.dataset.labelBox));
  assert.equal(labels.length,15);assert.equal(w.document.querySelectorAll('[data-member-force]').length,8);
  for(let i=0;i<boxes.length;i++){assert.ok(boxes[i].x>=7&&boxes[i].x+boxes[i].w<=993);assert.ok(boxes[i].y>=56&&boxes[i].y+boxes[i].h<=493);for(let j=0;j<i;j++)assert.equal(overlap(boxes[i],boxes[j]),0,`no text overlap in ${detail}/${coordinates}`);}
  assert.match($('[data-force="2"] text').textContent,/F=\(-1000, 0\) N/,'round-off noise hidden only in drawing');
  assert.match($('[data-force="2"] title').textContent,/1\.2246467991473532e-13/,'full input retained in tooltip');
  assert.equal($('[data-node="1"] text').textContent.includes('(300, 525)'),coordinates);
  assert.match($('[data-member="0"] title').textContent,/N · (tension|compression|zero force)/);
  if(detail==='compact')assert.ok(!$('[data-member-force="0"]').textContent.includes('compression'));
  if(detail==='detailed')assert.match($('[data-member-force="0"]').textContent,/N · /);
  if(detail==='ids')assert.equal($('[data-member-force="0"]').textContent,'M1');
  assert.equal(JSON.stringify(w.TrussLab.state().model),original);assert.equal(JSON.stringify(w.TrussLab.state().result),numbers,'display settings cannot change solved data');
 }
 assert.ok(w.document.querySelector('[data-label-leader]'));
 $('[data-member="4"] [data-label-background]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(w.TrussLab.state().selected.index,4,'relocated label background remains clickable');
 console.log('Truss label PASS: screenshot-like eight-member model, compact/full/IDs, optional coordinates, non-overlap and viewport bounds, leader lines, editable labels, numerical-noise formatting and unchanged engineering data.');
}finally{dom.window.close();}
