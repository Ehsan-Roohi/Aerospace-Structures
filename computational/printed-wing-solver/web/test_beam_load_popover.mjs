import assert from 'node:assert/strict';
import {loadBeamLab,configureBlankBeam,JSDOM} from './beam_test_dom.mjs';
const dom=new JSDOM('<div id="foundations"></div>',{runScripts:'outside-only'}),{w,$}=loadBeamLab(dom);
const enter=s=>$(s).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
try{
 configureBlankBeam(dom);$('#beamleftSupport').value='fixed';$('#beamSolve').click();
 $('#beamLoadA').value='225';$('#beamP').value='2';$('#beamLoadForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 $('#beamPicture [data-load-handle="0"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 assert.equal($('#beamLoadEditor').hidden,false);assert.equal($('#beamLoadEditor').getAttribute('role'),'dialog');assert.ok($('#beamLoadEditor').contains($('#beamLoadForm')));assert.equal(w.document.activeElement,$('#beamP'));
 $('#beamP').value='3';enter('#beamP');assert.equal(w.BeamLab.state().model.loads.length,1);assert.equal(w.BeamLab.state().model.loads[0].force,3);assert.equal($('#beamLoadEditor').hidden,true);assert.ok($('#beamLoadFormHome').contains($('#beamLoadForm')));
 $('#beamPicture [data-load-handle="0"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('#beamP').value='99';$('#beamP').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal($('#beamLoadEditor').hidden,true);assert.equal(w.BeamLab.state().model.loads[0].force,3);
 // Pointer capture retargets the browser's click to the picture, not the handle.
 $('#beamPicture svg').getBoundingClientRect=()=>({left:100,top:100,width:800,height:220});
 $('#beamPicture [data-load-handle="0"]').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:500,clientY:180}));
 $('#beamPicture').dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,button:0,clientX:500,clientY:180}));
 assert.equal($('#beamLoadEditor').hidden,false,'a real pointer tap opens the editor even when click is retargeted');
 $('#beamPicture').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal($('#beamLoadEditor').hidden,false);$('#beamLoadEditorClose').click();
 // Synthetic screen geometry drives the same graphical-placement click as the browser.
 let svg=$('#beamPicture svg');svg.getBoundingClientRect=()=>({left:100,top:100,width:800,height:220});
 $('[data-place="load:point"]').click();svg=$('#beamPicture svg');svg.getBoundingClientRect=()=>({left:100,top:100,width:800,height:220});
 const W=+svg.dataset.w,x0=+svg.dataset.x0,x1=+svg.dataset.x1;
 svg.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:100+(x0+(x1-x0)/3)/W*800,clientY:180}));
 assert.equal($('#beamLoadEditor').hidden,false);assert.equal(w.document.activeElement,$('#beamP'));assert.equal(w.BeamLab.state().model.loads.length,1,'picking a position never applies a default load');
 $('#beamP').value='-1';enter('#beamP');assert.equal(w.BeamLab.state().model.loads.length,2);assert.equal(w.BeamLab.state().model.loads[1].force,-1);assert.equal($('#beamLoadEditor').hidden,true);
 $('#beamPicture [data-load-handle="1"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));$('#beamEditorDelete').click();assert.equal(w.BeamLab.state().model.loads.length,1);assert.equal($('#beamLoadEditor').hidden,true);
 console.log('Beam popover PASS: graphical station picker and applied-load click, compact form transfer, Enter add/update, Escape preserves force, selective delete closes, no default load.');
}finally{dom.window.close();}
