// Exercise native imported teaching cases through the real served controller.
// Only the Worker transport is replaced; this test never fabricates a numerical result.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),app=path.join(root,'docs/wing-panel-stress-analyzer');
const {JSDOM}=require(process.env.MIE446_JSDOM_MODULE||path.join(root,'output/ui-test-deps/node_modules/jsdom'));
const {WingEngine:E,WingAeroPanel:A}=Function('module','require',fs.readFileSync(path.join(app,'nonlinear/flexible_bundle.js'),'utf8')+';return {WingEngine,WingAeroPanel};')({exports:{}},require);
const IO=require(path.join(app,'wing-aero/wing_study_io.js'));
function inputFromCase(name){
 const opts={aeroGeometryKey:raw=>IO.sha256(A.geometryKey(E.makeGeometry(raw)))};
 const imported=IO.importPrintedStudy(fs.readFileSync(path.join(app,'validation/cases/900mm-'+name+'.json'),'utf8'),E,opts);
 assert.equal(imported.ok,true,JSON.stringify(imported.errors));
 return IO.printedEngineInput(imported.state,E);
}
const rods=inputFromCase('foam-rods'),spars=inputFromCase('foam-spars'),hollow=inputFromCase('rod-bonded'),sleeve=JSON.parse(JSON.stringify(rods));sleeve.assembly.rodsBonded=false;
const receipts=[];
for(const [name,input,accepted]of [['bonded foam rods',rods,true],['bonded foam spars',spars,true],['hollow independent rods',hollow,false],['unvalidated foam sliding contact',sleeve,false]]){
 const dom=new JSDOM('<div id="app"><main class="view"></main><section id="wxResults"></section><div id="wingAeroPanel"><div class="wx-scroll"></div></div></div>',{runScripts:'outside-only',url:'https://example.test/wing-panel-stress-analyzer/'}),w=dom.window,d=w.document,workers=[];
 for(const [id,value]of Object.entries({aeroV:'15',aeroRho:'1.225',aeroAlpha:'0',aeroMu:'0.0000181',aeroSound:'340.29',aeroSequence:'fine',aeroTarget:''})){const p=d.createElement('input');p.id=id;p.value=value;d.getElementById('wingAeroPanel').append(p);}
 w.WingLabUI={engineInput:()=>input,state:()=>({emptyStudy:false}),isRunning:()=>false,aero:()=>({running:false}),importGate:()=>({open:false})};
 w.Worker=class{constructor(url){this.url=String(url);workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}};
 w.eval(fs.readFileSync(path.join(app,'nonlinear/flexible-ui.js'),'utf8'));
 d.getElementById('wingFlexibleRun').click();
 const status=d.getElementById('wingFlexibleStatus').textContent;
 assert.equal(workers.length,accepted?1:0,name+': '+status);
 if(accepted){const request=workers[0].message.request;assert.equal(request.input.geometry.construction,'solid-foam');assert.equal(request.flow.speed,15);assert.equal(request.flow.alphaDeg,0);assert.equal(request.settings.sequence,'fine');assert.deepEqual(JSON.parse(JSON.stringify(request.input.geometry.rodFractions)),input.geometry.rodFractions);if(input.geometry.rodFractions.length)assert.equal(request.input.assembly.rodsBonded,true);d.getElementById('wingFlexibleCancel').click();assert.equal(workers[0].terminated,true);}
 else assert.match(status,name.includes('foam')?/foam.*bond|sliding.*foam/i:/independent beam fields/i);
 receipts.push({name,workerStarted:workers.length===1,status});dom.window.close();
}
console.log(JSON.stringify({passed:true,scope:'Real imported inputs and real controller; transport and admission only, not a fabricated scientific solve.',cases:receipts},null,2));
