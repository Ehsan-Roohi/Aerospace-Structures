/* Controller/DOM regression using real saved numerical comparison output.
 * This is not a browser screenshot, WebGL test, or a second flow benchmark. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),repo=path.resolve(app,'../..');
const {JSDOM}=require(path.join(repo,'.review-js/node_modules/jsdom'));
const clone=x=>JSON.parse(JSON.stringify(x));
const comparison=JSON.parse(fs.readFileSync(path.join(repo,'output/design-advisor-review/delta-comparison.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/delta-advisor.json'),'utf8'));
const state=clone(fixture.study);state.mirrorFullWing=state.fabrication.mirrorFullWing;delete state.fabrication;
// Use the exact state stamp saved by the actual solver integration run.
const parts=JSON.parse(comparison.inputStamp);
for(const [i,k]of ['geometry','plaKey','plaOver','rodKey','rodOver','assembly','load','criteria','analysis','aerodynamics','aeroLoad','mirrorFullWing'].entries())state[k]=parts[i];
const dom=new JSDOM('<body><input id="aeroV" value="15"><input id="aeroRho" value="1.225"><input id="aeroAlpha" value="4"></body>',{url:'http://localhost/docs/wing-panel-stress-analyzer/',runScripts:'outside-only'});
const w=dom.window,workers=[],calls=[],downloads=[];let exportedBlob;
w.URL.createObjectURL=b=>{exportedBlob=b;return 'blob:comparison';};w.URL.revokeObjectURL=()=>{};w.Blob=Blob;
w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
class Worker{constructor(url){this.url=String(url);workers.push(this);}postMessage(m){this.message=m;}terminate(){this.terminated=true;}}
w.Worker=Worker;
w.WingLabUI={state:()=>state,isRunning:()=>false,aero:()=>({running:false}),importGate:()=>({open:false}),
 shell:{addStructureSubgroup:g=>{assert.equal(g.id,'wxDesignAdvisor');w.document.body.append(g.node);}},
 applyGeometry:p=>{calls.push(['apply',clone(p)]);Object.assign(state.geometry,clone(p));return {ok:true};},
 solve:async()=>{calls.push(['solve']);}};
w.eval(fs.readFileSync(path.join(app,'ui/wing-design-advisor.js'),'utf8')+'\nwindow.WingDesignAdvisor=WingDesignAdvisor;');
w.eval(fs.readFileSync(path.join(app,'ui/wing-design-advisor-ui.js'),'utf8').replace('__ADVISOR_WORKER_SHA__','test'));
const $=id=>w.document.getElementById(id),start=()=>{$('wdaRun').click();return workers.at(-1);};
const deliver=wk=>wk.onmessage({data:{id:wk.message.id,type:'result',result:clone(comparison)}});
(async()=>{
 let loadRequests=0;w.addEventListener('wing-open-structural-loads',()=>loadRequests++);$('wdaLoads').click();assert.equal(loadRequests,1);
 const original=JSON.stringify(state),first=start();assert.equal($('wdaCancel').disabled,false);assert.match(first.url,/wing-design-advisor-worker/);assert.equal(JSON.stringify(first.message.state),original);
 first.onmessage({data:{id:first.message.id,type:'progress',completed:1,total:11,label:'Skin 1.4 mm'}});assert.match($('wdaStatus').textContent,/Testing 2 of 11/);
 deliver(first);assert.equal(JSON.stringify(state),original,'comparison does not apply a layout');
 assert.match($('wdaResults').textContent,/15.00 m\/s/);assert.match($('wdaResults').textContent,/5.665 N/);assert.match($('wdaResults').textContent,/OFF/);
 assert.match($('wdaResults').textContent,/Lower-mass comparison/);assert.match($('wdaResults').textContent,/Stiffness comparison/);
 assert.match($('wdaResults').textContent,/no full-wing optimum/);assert.match($('wdaResults').textContent,/Geometry effects/);
 $('wdaCSV').click();assert.equal(downloads[0],'Wing_design_comparison.csv');const csv=await exportedBlob.text();assert.match(csv,/applied_speed_m_s/);assert.match(csv,/spar_runouts_mm/);
 $('aeroV').value='20';$('wdaResults').querySelector('[data-wda-apply]').click();assert.equal(calls.length,0);assert.match($('wdaStatus').textContent,/changed after this comparison/);
 $('aeroV').value='15';const second=start();$('wdaCancel').click();assert.equal(second.terminated,true);assert.match($('wdaStatus').textContent,/cancelled/);deliver(second);assert.match($('wdaStatus').textContent,/cancelled/,'obsolete worker response ignored');
 const third=start();deliver(third);$('aeroV').value='16';$('aeroV').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal($('wdaCSV').disabled,true);assert.ok([...$('wdaResults').querySelectorAll('[data-wda-apply]')].every(b=>b.disabled),'changed draft immediately invalidates visible actions');
 $('aeroV').value='15';const fourth=start();deliver(fourth);const chosen=$('wdaResults').querySelector('[data-wda-apply]');chosen.click();await Promise.resolve();
 assert.equal(calls[0][0],'apply');assert.equal(calls[1][0],'solve');assert.ok([...$('wdaResults').querySelectorAll('[data-wda-apply]')].every(b=>b.disabled));
 assert.equal($('wdaCSV').disabled,true,'old report cannot be exported after applying a layout');
 console.log(JSON.stringify({passed:true,actualReportRendered:true,flightBasisVisible:true,bothGoalsVisible:true,workerSnapshotAndProgress:true,cancellationAndLateResponse:true,flowDraftInvalidatesApply:true,csvBasisAndRunouts:true,applyUsesNormalValidationThenSolve:true,comparisonDoesNotMutateStudy:true,browserUsed:false},null,2));
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close();});
