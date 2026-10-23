// Real geometry engine + airfoil parser + JSDOM FileReader. No generated page
// or WebGL stubs: this tests the atomic editor contract directly.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.MIE446_JSDOM_MODULE||'jsdom'),A=require('./wing_airfoils.js'),E=require('./engine.js'),UI=require('./wing_geometry_ui.js');
let checks=0;const eq=(a,b,label)=>{assert.equal(a,b,label);checks++;},ok=(v,label)=>{assert.ok(v,label);checks++;};
const clone=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){const end=Date.now()+3000;while(!fn()){assert.ok(Date.now()<end,'timed out reading airfoil');await tick();}}
function setup(initial={}){
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>'),w=dom.window,d=w.document;
 let state=clone(E.makeGeometry({rodFractions:[],spars:[],modules:1,...initial})),applied=0,attempts=0;
 const ui=UI.mount(d.querySelector('#host'),{getGeometry:()=>state,applyGeometry:patch=>{attempts++;try{const validated=E.makeGeometry({...state,...patch});state=clone(validated);applied++;return {ok:true};}catch(e){return {ok:false,error:e.message};}},documentRef:d});ui.refresh();
 const $=id=>d.querySelector('#'+id),change=(id,value)=>{const n=$(id);n.value=String(value);n.dispatchEvent(new w.Event('change',{bubbles:true}));return n;},submit=()=>ui.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return {dom,w,d,ui,$,change,submit,state:()=>state,count:()=>applied,attempts:()=>attempts,raw:()=>JSON.stringify(state)};
}
const opened=[];const open=g=>{const v=setup(g);opened.push(v);return v;};
try{
 const u=open();eq(u.$('wgtTwist').value,'no');eq(u.$('wgtSections').checked,false);eq(u.state().stations,undefined);
 u.change('wgtDefaultKind','naca5');eq(u.$('wgtDefaultCode').value,'23012');eq(u.state().airfoil,undefined,'family selection stays a draft');u.submit();eq(u.state().airfoil.kind,'naca5');eq(u.state().airfoil.code,'23012');
 u.change('wgtDefaultCode','24015');u.submit();eq(u.state().airfoil.code,'24015');
 u.change('wgtDefaultKind','naca4');u.change('wgtDefaultCode','4415');u.submit();eq(u.state().naca,'4415');ok(!u.state().airfoil,'uniform untwisted NACA4 keeps the legacy construction');
 u.change('wgtDefaultKind','sc20412');ok(u.$('wgtDefaultCode').disabled);ok(u.d.querySelector('[data-profile-source]').textContent.includes('/sc20412.dat'));u.submit();
 assert.deepEqual(u.state().airfoil,JSON.parse(JSON.stringify(A.preset('sc20412'))));checks++;eq(u.state().airfoil.upper.length,161);eq(u.state().airfoil.source.normalization,'unit-chord');
 // The student's intended on/off decision precedes station entry. Enabling
 // twist produces editable root/middle/tip; their eta limits are not editable.
 u.change('wgtTwist','yes');eq(u.$('wgtSections').checked,true);ok(u.$('wgtEta0').readOnly);ok(u.$('wgtEta2').readOnly);eq(u.$('wgtEta1').value,'0.5');
 u.change('wgtInc0',3);u.change('wgtInc1',1);u.change('wgtInc2',-2);u.change('wgtStation0Kind','naca2412');u.change('wgtStation1Kind','naca23012');u.change('wgtStation2Kind','naca0012');
 u.submit();eq(u.state().stations.length,3);eq(u.state().stations[1].airfoil.kind,'naca5');eq(u.state().stations[2].incidenceDeg,-2);eq(u.state().twistEnabled,true);
 const beforeOff=u.raw();u.change('wgtTwist','no');eq(u.$('wgtTwist').value,'yes');ok(/zero|0°/.test(u.ui.notice.textContent));eq(u.raw(),beforeOff,'turning twist off cannot silently discard committed angles');
 u.$('wgtSections').checked=false;u.$('wgtSections').dispatchEvent(new u.w.Event('change'));eq(u.$('wgtSections').checked,true,'cannot remove needed incidence stations');
 u.$('wgtZeroAngles').click();eq(u.$('wgtTwist').value,'no');u.submit();ok(u.state().stations.every(s=>s.incidenceDeg===0));eq(u.state().twistEnabled,false);
 // Additions split the largest gap, remain strictly ordered and are limited
 // to nine; root/tip have no removal button.
 while(!u.$('wgtAddStation').disabled)u.$('wgtAddStation').click();eq(u.d.querySelectorAll('.wing-station-card').length,9);u.submit();eq(u.state().stations.length,9);ok(u.state().stations.every((s,i,a)=>!i||s.eta>a[i-1].eta));
 const cards=u.d.querySelectorAll('.wing-station-card');eq(cards[0].querySelector('[data-remove-station]'),null);eq(cards[8].querySelector('[data-remove-station]'),null);cards[3].querySelector('[data-remove-station]').click();eq(u.d.querySelectorAll('.wing-station-card').length,8);u.submit();eq(u.state().stations.length,8);
 // Duplicate station eta, infinity/out-of-range values and failed host
 // validation never partially change sweep, airfoil or the current wing.
 const stable=u.raw();u.change('wgtEta1',0);u.change('wgtSweep',22);u.submit();eq(u.raw(),stable);eq(u.ui.notice.getAttribute('role'),'alert');u.ui.refresh();
 for(const [id,value]of [['wgtSweep',61],['wgtDihedral',46],['wgtSweepRef',1.01],['wgtTwistRef',-.01]]){const prior=u.raw();u.change(id,value);u.submit();eq(u.raw(),prior,id+' fails atomically');u.ui.refresh();}
 u.change('wgtSweep',18);u.change('wgtDihedral',7);u.change('wgtSweepRef',.25);u.change('wgtTwistRef',.3);u.submit();eq(u.state().sweepDeg,18);eq(u.state().dihedralDeg,7);eq(u.state().sweepReferenceFraction,.25);eq(u.state().twistReferenceFraction,.3);
 // A genuine browser FileReader reads a File selected by the input. Current
 // host state cannot change on read success/error; only Apply commits.
 const dat='Example uploaded foil\n1 .01\n.5 .1\n0 0\n.5 -.05\n1 -.01\n';
 const upload=async(text,name)=>{const input=u.$('wgtDefaultDat'),file=new u.w.File([text],name,{type:'text/plain'});Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new u.w.Event('change',{bubbles:true}));await until(()=>!/Reading /.test(u.ui.notice.textContent));};
 const beforeRead=u.raw();await upload(dat,'student-section.dat');eq(u.raw(),beforeRead);ok(/Read student-section/.test(u.ui.notice.textContent));u.submit();eq(u.state().airfoil.kind,'coordinates');eq(u.state().airfoil.source.filename,'student-section.dat');eq(u.state().airfoil.source.format,'selig');eq(u.state().airfoil.upper.length,161);
 const beforeBad=u.raw();await upload('Broken foil\n1 0\nNaN nope','bad.dat');eq(u.raw(),beforeBad);eq(u.ui.notice.getAttribute('role'),'alert');
 // Invalid code must remain an unapplied, rejected edit, not a success using
 // the previous valid hidden draft while displaying the student's invalid code.
 const badCode=open();badCode.change('wgtDefaultKind','naca4');badCode.change('wgtDefaultCode','99x99');badCode.change('wgtSweep',12);const beforeInvalid=badCode.raw(),accepted=badCode.count();badCode.submit();eq(badCode.raw(),beforeInvalid,'invalid visible NACA code blocks the entire apply');eq(badCode.count(),accepted);eq(badCode.ui.notice.getAttribute('role'),'alert');
 // Enter requests form submission. Values in the actual DOM at submission,
 // even before a blur/change event, are the user's authoritative input.
 const enter=open();enter.$('wgtSweep').value='13.5';enter.$('wgtSweep').dispatchEvent(new enter.w.Event('input',{bubbles:true}));enter.$('wgtSweep').dispatchEvent(new enter.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));enter.ui.form.requestSubmit();eq(enter.state().sweepDeg,13.5,'Enter applies the value that is visibly typed');eq(enter.count(),1);
 const dims=open({rootChord:160,tipChord:100,rodFractions:[.3],modules:3});
 const concise=open({rootChord:120,tipChord:72});eq(concise.$('wgtPlanformPreview').querySelector('svg text').textContent,'Root → tip · λ = 0.600','planform caption omits the redundant chord calculation');
 const input=(id,value)=>{dims.$(id).value=String(value);dims.$(id).dispatchEvent(new dims.w.Event('input',{bubbles:true}));};
 input('wgtRootChord',120);eq(dims.$('wgtTaper').value,'0.83333333');input('wgtTaper',.5);eq(dims.$('wgtTipChord').value,'60');dims.submit();eq(dims.state().rootChord,120);eq(dims.state().tipChord,60);ok(!E.analysisCapability(dims.state(),E.DEFAULT_ASSEMBLY).requires3D,'uniform NACA4 picker does not upgrade a legacy rod geometry');ok(dims.d.querySelector('#wgtPlanformPreview svg').getAttribute('aria-label').includes('tip chord 60'));
 const dimBefore=dims.raw();input('wgtTaper',1.2);dims.submit();eq(dims.raw(),dimBefore,'invalid taper is atomic');dims.ui.refresh();input('wgtTipChord',90);eq(dims.$('wgtTaper').value,'0.75');dims.submit();eq(dims.state().tipChord,90);
 console.log(`Wing geometry editor: ${checks} family/library, twist/stations, atomic validation, real DAT upload, provenance and Enter checks passed.`);
}finally{for(const v of opened)v.dom.window.close();}
