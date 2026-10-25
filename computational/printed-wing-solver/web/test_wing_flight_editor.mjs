import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom'),UI=require('./wing_loads_ui.js'),E=require('./engine.js');
const dom=new JSDOM('<div id="host"></div>'),w=dom.window,host=w.document.querySelector('#host');
let state={kind:'custom',items:[]},applied=0;
const values=()=>state.kind==='flight'?state:{aircraftMass:.2,loadFactor:1,distribution:'elliptic',liftFraction:.25,inertiaRelief:false};
const ids={form:'f',kind:'k',a:'a',b:'b',P:'p',q0:'q0',q1:'q1',shape:'shape',basis:'basis',value:'v',xc:'xc',law:'law',list:'list',clear:'clear',flight:'flight',status:'status',chord:'chord',csv:'csv'};
const editor=UI.mount(host,{workspace:'printed',units:{length:'mm',line:'N/mm',force:'N',moment:'N·mm'},ids,kindValue:{},deleteAttr:'data-delete-load',range:()=>({min:0,max:450}),items:()=>state.kind==='custom'?state.items:[],mode:()=>state.kind,validate:items=>E.normalize({load:{kind:'custom',items}}),apply:items=>{state={kind:'custom',items};applied++;},flight:{configure:true,values,validate:v=>E.normalize({load:v}),apply:v=>{state={...E.DEFAULT_LOAD,...v};applied++;}},allowSchrenk:true,refStation:0,refLabel:'root',section:()=>null,defaults:{a:100,b:450,P:1,q0:.004,q1:.004,total:1,xc:.25}});
const $=id=>w.document.getElementById(id),change=(id,v)=>{$(id).value=String(v);$(id).dispatchEvent(new w.Event('change',{bubbles:true}));},input=(id,v)=>{$(id).value=String(v);$(id).dispatchEvent(new w.Event('input',{bubbles:true}));},submit=()=>$('f').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert.ok([...$('k').options].some(o=>o.value==='flight'));assert.equal($('flight'),null,'no separate after-the-list flight button');
change('k','flight');assert.equal(applied,0);assert.equal(host.querySelector('.wle-flight').hidden,false);assert.match(host.querySelector('.wle-live-preview').textContent,/0.981 N/);
assert.equal($('p').disabled,true);input('flightInputN',2);assert.match(host.querySelector('.wle-live-preview').textContent,/1.962 N/);assert.equal(applied,0);
input('flightInputMass','');submit();assert.equal(applied,0,'invalid lift leaves current loads unchanged');input('flightInputMass',.2);input('flightInputN',1);submit();assert.equal(state.kind,'flight');assert.equal(applied,1);assert.equal(state.inertiaRelief,false);assert.equal(state.liftFraction,.25);
const solved=E.solve({load:state,nElements:8,nSections:3,nGrid:11});assert.ok(Math.abs(solved.liftN-.981)<1e-10);
change('k','point');input('p',2);submit();assert.equal(state.kind,'custom');assert.equal(state.items.length,1);assert.equal(state.items[0].force,2,'custom load deliberately replaces flight case');
state={...E.DEFAULT_LOAD,kind:'flight',aircraftMass:.4,loadFactor:3,distribution:'tip'};editor.openFlight();assert.equal($('flightInputShape').value,'tip');assert.equal($('flightInputMass').value,'0.4');assert.equal($('flightInputN').value,'3');
// An imported legacy flight case may have inertia relief on: spatial UI must
// show its supported value explicitly and prevent reselecting the invalid option.
state={...E.DEFAULT_LOAD,kind:'flight',aircraftMass:1,loadFactor:1,inertiaRelief:true};
const blocked=UI.mount(w.document.createElement('div'),{workspace:'printed',units:{length:'mm',line:'N/mm',force:'N',moment:'N·mm'},ids,kindValue:{},deleteAttr:'data-delete-load',range:()=>({min:0,max:450}),items:()=>[],mode:()=>state.kind,apply(){},flight:{configure:true,allowInertiaRelief:()=>false,values:()=>state,validate:v=>{assert.equal(v.inertiaRelief,false);},apply:v=>{state=v;}},allowSchrenk:true,refStation:0,refLabel:'root',section:()=>null,defaults:{a:100,b:450,P:1,q0:.004,q1:.004,total:1,xc:.25}});
blocked.openFlight();const relief=blocked.container.querySelector('#flightInputRelief');assert.equal(relief.value,'false');assert.equal(relief.disabled,true);assert.equal(relief.closest('.field').hidden,true,'unsupported inertia relief is hidden');assert.equal(relief.querySelector('option[value="true"]').disabled,true);blocked.container.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(state.inertiaRelief,false);
console.log('PASS: lift is available before solving, preview does not apply loads, 200 g at 1 g gives 0.981 N/half-wing, validation atomic, explicit case replacement, legacy flight settings reopened.');
dom.window.close();
