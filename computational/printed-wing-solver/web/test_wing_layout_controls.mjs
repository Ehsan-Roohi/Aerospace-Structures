// Wing workspace layout and structural controls (DOM, real engines; WebGL is replaced by a small THREE stand-in).
// Loads the generated docs/wing-lab.html in jsdom, runs its inline scripts in page order, and drives the controls:
//   printed wing — explicit Solve / out-of-date / input-error states, every geometry and structure control reaching
//   the engine input and changing mass, EI, GJ, stress and deflection as the beam model predicts, atomic rejection of
//   invalid edits (previous inputs and last solved result kept), inventory = engine data, report inventory, Design-lab
//   comparison after geometry edits, auto-solve, presets and lesson experiments;
//   D.520 — part toggles and see-through first view are visual only, spar labels, inventory = engine data with the
//   source status of each item.
// Real rendering, zoom and layout are checked in test_wing_browser.mjs (Chromium).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {JSDOM,VirtualConsole}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const E=require('./engine.js'), M=require('./metal_wing_engine.js');
const page=readFileSync(new URL('../../../docs/wing-lab.html',import.meta.url),'utf8');
let checks=0;
const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;};
const eq=(a,b,msg)=>{assert.equal(JSON.stringify(a),JSON.stringify(b),msg);checks++;};   // values may come from the page's realm

// ---------------------------------------------------------------- a THREE stand-in (no WebGL in jsdom)
// Scene-graph objects keep real children, names, visibility and userData; everything else is an inert proxy.
function makeThree() {
  const universal=(seed)=>{
    const store=Object.create(null), kids=new Map();
    if(seed&&typeof seed==='object'&&!Array.isArray(seed)) Object.assign(store,seed);
    return new Proxy(function(){},{
      get(t,k){
        if(k===Symbol.toPrimitive) return hint=>hint==='number'?0:'';
        if(k===Symbol.iterator) return function*(){};
        if(k==='then'||k==='toJSON'||typeof k==='symbol') return undefined;
        if(k in store) return store[k];
        if(!kids.has(k)) kids.set(k,universal());
        return kids.get(k);
      },
      set(t,k,v){if(typeof k==='string'&&/^\d+$/.test(k))return true;store[k]=v;return true;},
      has:()=>true, apply:()=>universal(), construct:(t,args)=>universal(args[0]),
    });
  };
  class Obj {
    constructor(){this.children=[];this.parent=null;this.visible=true;this.name='';this.userData={};for(const k of ['position','rotation','scale','quaternion','matrixWorld'])this[k]=universal();}
    add(...o){for(const c of o){if(c.parent)c.parent.remove(c);c.parent=this;this.children.push(c);}return this;}
    remove(o){const i=this.children.indexOf(o);if(i>=0){this.children.splice(i,1);o.parent=null;}return this;}
    traverse(f){f(this);for(const c of [...this.children])c.traverse(f);}
    getObjectByName(n){if(this.name===n)return this;for(const c of this.children){const r=c.getObjectByName(n);if(r)return r;}return undefined;}
    clone(){const o=new this.constructor(this.geometry,this.material);o.name=this.name;o.visible=this.visible;o.userData={...this.userData};for(const c of this.children)o.add(c.clone());return o;}
    updateMatrixWorld(){} updateWorldMatrix(){} lookAt(){}
  }
  class Mesh extends Obj {constructor(geometry,material){super();this.isMesh=true;this.geometry=geometry||universal();this.material=material||universal();}}
  class Group extends Obj {}
  class Scene extends Obj {}
  class ArrowHelper extends Obj {constructor(direction,origin,length,color){super();Object.assign(this,{direction,origin,length,color});}}
  const classes={Mesh,Group,Scene,Object3D:Obj,ArrowHelper};
  return new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:k in classes?classes[k]:universal(),has:()=>true});
}
function openPage({hash=''}={}) {
  const virtualConsole=new VirtualConsole();
  const dom=new JSDOM(page,{url:'https://example.org/wing-lab.html'+hash,runScripts:'outside-only',virtualConsole});
  const w=dom.window, ctx=dom.getInternalVMContext();
  Object.defineProperty(w,'innerWidth',{value:1440,configurable:true}); // Desktop input-column toggle; tablet drawer has dedicated part-editor coverage.
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.requestAnimationFrame=()=>0; w.cancelAnimationFrame=()=>{};
  w.setInterval=()=>0;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLCanvasElement.prototype.getContext=()=>null;
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.console.error=()=>{};
  const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for(const [,attrs,code] of scripts) {
    if(/\bsrc=/.test(attrs)) {if(/OrbitControls/.test(attrs))w.THREE=makeThree();continue;}   // three.js and its controls: the stand-in
    vm.runInContext(code,ctx);
  }
  const $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
  return {dom,w,$,$$};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
async function until(test,what,ms=60000){const end=Date.now()+ms;while(!test()){assert.ok(Date.now()<end,`timed out waiting for ${what}`);await tick(20);}}

// ================================================================ printed wing
{
  const {dom,w,$,$$}=openPage();
  const ui=()=>w.WingLabUI;
  const solved=async()=>{await until(()=>ui().result()&&!ui().isRunning()&&!ui().isStale()&&$('#stateChip').textContent==='Solved','a solved study');await tick(5);};
  const solve=async()=>{const before=ui().result();$('#runBtn').click();await until(()=>ui().result()!==before&&!ui().isRunning(),'Solve');await solved();return ui().result();};
  const editAirfoil=async value=>{
    $('#wgAirfoilPicker').click();await tick(5);
    const field=$('#wgtDefaultCode');ok(field,'full airfoil picker exposes its NACA code input');
    field.value=String(value);field.dispatchEvent(new w.Event('input',{bubbles:true}));
    // Submit the visible draft (also exercises validation before blur/change).
    $('#wgtApply').click();await tick(5);
  };
  const change=async(sel,value)=>{if(sel==='#wgAirfoilPicker'){await editAirfoil(value);return;}const el=$(sel);ok(el,`${sel} exists`);el.value=String(value);el.dispatchEvent(new w.Event('change',{bubbles:true}));await tick(5);};
  const click=async sel=>{$(sel).click();await tick(5);};
  const metrics=r=>({mass:r.mass.printed,EI:r.sections[0].EIf,EItip:r.sections.at(-1).EIf,GJ:r.sections[0].GJ,stress:Math.max(...r.stress.sigTop.map(Math.abs),...r.stress.sigBot.map(Math.abs)),defl:Math.abs(r.deflection.at(-1)),ribs:r.ribs.length,M0:Math.abs(r.M[0])});
  try {
    // Opening: the course wing, solved without loads, inputs shown, Solve explicit, empty load/study-file containers.
    w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'project'}));
    await solved();
    ok(!$('#app').hidden&&!$('#app').classList.contains('learning-view'),'workspace opens with the input column shown');
    ok($('#app > .bar #runBtn')&&$('#app > .bar #stateChip'),'Solve button and status remain above the model, independent of the input drawer');
    ok($('#wingAutoSolve')&&!$('#wingAutoSolve').checked,'"Solve automatically after each valid change" is offered and off by default');
    ok($('#wingLoadEditor .wle[data-workspace="printed"]')&&$('#wingLoadEditor #wingLoadForm'),'the shared custom-load editor sits in the Loads container (merged v5 load module)');
    ok($('#wingStudyFiles .wio-root.wio-printed')&&$('#wingShare #wingShareBtn'),'the study-file panel and the link button sit in Study files (merged v5 import module)');
    ok($('#wingSide #wingLoadEditor')&&$('#wingSide #wingStudyFiles'),'both containers are in the input column');
    for(const id of ['wgAirfoilPicker','wgSpan','wgRoot','wgTip','wgModules','wgSkin','wgRibT','wgRibNew','wgRibAdd','wgRibCount','wgRibEqual','wgRibReset','wgRod0','wgRod1','wgRodAdd','wgRodD','wgClear','wgWall'])
      ok($('#'+id),`${id} control present`);
    ok(/Generic browser study model/.test($('#wingModelNote').textContent)&&/CAD\/STL/.test($('#wingModelNote').textContent)&&/fabrication layout/.test($('#wingModelNote').textContent)&&/historical \/ course/.test($('#wingModelNote').textContent),'the model is labelled as a generic browser study model');
    // A load for nonzero stress: the Design-lab 2 N tip experiment (a deliberate action solves at once and saves the baseline).
    $('[data-wing-lesson="design"]').click();
    $('#designTip').click();
    await until(()=>ui().result().load.kind==='tip'&&!ui().isRunning()&&!ui().isStale(),'2 N experiment');await solved();
    ok($('#editRibsHint')==null&&$('#designEditRibs'),'Design lab points to the single rib editor in Structure');
    let R=ui().result(), m=metrics(R);
    ok(Math.abs(R.V[0]-2)<1e-9&&m.stress>0&&m.defl>0,'2 N tip load gives stress and deflection');

    // ---- every control: pending until Solve (result unchanged), engine input updated, physics responds
    const step=async(sel,value,key,expect,label)=>{
      const before=ui().result(), beforeGeo=JSON.stringify(ui().state().geometry);
      await change(sel,value);
      ok($('#stateChip').textContent==='Out of date'&&ui().isStale(),`${label}: edit marks the study out of date`);
      ok(ui().result()===before,`${label}: the last solved result is kept until Solve`);
      ok(!$('#wingStale').hidden&&/last solved model/.test($('#wingStale').textContent),`${label}: results area says it shows the last solved model`);
      ok(JSON.stringify(ui().state().geometry)!==beforeGeo,`${label}: inputs changed`);
      if(key) ok(JSON.stringify(ui().engineInput().geometry[key])===JSON.stringify(value),`${label}: engine input ${key} = ${JSON.stringify(value)} (${JSON.stringify(ui().engineInput().geometry[key])})`);
      const r=await solve(), a=metrics(before), b=metrics(r);
      expect(a,b,r);checks++;
      return r;
    };
    const up=(a,b,k)=>assert.ok(b[k]>a[k]*(1+1e-6),`${k} should increase: ${a[k]} -> ${b[k]}`);
    const down=(a,b,k)=>assert.ok(b[k]<a[k]*(1-1e-6),`${k} should decrease: ${a[k]} -> ${b[k]}`);
    const same=(a,b,k,tol=1e-9)=>assert.ok(Math.abs(b[k]-a[k])<=tol*Math.max(1,Math.abs(a[k])),`${k} should not change: ${a[k]} -> ${b[k]}`);
    await step('#wgSkin',1,'skin',(a,b)=>{down(a,b,'mass');down(a,b,'EI');down(a,b,'GJ');up(a,b,'stress');up(a,b,'defl');},'skin thickness');
    await step('#wgSkin',1.2,'skin',(a,b)=>{up(a,b,'mass');up(a,b,'EI');up(a,b,'GJ');down(a,b,'defl');},'skin thickness back');
    await step('#wgSpan',420,'semiSpan',(a,b,r)=>{down(a,b,'mass');same(a,b,'EI');down(a,b,'defl');down(a,b,'M0');assert.ok(Math.abs(r.M[0]-2*420)<1e-6);},'semi-span');
    await step('#wgRoot',170,'rootChord',(a,b)=>{up(a,b,'mass');up(a,b,'EI');up(a,b,'GJ');down(a,b,'defl');},'root chord');
    await step('#wgTip',110,'tipChord',(a,b)=>{up(a,b,'mass');up(a,b,'EItip');same(a,b,'EI');down(a,b,'defl');},'tip chord');
    await step('#wgAirfoilPicker','2415','naca',(a,b)=>{up(a,b,'EI');up(a,b,'GJ');down(a,b,'stress');down(a,b,'defl');},'NACA airfoil through the full airfoil/planform picker');
    await step('#wgRibT',2,'ribThickness',(a,b)=>{up(a,b,'mass');same(a,b,'EI');same(a,b,'GJ');same(a,b,'defl',1e-6);},'rib thickness (no rib EI/GJ in this beam model)');
    await step('#wgModules',2,'modules',(a,b,r)=>{eq(r.seams,[210]);down(a,b,'defl');down(a,b,'ribs');same(a,b,'EI');},'modules');
    // rib editor: add, move, remove, equal spacing (custom stations reach the engine; mass and rib count respond)
    let g=E.makeGeometry(ui().state().geometry), interiors=E.ribStations(g).filter(y=>!E.seams(g).some(s=>Math.abs(Math.abs(y-s)-g.interfaceOffset)<1e-6));
    $('#wgRibNew').value='60';await click('#wgRibAdd');
    ok(ui().isStale()&&JSON.stringify(ui().engineInput().geometry.customInteriorRibs)===JSON.stringify([...interiors,60].sort((a,b)=>a-b)),'add rib reaches the engine input as a custom station');
    let a=metrics(ui().result()), r=await solve(), b=metrics(r);
    ok(b.ribs===a.ribs+1&&b.mass>a.mass&&Math.abs(b.EI-a.EI)<1e-6*a.EI,'add rib: one more rib, more mass, same EI');
    await step('#wgRibY0',80,null,(a,b,r)=>{assert.ok(r.ribs.includes(80)&&!r.ribs.includes(60));},'move rib');
    a=metrics(ui().result());$('[data-wg-rib-remove="0"]').click();await tick(5);r=await solve();b=metrics(r);
    ok(b.ribs===a.ribs-1&&b.mass<a.mass,'remove rib: one fewer rib, less mass');
    $('#wgRibCount').value='5';await click('#wgRibEqual');
    r=await solve();g=E.makeGeometry(ui().state().geometry);
    ok(ui().state().geometry.customInteriorRibs==null&&ui().state().geometry.interiorRibs===5&&eq(r.ribs,E.ribStations(g))==null,'equal spacing uses the engine spacing rule');
    // rods: add, move, remove, diameter, clearance, sleeve wall
    a=metrics(ui().result());await click('#wgRodAdd');
    ok(ui().engineInput().geometry.rodFractions.length===3,'add rod reaches the engine input');
    r=await solve();b=metrics(r);ok(b.EI>a.EI&&b.GJ>a.GJ&&b.mass>a.mass,'a third rod and sleeve: EI, GJ and mass increase');
    await step('#wgRod2',0.5,null,(a,b,r)=>{assert.equal(r.geometry.rodFractions[2],0.5);assert.notEqual(b.EI,a.EI);},'move rod');
    a=metrics(ui().result());$('[data-wg-rod-remove="2"]').click();await tick(5);r=await solve();b=metrics(r);
    ok(r.geometry.rodFractions.length===2&&b.EI<a.EI&&b.mass<a.mass,'remove rod: EI and mass decrease');
    await step('#wgRodD',3,'rodDiameter',(a,b)=>{down(a,b,'EI');down(a,b,'mass');up(a,b,'defl');},'rod diameter');
    await step('#wgClear',0.15,'clearance',(a,b)=>{down(a,b,'mass');down(a,b,'EI');},'rod clearance');
    await step('#wgWall',1,'sleeveWall',(a,b)=>{down(a,b,'mass');down(a,b,'EI');down(a,b,'GJ');},'sleeve wall');
    await step('#wgRod1',0.5,null,(a,b,r)=>{assert.equal(r.geometry.rodFractions[1],0.5);assert.notEqual(b.EI,a.EI);assert.notEqual(b.stress,a.stress);},'rod chord position');
    // materials and joints (property fields): pending, then they change stiffness
    $('#tree [data-id="mat-pla"]').click();
    a=metrics(ui().result());await change('#pE',2600);ok(ui().isStale()&&ui().result().pla.E===2000,'material edit is pending');
    r=await solve();b=metrics(r);ok(r.pla.E===2600&&b.EI>a.EI&&b.defl<a.defl,'PLA modulus reaches the engine (EI up, deflection down)');
    $('#tree [data-id="con"]').click();
    a=metrics(ui().result());[...$$('#pm .seg button')].find(x=>x.textContent==='Epoxied').click();await tick(5);
    r=await solve();b=metrics(r);ok(r.assembly.rodsBonded&&b.EI!==a.EI,'bonded rods change the section stiffness');
    [...$$('#pm .seg button')].find(x=>x.textContent==='Slip fit').click();await tick(5);await solve();

    // ---- invalid edits are rejected atomically: message at the field, chip "Input error", inputs and result kept
    const reject=async(sel,value,pattern,errKey,label)=>{
      const before=ui().result(), geo=JSON.stringify(ui().state().geometry), wasStale=ui().isStale();
      if(typeof sel==='function') await sel(); else await change(sel,value);
      await tick(5);
      ok($('#stateChip').textContent==='Input error',`${label}: chip shows Input error`);
      ok(JSON.stringify(ui().state().geometry)===geo,`${label}: previous valid inputs kept`);
      ok(ui().result()===before&&ui().isStale()===wasStale&&!ui().isRunning(),`${label}: last solved result kept, no solve started`);
      const msg=$('#wgErr-'+errKey);
      ok(msg&&!msg.hidden&&pattern.test(msg.textContent),`${label}: message next to the field (${msg&&msg.textContent})`);
      ok(/^Not applied/.test(msg.textContent),`${label}: the message says the value was not applied`);
      if(typeof sel==='string'&&$(sel)) ok(String($(sel).value)!==String(value),`${label}: the field shows the kept value again, not a clipped one`);
      ok(pattern.test($('#stateText').textContent),`${label}: status text gives the reason`);
    };
    const stable=JSON.stringify(ui().state().geometry);
    await reject('#wgSpan',-5,/positive number/,'semiSpan','negative span');
    await reject('#wgSpan','',/positive number/,'semiSpan','empty span');
    await reject('#wgTip',200,/exceeds root chord/,'tipChord','tip chord above root chord');
    const rejectAirfoil=async(value,pattern,label)=>{
      const before=ui().result(),state=JSON.stringify(ui().state()),wasStale=ui().isStale(),chip=$('#stateChip').textContent;
      await editAirfoil(value);
      const message=$('#wingGeometryEditorStatus');
      ok(message&&message.getAttribute('role')==='alert'&&pattern.test(message.textContent),`${label}: visible draft validation explains rejection (${message?.textContent})`);
      ok(JSON.stringify(ui().state())===state,`${label}: previous complete study inputs kept atomically`);
      ok(ui().result()===before&&ui().isStale()===wasStale&&!ui().isRunning(),`${label}: last solved result kept, no solve started`);
      ok($('#stateChip').textContent===chip,`${label}: invalid uncommitted draft does not change the study status`);
      ok($('#wgtDefaultCode').value===value,`${label}: invalid draft remains visible, never silently clipped or replaced`);
      $('.wing-editor-pop:not([hidden]) .wing-editor-close').click();await tick(5);
    };
    await rejectAirfoil('24x2',/four-digit NACA/,'bad NACA code');
    await rejectAirfoil('2400',/thickness must be positive/,'zero-thickness airfoil');
    await reject('#wgSkin',4,/cavity collapses/,'skin','skin too thick for the airfoil');
    await reject('#wgRibT',4.5,/Interface rib offset must exceed rib thickness/,'ribThickness','rib thicker than the interface offset');
    await reject('#wgClear',1,/between 0 and 0\.8 mm/,'clearance','clearance out of range');
    await reject('#wgRodD',11,/Rod 2 at 0\.50c: its sleeve \(outer ⌀13\.30 mm\) does not fit between the inner skin surfaces at y = 420\.0 mm \(chord 110\.0 mm\): it would cut 0\.57 mm into the upper skin \(contact allowed: 0\.10 mm\)/,'rodDiameter','rod sleeve does not fit at the tip chord');
    await reject('#wgRod1',0.32,/Rods 1 and 2 .* overlap/,'rods','overlapping rods');
    await reject('#wgRod0',0.02,/ahead of the cavity's front wall/,'rods','rod ahead of the cavity');
    await reject('#wgRod0',0.97,/behind the cavity's rear wall/,'rods','rod behind the cavity');
    await reject('#wgRod0',1.5,/fraction between 0 and 1/,'rods','rod outside the chord');
    await reject(async()=>{$('#wgRibNew').value='420';await click('#wgRibAdd');},null,/lies outside the span or inside a 2\.0 mm end cap/,'ribs','rib beyond the span');
    await reject(async()=>{$('#wgRibNew').value='210';await click('#wgRibAdd');},null,/protected zone of the seam at y = 210\.0 mm/,'ribs','rib in a seam zone');
    await reject(async()=>{$('#wgRibCount').value='17';await click('#wgRibEqual');},null,/0–16 requested interior ribs/,'ribs','too many evenly spaced ribs');
    ok(JSON.stringify(ui().state().geometry)===stable,'after every rejection the geometry is exactly the last valid one');
    // custom ribs block a module change that would put a seam on top of them; the rib is named
    $('#wgRibNew').value='100';await click('#wgRibAdd');await solve();
    await reject('#wgModules',3,/Interior rib at y = 140\.0 mm lies in the protected zone of the seam at y = 140\.0 mm/,'modules','module change onto a custom rib');
    // rods: the last rod cannot go while dry seams need it
    await click('[data-wg-rod-remove="1"]');await solve();
    await reject(async()=>{$('[data-wg-rod-remove="0"]').click();await tick(5);},null,/dry seams the rods are the only parts/,'rods','removing the last rod across dry seams');
    // a span change may not strand a custom load (loads are read, never edited)
    const st=ui().state();st.load={kind:'custom',items:[{kind:'point',position:400,force:2,fraction:.3},{kind:'distributed',start:100,end:390,qStart:.002,qEnd:.002,fraction:.3}],fos:1.5,tipMass:0};
    await solve();
    const loadsBefore=JSON.stringify(ui().state().load);
    await reject('#wgSpan',380,/Load 1 \(point force 2 N at y = 400\.0 mm\); Load 2 \(line load from 100\.0 mm to 390\.0 mm\) lie beyond the new semi-span \(380\.0 mm\)/,'semiSpan','span shorter than the loads');
    ok(JSON.stringify(ui().state().load)===loadsBefore,'loads are untouched by a rejected geometry edit');
    // a valid edit clears the error state
    await change('#wgSpan',405);
    ok($('#stateChip').textContent==='Out of date'&&$('#wgErr-semiSpan').hidden,'a valid edit clears the input error');
    await solve();
    // a numeric property field with an impossible value is also refused (no silent fallback to the card value)
    $('#tree [data-id="mat-pla"]').click();
    const plaBefore=JSON.stringify(ui().state().plaOver);
    await change('#pE',-3);
    ok($('#stateChip').textContent==='Input error'&&JSON.stringify(ui().state().plaOver)===plaBefore&&$('#pE').value!=='-3','negative modulus refused, previous value kept');
    await solve();

    // ---- inventory = engine data (inputs on screen), and in the report (solved model)
    const inv=k=>$(`#wingInventory [data-inv="${k}"]`).textContent;
    const check=()=>{
      const geo=E.makeGeometry(ui().state().geometry), ribs=E.ribStations(geo), seams=E.seams(geo);
      const interior=ribs.filter(y=>!seams.some(s=>Math.abs(Math.abs(y-s)-geo.interfaceOffset)<1e-6));
      eq(+inv('ribs'),ribs.length,'inventory rib count');eq(+inv('interiorRibs'),interior.length,'interior ribs');eq(+inv('interfaceRibs'),ribs.length-interior.length,'interface ribs');
      eq([...$$('#wingInventory [data-inv="ribStations"] tr')].map(tr=>tr.cells[1].textContent),ribs.map(y=>y.toFixed(1)),'rib stations');
      eq(+inv('modules'),geo.modules,'modules');eq(inv('seams'),seams.length?seams.map(y=>y.toFixed(1)).join(', ')+' mm':'none','seams');
      eq(+inv('rods'),geo.rodFractions.length,'rod count');eq(+inv('rodDiameter'),+geo.rodDiameter.toFixed(2),'rod diameter');
      if(geo.rodFractions.length) eq(inv('rodFractions'),geo.rodFractions.map(f=>f.toFixed(2)).join(', '),'rod x/c');
      eq(+inv('sleeves'),geo.rodFractions.length*geo.modules,'sleeve segments');eq(+inv('skin'),+geo.skin.toFixed(2),'skin');eq(+inv('ribThickness'),+geo.ribThickness.toFixed(2),'rib thickness');
      eq(+inv('caps'),2,'end caps');eq(+inv('semiSpan'),+geo.semiSpan.toFixed(1),'span');
      eq(ui().inventory().ribs.map(r=>r.y),ribs,'inventory() hook');
    };
    check();
    $('#wgRibNew').value='250';await click('#wgRibAdd');check();      // inventory follows the inputs on screen at once
    ok(/not solved yet/.test($('#wingInventory').textContent),'inventory says when it is ahead of the solved model');
    r=await solve();check();
    const report=$('#report').value;
    ok(/Geometry inventory of the solved model \(generic browser study model/.test(report)&&report.includes(`Ribs: ${r.ribs.length} physical`)&&report.includes('Rods: 1 × ⌀3.00 mm')&&/Sleeves: 2 printed segments \(1 rods × 2 modules\)/.test(report),'report carries the geometry inventory');
    ok(/does not update|do not update/.test(report)&&/CAD\/STL/.test(report),'report states that edits do not update CAD/STL');

    // ---- Design lab comparison reflects geometry edits (baseline from the 2 N experiment, same load)
    $('[data-wing-lesson="design"]').click();$('#designTip').click();
    await until(()=>!ui().isRunning()&&!ui().isStale()&&ui().result().load.kind==='tip','new baseline');await solved();
    await change('#wgSkin',1);await solve();
    const row=[...$$('#designComparison tr')].find(tr=>/Printed PLA mass/.test(tr.textContent));
    ok(row&&parseFloat(row.cells[3].textContent)<0,'Design-lab comparison shows the mass change from the skin edit');
    ok(/unchanged/.test($('#designComparison').textContent),'same load/material context is reported');
    $('#designEditRibs').click();ok($('#wlStructure').open&&w.document.activeElement===$('#wgRibNew'),'"Edit ribs in Structure" opens Structure and focuses the rib field');

    // ---- automatic solving (off by default): after ticking it, a valid edit solves by itself
    $('#wingAutoSolve').checked=true;$('#wingAutoSolve').dispatchEvent(new w.Event('change'));
    const before=ui().result();await change('#wgSkin',1.1);
    await until(()=>ui().result()!==before&&!ui().isRunning()&&!ui().isStale(),'automatic solve');
    ok(ui().result().geometry.skin===1.1,'automatic solve used the edited value');
    await change('#wgSkin',-1);await tick(400);
    ok(ui().result().geometry.skin===1.1&&$('#stateChip').textContent==='Input error','an invalid edit is not solved automatically');
    $('#wingAutoSolve').checked=false;$('#wingAutoSolve').dispatchEvent(new w.Event('change'));

    // ---- zoom, fit and reset are view-only
    const geoNow=JSON.stringify(ui().state().geometry), resNow=ui().result();
    for(const id of ['zoomIn','zoomOut','zoomFit','zoomReset']) $('#'+id).click();
    ok(JSON.stringify(ui().state().geometry)===geoNow&&ui().result()===resNow&&!ui().isRunning(),'zoom buttons change neither inputs nor results');

    // ---- deliberate study actions still solve at once: lesson experiment, teaching panel, preset
    $('#learnBtn').click();$('[data-lesson="2"]').click();
    [...$$('#lessonActions button')].find(b=>/Run 4 N/.test(b.textContent)).click();
    await until(()=>!ui().isRunning()&&ui().result().load.tipForce===4,'lesson experiment');await solved();
    ok(true,'lesson "Run 4 N" solved without pressing Solve');
    $('[data-wing-lesson="members"]').click();
    $('#torsionLab [data-twist-f="0.25"]').click();
    await until(()=>!ui().isRunning()&&!ui().isStale()&&ui().result().load.tipFraction===.25,'torsion experiment');
    ok(true,'teaching-panel experiment solved at once');
    w.dispatchEvent(new w.CustomEvent('wing-learning-stage',{detail:'shell'}));
    await until(()=>!ui().isRunning()&&ui().result().geometry.modules===1&&!ui().isStale(),'shell preset');await solved();
    ok($('#wgModules').value==='1'&&!$('#wgRod0')&&+$('#wingInventory [data-inv="rods"]').textContent===0,'preset re-renders the input column (one module, no rods)');
    ok(/0 rods/.test($('#wlStructureBadge').textContent),'structure summary follows the preset');
    $('#inputsBtn').click();ok($('#app').classList.contains('learning-view')&&$('#inputsBtn').getAttribute('aria-expanded')==='false','Hide inputs folds the input column');
    $('#inputsBtn').click();ok(!$('#app').classList.contains('learning-view'),'Show inputs brings it back');
    console.log(`Printed wing: ${checks} checks passed (explicit Solve and stale state, every geometry/structure/material/joint control reaches the engine, atomic rejection, inventory, report, Design lab, auto-solve, zoom view-only, lessons and presets).`);
  } finally {dom.window.close();}
}

// ================================================================ D.520
{
  const {dom,w,$,$$}=openPage();
  const before=checks;
  try {
    w.MetalWingUI.open();
    await until(()=>w.MetalWingUI.result()&&$('#mLoading').hidden&&!['Solving','Ready'].includes($('#mChip').textContent),'the D.520 solve',120000);
    await tick(20);
    // Layout: input column with Solve/status, parameters (tree + properties), empty Loads and Study-file containers,
    // inventory; view panel with the display controls.
    ok($('#mSide #mRun')&&$('#mSide #mChip')&&$('#mSide #mTree')&&$('#mSide #mPm')&&$('#mSide #mInventory'),'D.520 input column holds Solve, status, parameters and inventory');
    ok($('#mSide #mLoadEditor .wle[data-workspace="d520"]')&&$('#mSide #mStudyFiles .wio-root.wio-d520'),'the shared load editor and the study-file panel sit in the D.520 input column (merged v5 modules)');
    ok($('#mViewPanel #mHud')&&$('#mViewPanel #mZoomIn')&&$('#mViewPanel #mZoomFit')&&$('#mViewPanel #mZoomReset'),'view panel holds zoom and display controls');
    ok(/visual deformation ×0(?:\.0)?\b/.test($('#mPlotinfo').textContent),'no load: no deformation magnification is claimed');
    // Toggles exist only for the parts buildModel draws; first view is see-through with the trailing edge off.
    const parts=['skin','mainSpar','falseSpar','ribs','stringers','trailing','equipment','fittings'];
    eq($$('[data-mpart]').map(b=>b.dataset.mpart),parts,'one toggle per modelled part');
    ok(/Hiding a part changes only the picture/.test($('#mPartsNote').textContent),'the UI says hiding is visual only');
    const view=w.MetalWingView;
    eq(view.display().skin,'see-through','first view: see-through skin');
    let vis=view.parts();
    for(const k of parts) ok(vis[k].total>0,`${k}: meshes exist in the model (${vis[k].total})`);
    ok(vis.trailing.visible===0&&parts.filter(k=>k!=='trailing').every(k=>vis[k].visible===vis[k].total),'first view shows the structure, equipment and fittings; non-structural trailing edge hidden');
    eq(vis.ribs.total,M.D520.ribs.length,'one rib mesh per rib station');
    eq(vis.stringers.total,2*M.D520.stringer.x.length,'stringer meshes = 2 surfaces × stringers per surface');
    eq(vis.mainSpar.total,3,'main spar = web + upper and lower booms');
    eq(vis.falseSpar.total,1,'false spar = one web');
    // Spar labels from the engine data.
    const labels=$$('#mPartLabels .mw-label').map(l=>l.textContent);
    eq(labels,[`Main (front) spar · ${M.D520.sparX}c`,`False (rear) spar · ${M.D520.falseSparX}c`],'spar labels');
    // Visual only: no input, no result, no solve.
    const R0=w.MetalWingUI.result(), input0=JSON.stringify(w.MetalWingUI.state.input), foot=$('#mFoot').textContent, chip=$('#mChip').textContent;
    for(const k of parts) {
      $(`[data-mpart="${k}"]`).click();
      vis=view.parts();
      const want=k==='trailing'?vis[k].total:0;                  // trailing starts hidden, so the click shows it
      ok(vis[k].visible===want,`${k} toggle changes only that part (${JSON.stringify(vis[k])})`);
      ok(w.MetalWingUI.result()===R0&&JSON.stringify(w.MetalWingUI.state.input)===input0&&$('#mFoot').textContent===foot&&$('#mChip').textContent===chip,`${k} toggle: same inputs, same result object, no new solve`);
      $(`[data-mpart="${k}"]`).click();
    }
    $('[data-mskin="cutaway"]').click();vis=view.parts();ok(vis.skin.visible===vis.skin.total-1,'upper skin off: lower skin stays');
    $('[data-mshow="frame"]').click();vis=view.parts();ok(vis.skin.visible===0&&vis.equipment.visible===0&&vis.ribs.visible===vis.ribs.total,'spar, ribs, stringers quick view');
    $('[data-mshow="all"]').click();vis=view.parts();ok(parts.every(k=>vis[k].visible===vis[k].total)&&view.display().skin==='opaque','complete wing quick view');
    ok(w.MetalWingUI.result()===R0&&JSON.stringify(w.MetalWingUI.state.input)===input0,'quick views and skin modes leave inputs and results unchanged');
    for(const id of ['mZoomIn','mZoomOut','mZoomFit','mZoomReset']) $('#'+id).click();
    ok(w.MetalWingUI.result()===R0,'zoom buttons leave the result unchanged');
    // Inventory = engine data, with the status of each item from E.D520.sources.
    const count=k=>+$(`#mInventory [data-minv-count="${k}"]`).textContent, tags=k=>$$(`#mInventory [data-minv-tag="${k}"]`).map(t=>t.textContent), doc=k=>$(`#mInventory [data-minv-doc="${k}"]`).textContent;
    eq(count('ribs'),M.D520.ribs.length,'inventory: ribs');
    ok(M.D520.ribs.every(y=>$('#mInventory [data-minv="ribs"]').textContent.includes(y.toFixed(2))),'inventory lists every rib station');
    eq(count('stringers'),M.D520.stringer.x.length,'inventory: stringers per surface');
    eq(count('zones'),M.D520.zones.length,'inventory: gauge zones');
    eq([count('mainSpar'),count('falseSpar'),count('booms')],[1,1,2],'inventory: one main spar, one false spar, two booms');
    ok($('#mInventory [data-minv="mainSpar"]').textContent.includes(`${M.D520.sparX}c`)&&$('#mInventory [data-minv="falseSpar"]').textContent.includes(`${M.D520.falseSparX}c`),'spar chord positions from the engine');
    ok($('#mInventory [data-minv="fittings"]').textContent.includes(`y = ${M.D520.fittingY} m`),'fitting station from the engine');
    const R1=w.MetalWingUI.result();
    ok(R1.zones.every(z=>$('#mInventory [data-minv="booms"]').textContent.includes((z.area*1e6).toFixed(0))),'boom areas by zone from the solved model');
    const statusOf=re=>[...new Set((M.D520.sources.find(([a])=>re.test(a))[1].match(/\b(PRINTED|SCALED|EXTERNAL|GUESS)\b/g)))];
    eq(tags('ribs'),statusOf(/^Rib stations/),'rib status from the source table');
    eq(tags('planform'),statusOf(/^Span/),'planform status');
    eq(tags('equipment'),statusOf(/^Fuel/),'equipment status');
    eq(tags('material'),statusOf(/duralumin/),'material status');
    ok(tags('stringers').includes('NOT LISTED')&&tags('fittings').includes('NOT LISTED')&&tags('wheelWell').includes('NOT LISTED'),'items without a source row are marked NOT LISTED');
    ok(/^Yes, for the values named in the source line/.test(doc('ribs'))&&/assumption/.test(doc('stringers'))&&/Partly/.test(doc('booms'))&&/outside reference/.test(doc('material'))&&/Not stated in the source table/.test(doc('fittings')),'modelled is kept apart from documented in the manual');
    const rows=view.inventory();
    eq(rows.find(r=>r.key==='ribs').count,M.D520.ribs.length,'inventory() hook: ribs');
    eq(rows.find(r=>r.key==='stringers').count,M.D520.stringer.x.length,'inventory() hook: stringers');
    console.log(`D.520: ${checks-before} checks passed (input column and containers, see-through first view, part toggles visual-only, quick views, skin modes, spar labels, zoom, inventory = engine data with source status).`);
  } finally {dom.window.close();}
}
