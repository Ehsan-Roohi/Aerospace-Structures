// Per-picker DAT reads must never replace a more recent selection or a rebuilt editor.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom'),E=require('./engine.js'),UI=require('./wing_geometry_ui.js');
const clone=x=>JSON.parse(JSON.stringify(x)),dat='Uploaded profile\n1 .01\n.5 .10\n0 0\n.5 -.08\n1 -.01\n';
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const tick=()=>new Promise(r=>setTimeout(r,0));
for(const canAbort of [true,false]){
 const dom=new JSDOM('<div id="host"></div>'),w=dom.window,d=w.document,readers=[];let state=clone(E.makeGeometry({modules:1,rodFractions:[],spars:[]})),applied=0;
 w.FileReader=class{readAsText(file){this.file=file;readers.push(this);}abort(){if(!canAbort)throw Error('No abort');this.onabort?.();}finish(text=dat){this.result=text;this.onload?.();}fail(){this.onerror?.();}};
 const ui=UI.mount(d.querySelector('#host'),{getGeometry:()=>state,applyGeometry:patch=>{try{const g=E.makeGeometry({...state,...patch});state=clone(g);applied++;return{ok:true};}catch(e){return{ok:false,error:e.message};}},documentRef:d});ui.refresh();
 const $=id=>d.querySelector('#'+id),change=(id,value)=>{const n=$(id);n.value=String(value);n.dispatchEvent(new w.Event('change',{bubbles:true}));},submit=()=>ui.form.dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
 const upload=(id,name)=>{const input=$(id);Object.defineProperty(input,'files',{configurable:true,value:[{name,size:dat.length}]});input.dispatchEvent(new w.Event('change',{bubbles:true}));return readers.at(-1);};
 try{
  const old=upload('wgtDefaultDat','older.dat'),newer=upload('wgtDefaultDat','newer.dat');const before=JSON.stringify(state);submit();eq(JSON.stringify(state),before);ok(/Wait until/.test(ui.notice.textContent),'current read blocks Apply');
  newer.finish();await tick();old.finish();await tick();ok(/Read newer.dat/.test(ui.notice.textContent),'old completion cannot replace latest status/profile');submit();eq(state.airfoil.source.filename,'newer.dat');
  const a=upload('wgtDefaultDat','before-library.dat');change('wgtDefaultKind','naca23012');a.fail();await tick();ok(/selected in the draft/.test(ui.notice.textContent),'stale read errors cannot overwrite selection status');submit();eq(state.airfoil.code,'23012');eq(state.airfoil.kind,'naca5');
  const b=upload('wgtDefaultDat','before-code.dat');$('wgtDefaultCode').value='4415';$('wgtDefaultCode').dispatchEvent(new w.Event('input'));submit();eq(state.airfoil.code,'4415','typing a code cancels obsolete read without requiring blur');b.finish();await tick();submit();eq(state.airfoil.code,'4415');
  const c=upload('wgtDefaultDat','before-refresh.dat');ui.refresh();const n=applied;submit();eq(applied,n+1,'obsolete non-abortable read cannot leave Apply permanently blocked');c.fail();await tick();ok(/Geometry applied/.test(ui.notice.textContent));
  const bad=upload('wgtDefaultDat','current-bad.dat');bad.finish('broken DAT');await tick();eq(ui.notice.getAttribute('role'),'alert');submit();ok(/Geometry applied/.test(ui.notice.textContent),'finished invalid read clears pending flag, leaving valid previous draft');
  change('wgtTwist','yes');
  const root=upload('wgtStation0Dat','root.dat'),tip=upload('wgtStation2Dat','tip.dat');root.finish();await tick();const n2=applied;submit();eq(applied,n2,'one finished station must not clear another active station');tip.finish();await tick();submit();eq(state.stations[0].airfoil.source.filename,'root.dat');eq(state.stations[2].airfoil.source.filename,'tip.dat','independent station reads both survive');
  const removed=upload('wgtStation1Dat','removed-mid.dat');d.querySelectorAll('.wing-station-card')[1].querySelector('[data-remove-station]').click();removed.finish();await tick();submit();eq(state.stations.length,2);ok(!JSON.stringify(state).includes('removed-mid.dat'),'removed picker callback cannot mutate shifted station');
  const pendingRoot=upload('wgtStation0Dat','cancelled-root.dat');change('wgtDefaultKind','naca0012');const n3=applied;submit();eq(applied,n3,'default picker changes must not cancel independent active station');pendingRoot.finish();await tick();submit();eq(state.stations[0].airfoil.source.filename,'cancelled-root.dat');eq(state.airfoil.code,'0012');
  const cancelledByRender=upload('wgtStation0Dat','before-render.dat');$('wgtAddStation').click();const n4=applied;submit();eq(applied,n4+1,'full re-render cancels obsolete readers immediately');cancelledByRender.fail();await tick();ok(/Geometry applied/.test(ui.notice.textContent));ok(!JSON.stringify(state).includes('before-render.dat'));
 }finally{dom.window.close();}
}
console.log(`Wing DAT upload races PASS: ${checks} per-picker supersession, code/library cancellation, independent stations, errors, remove/render/refresh and Apply guards.`);
