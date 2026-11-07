// Test the real controller with a fake transport only. Results are a saved
// numerical solve; no DOM stub supplies or fabricates scientific expectations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),app=path.join(root,'docs/wing-panel-stress-analyzer');
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(root,'output/flexible-wing-current/test-deps/node_modules/jsdom'));
const actual=JSON.parse(fs.readFileSync(path.join(root,'output/flexible-wing-current/checked-result.json'),'utf8'));
const dom=new JSDOM('<div id="app"><main class="view"></main><section id="wxResults"></section><div id="wingAeroPanel"><div class="wx-scroll"></div></div></div>',{runScripts:'outside-only',url:'https://example.test/wing-panel-stress-analyzer/'}),w=dom.window,d=w.document;
for(const [id,value]of Object.entries({aeroV:'50',aeroRho:'1.225',aeroAlpha:'2',aeroMu:'0.0000181',aeroSound:'340.29',aeroSequence:'standard',aeroTarget:''})){const p=d.createElement('input');p.id=id;p.value=value;d.getElementById('wingAeroPanel').append(p);}
const input={geometry:{semiSpan:900,rootChord:260,tipChord:100,skin:1.2},load:{selfWeight:false},pla:{E:2000},assembly:{seamsBonded:true}},workers=[];let downloaded;
w.WingLabUI={engineInput:()=>input,state:()=>({emptyStudy:false}),isRunning:()=>false,aero:()=>({running:false}),importGate:()=>({open:false})};
w.Worker=class{constructor(url){this.url=String(url);workers.push(this);}postMessage(m){this.message=m;}terminate(){this.terminated=true;}};
w.Blob=class{constructor(parts){this.text=parts.join('');}};w.downloadNamedLabFile=(name,blob)=>{downloaded={name,blob};};
w.eval(fs.readFileSync(path.join(app,'nonlinear/flexible-ui.js'),'utf8'));
const $=id=>d.getElementById(id),fire=(worker,kind,extra={})=>worker.onmessage({data:{id:worker.message.id,kind,...extra}});
$('wingFlexibleRun').click();assert.equal(workers.length,1);assert.equal($('wingFlexibleRun').disabled,true);$('wingFlexibleRun').click();assert.equal(workers.length,1,'duplicate solve suppressed');fire(workers[0],'progress',{text:'Pressure iteration 3'});assert.match($('wingFlexibleStatus').textContent,/Pressure iteration/);
fire(workers[0],'complete',{result:actual});assert.equal($('wingFlexibleRun').disabled,false);assert.equal($('wingFlexibleResult').hidden,false);assert.equal(d.querySelectorAll('.wf-chart svg').length,5);assert.ok(d.querySelector('.wf-output').textContent.includes('airfoil-incidence'));assert.equal(d.querySelectorAll('.wf-chart path[stroke-width="2.5"]').length,12);
input.geometry.skin=1.3;d.getElementById('aeroV').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.querySelector('[data-wf-validity]').textContent,/OUT OF DATE/);
[...d.querySelectorAll('.wf-head button')].find(b=>/Download/.test(b.textContent)).click();assert.equal(JSON.parse(downloaded.blob.text).input.geometry.skin,1.2,'export retains the actual solved input snapshot');
const out=path.join(root,'output/flexible-wing-current');fs.mkdirSync(out,{recursive:true});for(const [i,svg]of [...d.querySelectorAll('.wf-chart svg')].entries())fs.writeFileSync(path.join(out,`profile-${i+1}.svg`),svg.outerHTML);
$('wingFlexibleRun').click();const cancelled=workers.at(-1);$('wingFlexibleCancel').click();assert.equal(cancelled.terminated,true);fire(cancelled,'complete',{result:actual});assert.equal(w.WingFlexibleUI.result,null,'late cancelled result cannot revive an old study');
$('wingFlexibleRun').click();const current=workers.at(-1);fire(cancelled,'error',{text:'stale error'});assert.equal(current.terminated,undefined,'stale error cannot terminate a new solve');fire(current,'error',{text:'Deliberate nonconvergence'});assert.match($('wingFlexibleStatus').textContent,/No accepted coupled result/);assert.equal(w.WingFlexibleUI.result,null);
console.log('PASS: real controller rendering, frozen-case export, stale qualification, cancellation/late-message races, nonconvergence refusal, duplicate suppression and five physical profile charts.');dom.window.close();
