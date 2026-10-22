import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom');
const dom=new JSDOM(readFileSync(new URL('./truss_lab_template.html',import.meta.url),'utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document,$=s=>d.querySelector(s);
Object.defineProperties(w,{innerWidth:{value:900,writable:true},innerHeight:{value:700,writable:true}});
for(const f of ['truss_engine.js','truss_ui.js'])vm.runInContext(readFileSync(new URL(f,import.meta.url),'utf8'),dom.getInternalVMContext());
let checks=0;const eq=(a,b,m)=>{assert.equal(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const popup=$('#trussLoadEditor'),heading=$('#forceNode');let width=310,height=360,captured=null,released=0;
popup.getBoundingClientRect=()=>{const left=parseFloat(popup.style.left)||0,top=parseFloat(popup.style.top)||0;return {left,top,right:left+width,bottom:top+height,width,height};};
heading.setPointerCapture=id=>{captured=id;};heading.hasPointerCapture=id=>captured===id;heading.releasePointerCapture=()=>{captured=null;released++;};
const point=(target,type,x,y,{id=1,pointerType='mouse',button=0,isPrimary=true}={})=>{const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button});for(const[k,v]of Object.entries({pointerId:id,pointerType,isPrimary}))Object.defineProperty(e,k,{value:v});target.dispatchEvent(e);return e;};
const location=()=>[parseFloat(popup.style.left),parseFloat(popup.style.top)];
const sameLocation=(a,m)=>{eq(location()[0],a[0],m);eq(location()[1],a[1],m);};
const open=()=>{$('[data-tool="force"]').click();$('#trussCanvas [data-node="2"] circle').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
try{
 w.TrussLab.setModel({nodes:[{id:1,x:0,y:0,support:'pin',fx:0,fy:0},{id:2,x:100,y:0,support:'rollerY',fx:3,fy:-4}],members:[{a:1,b:2,E:200000,A:100}]});
 open();eq(popup.hidden,false);ok(/forceHeading\.style\.cssText='[^']*touch-action:none/.test(readFileSync(new URL('./truss_ui.js',import.meta.url),'utf8')),'the drag handle disables browser touch panning (JSDOM does not implement touch-action)');eq(heading.style.cursor,'move');ok(/Drag/.test(heading.title));
 const initial=location(),before=JSON.stringify(w.TrussLab.state().model),history=w.TrussLab.state().historyLength;
 const down=point(heading,'pointerdown',20,30);eq(down.defaultPrevented,true);eq(captured,1);
 point(d,'pointermove',120,100);sameLocation([initial[0]+100,initial[1]+70],'mouse drag moves only the popup');
 point(d,'pointermove',500,500,{id:99});sameLocation([initial[0]+100,initial[1]+70],'a second pointer cannot hijack the active drag');
 point(d,'pointerup',120,100);eq(captured,null);eq(released,1);const moved=location();
 point(d,'pointermove',150,180);sameLocation(moved,'released drag stops');w.dispatchEvent(new w.Event('scroll'));sameLocation(moved,'scroll does not re-anchor a manually positioned popup');
 eq(JSON.stringify(w.TrussLab.state().model),before);eq(w.TrussLab.state().historyLength,history,'moving the popup is not a model edit');
 for(const target of [$('#forceX'),$('#forceDirection'),$('#forceForm button')]){point(target,'pointerdown',20,30);point(d,'pointermove',200,250);point(d,'pointerup',200,250);sameLocation(moved,'inputs/selects/buttons do not initiate a drag');}
 point(heading,'pointerdown',20,30,{button:2});point(d,'pointermove',250,250);sameLocation(moved,'right mouse button does not drag');
 point(heading,'pointerdown',20,30,{id:2,pointerType:'touch',isPrimary:false});point(d,'pointermove',250,250,{id:2,pointerType:'touch'});sameLocation(moved,'secondary touch does not start a drag');
 point(heading,'pointerdown',20,30,{id:3,pointerType:'touch'});point(d,'pointermove',9999,9999,{id:3,pointerType:'touch'});sameLocation([582,332],'touch drag clamps at lower/right viewport gutters');
 point(d,'pointermove',-9999,-9999,{id:3,pointerType:'touch'});sameLocation([8,8],'touch drag clamps at upper/left gutters');
 point(d,'pointercancel',-9999,-9999,{id:3,pointerType:'touch'});point(d,'pointermove',100,100,{id:3,pointerType:'touch'});sameLocation([8,8],'pointer cancellation ends drag without changing the force');
 point(heading,'pointerdown',10,10,{id:4});point(d,'pointermove',450,250,{id:4});point(heading,'lostpointercapture',450,250,{id:4});const lost=location();point(d,'pointermove',600,350,{id:4});sameLocation(lost,'lost capture ends drag');
 w.innerWidth=390;w.innerHeight=600;w.dispatchEvent(new w.Event('resize'));sameLocation([72,232],'resize clamps the existing manual location to a phone viewport');
 height=430;$('#forceDirection').value='angle';$('#forceDirection').dispatchEvent(new w.Event('change'));sameLocation([72,162],'changing force-entry mode reclamps rather than re-anchoring');
 $('#forceAngle').value='80';point(heading,'pointerdown',10,10,{id:5});heading.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));eq(popup.hidden,true);point(d,'pointermove',200,200,{id:5});eq(JSON.stringify(w.TrussLab.state().model),before,'Escape while dragging does not apply a draft force');
 open();sameLocation([10,8],'reopening anchors near the selected node instead of inheriting a previous node position');
 $('#forceDirection').value='custom';$('#forceDirection').dispatchEvent(new w.Event('change'));$('#forceX').value='30';$('#forceY').value='-40';point(heading,'pointerdown',10,10,{id:6});point(d,'pointermove',40,50,{id:6});point(d,'pointerup',40,50,{id:6});
 $('#forceY').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));eq(popup.hidden,true);eq(w.TrussLab.state().model.nodes[1].fx,30);eq(w.TrussLab.state().model.nodes[1].fy,-40);eq(w.TrussLab.state().historyLength,history+1,'Enter still applies the force exactly once after a drag');
 console.log(`Truss force drag PASS: ${checks} mouse/touch, viewport clamps, scroll/resize, mode change, pointer ownership/cancel/lost capture, input exclusion and Enter/Escape checks.`);
}finally{dom.window.close();}
