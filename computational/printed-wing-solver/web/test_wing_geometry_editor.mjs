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
 const independent=open();ok(independent.$('wgtSimpleAngles').hidden);independent.$('wgtSections').checked=true;independent.$('wgtSections').dispatchEvent(new independent.w.Event('change'));independent.change('wgtStation1Kind','naca23012');independent.submit();eq(independent.state().twistEnabled,false);eq(independent.state().stations[1].airfoil.code,'23012');ok(independent.state().stations.every(s=>s.incidenceDeg===0),'section airfoils work independently of incidence');
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
 u.$('wgtSections').checked=false;u.$('wgtSections').dispatchEvent(new u.w.Event('change'));eq(u.$('wgtSections').checked,true,'cannot remove needed incidence stations');
 const beforeOff=u.raw(),profilesBeforeOff=JSON.stringify(u.state().stations.map(s=>s.airfoil));u.change('wgtTwist','no');eq(u.$('wgtTwist').value,'no');eq(u.raw(),beforeOff,'zero-angle selection remains a draft');eq(u.$('wgtZeroAngles'),null);u.submit();ok(u.state().stations.every(s=>s.incidenceDeg===0));eq(u.state().twistEnabled,false);eq(JSON.stringify(u.state().stations.map(s=>s.airfoil)),profilesBeforeOff,'zeroing angles retains section profiles');
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
 const segmentation=open();segmentation.change('wgtModules',3);eq(segmentation.state().modules,1,'module choice remains draft');segmentation.submit();eq(segmentation.state().modules,3,'popup module count applies through geometry validation');
 const dims=open({rootChord:160,tipChord:100,rodFractions:[.3],modules:3});
 const concise=open({rootChord:120,tipChord:72});eq(concise.$('wgtPlanformPreview'),null,'redundant planform schematic is removed');ok(concise.$('wgtTaper').readOnly);ok(!concise.$('wgtTipChord').readOnly);
 const input=(id,value)=>{dims.$(id).value=String(value);dims.$(id).dispatchEvent(new dims.w.Event('input',{bubbles:true}));};
 input('wgtRootChord',120);eq(dims.$('wgtTaper').value,'0.83333333');
 dims.change('wgtChordMode','ratio');ok(dims.$('wgtTipChord').readOnly);ok(!dims.$('wgtTaper').readOnly);
 input('wgtTaper',.5);eq(dims.$('wgtTipChord').value,'60');input('wgtRootChord',200);eq(dims.$('wgtTipChord').value,'100','ratio mode preserves lambda when root changes');eq(dims.$('wgtTaper').value,'0.5');input('wgtRootChord',120);
 dims.submit();eq(dims.state().rootChord,120);eq(dims.state().tipChord,60);ok(!E.analysisCapability(dims.state(),E.DEFAULT_ASSEMBLY).requires3D,'uniform NACA4 picker does not upgrade a legacy rod geometry');eq(dims.d.querySelector('#wgtPlanformPreview'),null);
 const dimBefore=dims.raw();input('wgtTaper',1.2);dims.submit();eq(dims.raw(),dimBefore,'invalid taper is atomic');dims.ui.refresh();eq(dims.$('wgtChordMode').value,'ratio');dims.change('wgtChordMode','tip');input('wgtTipChord',90);eq(dims.$('wgtTaper').value,'0.75');dims.submit();eq(dims.state().tipChord,90);
 // Beginner root/tip controls interpolate angles without altering section profiles.
 const simple=open();simple.change('wgtTwist','yes');eq(simple.$('wgtAdvancedSections'),null);ok(simple.$('wgtSpanwiseProfiles'));eq(simple.$('wgtSections').closest('details'),null);ok(!simple.$('wgtSimpleAngles').hidden);
 const editAngle=(id,value)=>{simple.$(id).value=String(value);simple.$(id).dispatchEvent(new simple.w.Event('input',{bubbles:true}));};
 editAngle('wgtRootInc',2);editAngle('wgtTipInc',0);eq(simple.$('wgtInc1').value,'1');ok(/2° washout/.test(simple.$('wgtTwistSummary').textContent));eq(simple.count(),0,'quick editing stays draft');
 simple.$('wgtRootInc').value='4';simple.submit();eq(simple.state().stations[0].incidenceDeg,4,'Enter without blur uses the typed root angle');eq(simple.state().stations[1].incidenceDeg,2);eq(simple.state().stations[2].incidenceDeg,0);
 editAngle('wgtTipInc',4);ok(/no spanwise geometric twist/.test(simple.$('wgtTwistSummary').textContent));
 const validSimple=simple.raw();simple.$('wgtRootInc').value='';simple.submit();eq(simple.raw(),validSimple,'blank quick angle cannot be applied');
 const custom=open({twistEnabled:true,stations:[{eta:0,airfoil:{kind:'naca4',code:'4415'},incidenceDeg:3},{eta:.5,airfoil:{kind:'naca5',code:'23012'},incidenceDeg:2},{eta:1,airfoil:{kind:'naca4',code:'2412'},incidenceDeg:0}]});
 ok(custom.$('wgtSpanwiseProfiles'));eq(custom.$('wgtAdvancedSections'),null);ok(custom.$('wgtRootInc').readOnly);custom.submit();eq(custom.state().stations[1].incidenceDeg,2,'imported nonlinear incidence is preserved');
 const oldProfiles=JSON.stringify(custom.state().stations.map(s=>s.airfoil));const appliedBeforeLinear=custom.count();custom.$('wgtLinearAngles').click();eq(custom.count(),appliedBeforeLinear,'linear conversion requires Apply');custom.submit();eq(custom.state().stations[1].incidenceDeg,1.5);eq(JSON.stringify(custom.state().stations.map(s=>s.airfoil)),oldProfiles,'linear conversion retains root middle and tip airfoils');
 console.log(`Wing geometry editor: ${checks} family/library, simple root/tip angles, custom-station preservation, atomic validation, real DAT upload, provenance and Enter checks passed.`);
}finally{for(const v of opened)v.dom.window.close();}
